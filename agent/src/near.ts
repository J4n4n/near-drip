// Drip agent — NEAR testnet connection (near-api-js v7).
// TESTNET ONLY. The agent spends via a scoped function-call key on the
// treasury account (receiver = contract, method = ["spend"], small allowance);
// the owner full-access key is used ONLY for set_policy, never leaves the server.
import { readFileSync } from "node:fs";
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  KeyPairSigner,
  type KeyPairString,
} from "near-api-js";
import {
  AGENT_KEY_PATH,
  CONTRACT_ID,
  OWNER_ACCOUNT_ID,
  OWNER_KEY_PATH,
  RPC_URL,
  explorerTxUrl,
} from "./config.js";

export interface Policy {
  max_spend_per_call_yocto: string;
  daily_cap_yocto: string;
  allowlist: string[];
  kill_switch: boolean;
  owner: string;
  agent_account_id: string;
}

export interface Stats {
  balance_yocto: string;
  spent_today_yocto: string;
  total_spent_yocto: string;
  entries: number;
}

export interface LedgerEntry {
  id: number;
  timestamp_ms: number;
  payee: string;
  amount_yocto: string;
  purpose: string;
  status: "approved" | "blocked";
  reason?: string;
}

export interface SpendResult {
  success: boolean;
  reason?: string;
  entryId?: number;
  txHash: string;
  explorerUrl: string;
}

const provider = new JsonRpcProvider({ url: RPC_URL });

interface KeyFile {
  account_id: string;
  public_key: string;
  secret_key: string;
}

function loadKeyFile(path: string): KeyFile {
  return JSON.parse(readFileSync(path, "utf8")) as KeyFile;
}

function accountWithKey(accountId: string, secretKey: string): Account {
  const keyPair = KeyPair.fromString(secretKey as KeyPairString);
  return new Account(accountId, provider, new KeyPairSigner(keyPair));
}

/** True once the contract account actually has code deployed. */
export async function isContractDeployed(): Promise<boolean> {
  const state = await provider.viewAccount({ accountId: CONTRACT_ID });
  return state.code_hash !== "11111111111111111111111111111111";
}

async function view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = await provider.callFunction({
    contractId: CONTRACT_ID,
    method,
    args,
  });
  if (result === undefined) throw new Error(`view ${method}: empty result`);
  return result as T;
}

export async function getPolicy(): Promise<Policy> {
  return view<Policy>("get_policy");
}

export async function getStats(): Promise<Stats> {
  return view<Stats>("get_stats");
}

export async function getLedger(): Promise<LedgerEntry[]> {
  return view<LedgerEntry[]>("get_ledger");
}

/**
 * spend() with the agent's scoped function-call key.
 * The contract requires predecessor == contract account — exactly what a
 * function-call key on that account gives. The key can ONLY call spend().
 */
export async function spend(args: {
  payee: string;
  amount_yocto: string;
  purpose: string;
}): Promise<SpendResult> {
  const key = loadKeyFile(AGENT_KEY_PATH);
  const account = accountWithKey(key.account_id, key.secret_key);
  const outcome = await account.callFunctionRaw({
    contractId: CONTRACT_ID,
    methodName: "spend",
    args,
    gas: 30_000_000_000_000n,
  });
  const txHash: string =
    (outcome as { transaction?: { hash?: string } }).transaction?.hash ?? "";
  // getTransactionLastResult parses the contract's return value
  // ({ success, reason?, entry_id? }) from the raw outcome.
  let result: { success: boolean; reason?: string; entry_id?: number } = {
    success: true,
  };
  try {
    const { getTransactionLastResult } = await import("near-api-js");
    result = getTransactionLastResult(outcome) as typeof result;
  } catch {
    // Fall through: success stays true unless the tx itself failed.
  }
  const failed =
    (outcome as { status?: { Failure?: unknown } }).status?.Failure !== undefined;
  return {
    success: failed ? false : result.success,
    reason: result.reason,
    entryId: result.entry_id,
    txHash,
    explorerUrl: explorerTxUrl(txHash),
  };
}

/**
 * set_policy with the OWNER full-access key.
 * TESTNET ONLY, local demo endpoint only (POST /policy) — the owner key never
 * leaves this server and is never sent to any client.
 */
export async function setPolicyWithOwnerKey(
  policy: Partial<{
    max_spend_per_call_yocto: string;
    daily_cap_yocto: string;
    allowlist: string[];
    kill_switch: boolean;
  }>,
): Promise<Policy> {
  const key = loadKeyFile(OWNER_KEY_PATH);
  const account = accountWithKey(OWNER_ACCOUNT_ID, key.secret_key);
  return account.callFunction<Policy>({
    contractId: CONTRACT_ID,
    methodName: "set_policy",
    args: policy,
    gas: 30_000_000_000_000n,
  });
}
