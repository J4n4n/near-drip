// Drip agent — shared config.
// TESTNET ONLY. No mainnet, no real money anywhere in this demo.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Minimal .env loader (no extra dependency): loads <repo-root>/.env if present.
// Real env vars always win over the file.
const AGENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = join(AGENT_DIR, "..");

function loadDotEnv(): void {
  const candidates = [join(REPO_ROOT, ".env"), join(AGENT_DIR, ".env")];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || m[1].startsWith("#")) continue;
      if (process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
    break;
  }
}
loadDotEnv();

export const CONTRACT_ID =
  process.env.CONTRACT_ID ?? "drip-treasury-2026.testnet";
export const OWNER_ACCOUNT_ID =
  process.env.OWNER_ACCOUNT_ID ?? "drip-treasury-2026.testnet";
export const PAYEE_ACCOUNT_ID =
  process.env.PAYEE_ACCOUNT_ID ?? "drip-payee-2026.testnet";
export const RPC_URL =
  process.env.NEAR_RPC_URL ?? "https://rpc.testnet.near.org";
export const ONECLICK_QUOTE_URL =
  process.env.ONECLICK_URL ?? "https://1click.chaindefuser.com/v0/quote";
export const ONECLICK_TOKENS_URL = "https://1click.chaindefuser.com/v0/tokens";
export const AGENT_PORT = Number(process.env.AGENT_PORT ?? 3001);
export const NEAR_AI_API_KEY = process.env.NEAR_AI_API_KEY || "";

/** The quote fee Drip pays per price quote: $0.003. 30 days = $0.09 vs $29/mo subscription. */
export const QUOTE_FEE_USD = 0.003;
export const SUBSCRIPTION_USD = 29;

/** Resolve a key-file path: as given (relative to repo root or CWD), else under .near-credentials/. */
export function resolveKeyPath(p: string): string {
  const candidates = [
    p,
    join(REPO_ROOT, p),
    join(AGENT_DIR, p),
    join(REPO_ROOT, ".near-credentials", p),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  // Default location for a fresh file.
  return join(REPO_ROOT, p.startsWith(".near-credentials") ? p : `.near-credentials/${p}`);
}

export const OWNER_KEY_PATH = resolveKeyPath(
  process.env.OWNER_KEY_PATH ?? ".near-credentials/treasury.json",
);
export const AGENT_KEY_PATH = resolveKeyPath(
  process.env.AGENT_KEY_PATH ?? ".near-credentials/agent-key.json",
);

export function explorerTxUrl(txHash: string): string {
  return `https://explorer.testnet.near.org/transactions/${txHash}`;
}
export function explorerAccountUrl(accountId: string): string {
  return `https://explorer.testnet.near.org/accounts/${accountId}`;
}
