// Prove the Drip treasury contract on testnet — re-runnable.
//
//   node scripts/prove.mjs
//
// (a) one APPROVED spend to drip-payee-2026.testnet via the agent's
//     scoped function-call key (.near-credentials/agent-key.json),
//     verifying the transfer landed (payee balance +amount) and the
//     ledger entry is approved;
// (b) one BLOCKED spend with kill_switch ON (same key), verifying the
//     ledger entry is blocked with reason kill_switch_on and the payee
//     balance is unchanged — then kill_switch back OFF.
// Also checks (c) spend from any other account returns unauthorized
//     and appends no ledger entry.
//
// Policy changes use the owner (treasury) full-access key.
// Prints tx hashes + explorer links for every step.
// TESTNET ONLY.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, keyStores, KeyPair } from "near-api-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const CONTRACT_ID = "drip-treasury-2026.testnet";
const PAYEE = "drip-payee-2026.testnet";
const AMOUNT_YOCTO = "1000000000000000000000"; // 0.001 NEAR (one quote fee)

const NETWORK = {
  networkId: "testnet",
  nodeUrl: "https://rpc.testnet.near.org",
  walletUrl: "https://wallet.testnet.near.org",
  helperUrl: "https://helper.testnet.near.org",
  explorerUrl: "https://explorer.testnet.near.org",
};
const TGAS = (n) => BigInt(n) * 1_000_000_000_000n;
const txUrl = (h) => `https://explorer.testnet.near.org/transactions/${h}`;

function loadKey(name) {
  return JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, ".near-credentials", name), "utf8"),
  );
}

async function connectWith(keyFile, accountId) {
  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey(
    NETWORK.networkId,
    accountId,
    KeyPair.fromString(keyFile.secret_key),
  );
  const near = await connect({ ...NETWORK, keyStore });
  return near.account(accountId);
}

function decodeReturn(outcome) {
  const v = outcome?.status?.SuccessValue;
  if (v === undefined || v === "") return undefined;
  return JSON.parse(Buffer.from(v, "base64").toString("utf8"));
}

async function view(account, methodName, args = {}) {
  return account.viewFunction({
    contractId: CONTRACT_ID,
    methodName,
    args,
  });
}

async function call(account, methodName, args) {
  const outcome = await account.functionCall({
    contractId: CONTRACT_ID,
    methodName,
    args,
    gas: TGAS(30),
    attachedDeposit: 0n,
  });
  return { outcome, value: decodeReturn(outcome) };
}

async function txReceipts(txHash, senderAccountId) {
  const res = await fetch(NETWORK.nodeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "drip-prove",
      method: "EXPERIMENTAL_tx_status",
      params: [txHash, senderAccountId],
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`tx status lookup failed: ${json.error.message}`);
  return json.result.receipts ?? [];
}

function transferTo(receipts, receiverId) {
  // Returns the transferred yocto (string) of the first Transfer receipt
  // to receiverId, or null. Balance-delta checks are NOT used: the agent
  // backend (built in parallel) moves funds on the same accounts, so a
  // balance read before/after is racy. The tx's own receipts are exact.
  for (const r of receipts) {
    if (r.receiver_id !== receiverId) continue;
    for (const a of r.receipt?.Action?.actions ?? []) {
      if (a.Transfer) return a.Transfer.deposit;
    }
  }
  return null;
}

async function main() {
  const treasuryKey = loadKey("treasury.json");
  const agentKey = loadKey("agent-key.json");
  const payeeKey = loadKey("payee.json");

  const near = await connect({ ...NETWORK, keyStore: new keyStores.InMemoryKeyStore() });
  const owner = await connectWith(treasuryKey, CONTRACT_ID);
  const agent = await connectWith(agentKey, CONTRACT_ID);
  const stranger = await connectWith(payeeKey, PAYEE);

  const report = { contract: CONTRACT_ID, steps: {} };

  const policy0 = await view(owner, "get_policy");
  console.log("policy:", JSON.stringify(policy0));
  if (policy0.kill_switch) {
    console.log("kill_switch was ON — turning OFF first");
    await call(owner, "set_policy", { kill_switch: false });
  }
  const stats0 = await view(owner, "get_stats");
  const payeeBefore = await (await near.account(PAYEE)).getAccountBalance();
  console.log("stats before:", JSON.stringify(stats0));
  console.log("payee balance before (informational):", payeeBefore.total);

  // (c) unauthorized: spend signed by the payee account, not the treasury.
  const unauth = await call(stranger, "spend", {
    payee: PAYEE,
    amount_yocto: AMOUNT_YOCTO,
    purpose: "drip proof: unauthorized attempt",
  });
  console.log("\n(c) unauthorized spend:", JSON.stringify(unauth.value));
  console.log("    tx:", txUrl(unauth.outcome.transaction.hash));
  if (unauth.value?.success !== false || unauth.value?.reason !== "unauthorized") {
    throw new Error("expected unauthorized spend to fail with reason unauthorized");
  }
  const ledgerAfterUnauth = await view(owner, "get_ledger");
  // Length comparison would be racy: the agent backend (built in
  // parallel) also appends entries. Check by purpose instead.
  if (
    ledgerAfterUnauth.some(
      (e) => e.purpose === "drip proof: unauthorized attempt",
    )
  ) {
    throw new Error("unauthorized spend must not append a ledger entry");
  }
  report.steps.unauthorized = {
    tx: unauth.outcome.transaction.hash,
    url: txUrl(unauth.outcome.transaction.hash),
    result: unauth.value,
  };

  // (a) approved spend via the agent's scoped function-call key.
  const ok = await call(agent, "spend", {
    payee: PAYEE,
    amount_yocto: AMOUNT_YOCTO,
    purpose: "drip proof: approved spend (0.001 NEAR quote fee)",
  });
  console.log("\n(a) approved spend:", JSON.stringify(ok.value));
  console.log("    tx:", txUrl(ok.outcome.transaction.hash));
  if (ok.value?.success !== true || typeof ok.value?.entry_id !== "number") {
    throw new Error("expected approved spend to succeed with an entry_id");
  }
  const ledgerAfterOk = await view(owner, "get_ledger");
  const entryA = ledgerAfterOk[ok.value.entry_id];
  console.log("    ledger entry:", JSON.stringify(entryA));
  if (entryA?.status !== "approved") throw new Error("ledger entry not approved");
  const receiptsA = await txReceipts(ok.outcome.transaction.hash, CONTRACT_ID);
  const movedA = transferTo(receiptsA, PAYEE);
  console.log(`    transfer receipt to payee: ${movedA} yocto`);
  if (movedA !== AMOUNT_YOCTO) {
    throw new Error(`payee should have received exactly ${AMOUNT_YOCTO} yocto`);
  }
  report.steps.approved_spend = {
    tx: ok.outcome.transaction.hash,
    url: txUrl(ok.outcome.transaction.hash),
    result: ok.value,
    entry: entryA,
  };

  // (b) kill switch ON, then a spend that must be blocked on-chain.
  const ksOn = await call(owner, "set_policy", { kill_switch: true });
  console.log("\nkill_switch ON tx:", txUrl(ksOn.outcome.transaction.hash));
  const blocked = await call(agent, "spend", {
    payee: PAYEE,
    amount_yocto: AMOUNT_YOCTO,
    purpose: "drip proof: blocked spend (kill switch on)",
  });
  console.log("(b) blocked spend:", JSON.stringify(blocked.value));
  console.log("    tx:", txUrl(blocked.outcome.transaction.hash));
  if (
    blocked.value?.success !== false ||
    blocked.value?.reason !== "kill_switch_on"
  ) {
    throw new Error("expected blocked spend with reason kill_switch_on");
  }
  const ledgerAfterBlocked = await view(owner, "get_ledger");
  const entryB = ledgerAfterBlocked[blocked.value.entry_id];
  console.log("    ledger entry:", JSON.stringify(entryB));
  if (entryB?.status !== "blocked" || entryB?.reason !== "kill_switch_on") {
    throw new Error("ledger entry not blocked with kill_switch_on");
  }
  const receiptsB = await txReceipts(blocked.outcome.transaction.hash, CONTRACT_ID);
  const movedB = transferTo(receiptsB, PAYEE);
  console.log(`    transfer receipt to payee: ${movedB}`);
  if (movedB !== null) {
    throw new Error("blocked spend must not move funds");
  }
  report.steps.blocked_spend = {
    tx: blocked.outcome.transaction.hash,
    url: txUrl(blocked.outcome.transaction.hash),
    result: blocked.value,
    entry: entryB,
  };

  // Kill switch back OFF.
  const ksOff = await call(owner, "set_policy", { kill_switch: false });
  console.log("\nkill_switch OFF tx:", txUrl(ksOff.outcome.transaction.hash));
  const policyFinal = await view(owner, "get_policy");
  const statsFinal = await view(owner, "get_stats");
  const ledgerFinal = await view(owner, "get_ledger");
  console.log("final policy:", JSON.stringify(policyFinal));
  console.log("final stats:", JSON.stringify(statsFinal));
  console.log("final ledger entries:", ledgerFinal.length);
  if (policyFinal.kill_switch !== false) throw new Error("kill switch not off");
  report.steps.kill_switch_off_tx = ksOff.outcome.transaction.hash;
  report.final = { policy: policyFinal, stats: statsFinal, ledger: ledgerFinal };

  console.log("\nPROOF OK — all checks passed.");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error("prove failed:", err.message ?? err);
  process.exit(1);
});
