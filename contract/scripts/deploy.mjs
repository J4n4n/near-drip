// Deploy the Drip treasury contract to NEAR testnet — re-runnable.
//
//   npm run deploy          (from contract/)
//   CONTRACT_ID=drip-treasury-2026.testnet node scripts/deploy.mjs
//
// Reads the full-access key from ../../.near-credentials/treasury.json
// (gitignored, chmod 600 — never print the secret key), deploys
// build/contract.wasm to the treasury account, and calls init() the
// first time (skipped on re-runs: NEAR keeps state across redeploys and
// init() throws "Contract already initialized").
//
// TESTNET ONLY. No mainnet, no real money.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, keyStores, KeyPair } from "near-api-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CONTRACT_DIR = path.resolve(__dirname, "..");

const CONTRACT_ID =
  process.env.CONTRACT_ID ?? "drip-treasury-2026.testnet";
const OWNER = process.env.OWNER_ACCOUNT_ID ?? CONTRACT_ID;
const KEY_PATH =
  process.env.OWNER_KEY_PATH ??
  path.join(REPO_ROOT, ".near-credentials", "treasury.json");
const WASM_PATH = path.join(CONTRACT_DIR, "build", "contract.wasm");

const NETWORK = {
  networkId: "testnet",
  nodeUrl: "https://rpc.testnet.near.org",
  walletUrl: "https://wallet.testnet.near.org",
  helperUrl: "https://helper.testnet.near.org",
  explorerUrl: "https://explorer.testnet.near.org",
};

const TGAS = (n) => BigInt(n) * 1_000_000_000_000n;

async function main() {
  if (!fs.existsSync(WASM_PATH)) {
    throw new Error(
      `built contract not found at ${WASM_PATH} — run "npm run build" first`,
    );
  }
  const keyFile = JSON.parse(fs.readFileSync(KEY_PATH, "utf8"));
  if (keyFile.account_id !== CONTRACT_ID) {
    throw new Error(
      `key file ${KEY_PATH} is for ${keyFile.account_id}, expected ${CONTRACT_ID}`,
    );
  }
  const keyPair = KeyPair.fromString(keyFile.secret_key);
  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey(NETWORK.networkId, CONTRACT_ID, keyPair);

  const near = await connect({ ...NETWORK, keyStore });
  const account = await near.account(CONTRACT_ID);

  console.log(`Deploying ${WASM_PATH} to ${CONTRACT_ID} ...`);
  const deployOutcome = await account.deployContract(
    fs.readFileSync(WASM_PATH),
  );
  console.log(
    `Deployed. tx: ${deployOutcome.transaction.hash}\n` +
      `  https://explorer.testnet.near.org/transactions/${deployOutcome.transaction.hash}`,
  );

  // init() once: it throws "Contract already initialized" on re-runs,
  // and NEAR state survives redeploys — so check first via a view call.
  let alreadyInitialized = false;
  try {
    const policy = await account.viewFunction({
      contractId: CONTRACT_ID,
      methodName: "get_policy",
      args: {},
    });
    alreadyInitialized = true;
    console.log("Contract already initialized, skipping init().");
    console.log(`  owner: ${policy.owner}`);
    console.log(`  agent_account_id: ${policy.agent_account_id}`);
  } catch {
    console.log("Contract not initialized yet — calling init() ...");
  }

  if (!alreadyInitialized) {
    const initOutcome = await account.functionCall({
      contractId: CONTRACT_ID,
      methodName: "init",
      args: { owner: OWNER },
      gas: TGAS(30),
      attachedDeposit: 0n,
    });
    console.log(
      `init() done. tx: ${initOutcome.transaction.hash}\n` +
        `  https://explorer.testnet.near.org/transactions/${initOutcome.transaction.hash}`,
    );
    const policy = await account.viewFunction({
      contractId: CONTRACT_ID,
      methodName: "get_policy",
      args: {},
    });
    console.log("Policy after init:", JSON.stringify(policy, null, 2));
  }

  console.log(`\nContract: ${CONTRACT_ID}`);
  console.log(
    `Explorer: https://explorer.testnet.near.org/accounts/${CONTRACT_ID}`,
  );
}

main().catch((err) => {
  console.error("deploy failed:", err.message ?? err);
  process.exit(1);
});
