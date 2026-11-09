// Drip agent key setup (TESTNET ONLY) — idempotent.
// Generates a fresh ed25519 keypair, adds it as a FUNCTION-CALL access key on
// the treasury account (receiver = contract, method_names = ["spend"],
// allowance 0.1 NEAR), and stores the agent key at
// .near-credentials/agent-key.json (gitignored, chmod 600).
// The contract's spend() requires predecessor == contract account — exactly
// what a function-call key on that account gives. The agent key can ONLY call
// spend(); it cannot move funds any other way.
// Usage: npm run setup-agent-key   (from agent/ or repo root)
import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  KeyPairSigner,
  parseNearAmount,
} from "near-api-js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONTRACT_ID = process.env.CONTRACT_ID ?? "drip-treasury-2026.testnet";
const RPC_URL = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.near.org";
const OWNER_KEY_PATH = join(REPO_ROOT, ".near-credentials", "treasury.json");
const AGENT_KEY_PATH = join(REPO_ROOT, ".near-credentials", "agent-key.json");
const ALLOWANCE_NEAR = "0.1";

const owner = JSON.parse(readFileSync(OWNER_KEY_PATH, "utf8"));
const provider = new JsonRpcProvider({ url: RPC_URL });
const ownerAccount = new Account(
  owner.account_id,
  provider,
  KeyPairSigner.fromSecretKey(owner.secret_key),
);

let agentKey;
if (existsSync(AGENT_KEY_PATH)) {
  agentKey = JSON.parse(readFileSync(AGENT_KEY_PATH, "utf8"));
  console.log(`Agent key file already exists: ${AGENT_KEY_PATH}`);
} else {
  const kp = KeyPair.fromRandom("ed25519");
  agentKey = {
    account_id: CONTRACT_ID,
    public_key: kp.getPublicKey().toString(),
    secret_key: kp.toString(),
  };
  writeFileSync(AGENT_KEY_PATH, JSON.stringify(agentKey, null, 2) + "\n");
  chmodSync(AGENT_KEY_PATH, 0o600);
  console.log(`Generated agent key: ${AGENT_KEY_PATH} (chmod 600)`);
}

// Idempotency: is this public key already a function-call key on the account?
try {
  const accessKey = await provider.viewAccessKey({
    accountId: CONTRACT_ID,
    publicKey: agentKey.public_key,
  });
  const perm = accessKey.permission;
  if (
    perm !== "FullAccess" &&
    perm?.FunctionCall?.receiver_id === CONTRACT_ID &&
    (perm.FunctionCall.method_names ?? []).includes("spend")
  ) {
    console.log(
      `Already set up: ${agentKey.public_key} is a spend-only function-call key on ${CONTRACT_ID} (allowance ${accessKey.permission.FunctionCall.allowance ?? "unlimited"} yocto).`,
    );
    process.exit(0);
  }
  console.log(`Key ${agentKey.public_key} exists on the account but with different permission — re-adding as spend-only...`);
} catch {
  console.log(`Key not on account yet — adding...`);
}

const outcome = await ownerAccount.addFunctionCallAccessKey({
  publicKey: agentKey.public_key,
  contractId: CONTRACT_ID,
  methodNames: ["spend"],
  allowance: parseNearAmount(ALLOWANCE_NEAR),
});
console.log(
  `Added function-call key ${agentKey.public_key} on ${CONTRACT_ID} ` +
    `(receiver=${CONTRACT_ID}, methods=["spend"], allowance=${ALLOWANCE_NEAR} NEAR).`,
);
console.log(`Tx: ${outcome.transaction?.hash}`);
console.log(
  `Explorer: https://explorer.testnet.near.org/transactions/${outcome.transaction?.hash}`,
);
