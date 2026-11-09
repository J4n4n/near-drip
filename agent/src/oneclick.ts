// Drip agent — live 1Click quotes (NEAR Intents).
// Dry quotes only: no API key, no deposit, no swap is ever executed.
// The real mainnet swap is NEVER executed by this code — Drip builds the
// quote and stops. Settlement would be a one-line change (deposit to the
// quote's depositAddress); it is deliberately not done here.
import { randomBytes } from "node:crypto";
import { ONECLICK_QUOTE_URL, ONECLICK_TOKENS_URL } from "./config.js";

// Asset IDs verified live 2026-11-07 (see docs/spike-1click.md) — do NOT guess.
export const USDC_ON_SOL =
  "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near";
export const SOL = "nep141:sol.omft.near";
export const WRAP_NEAR = "nep141:wrap.near";

export interface Quote {
  amountIn: string;
  amountInFormatted: string;
  amountInUsd: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd: string;
  timeEstimate: number;
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** A fresh random 32-byte base58 address. Only used as recipient/refundTo of a
 *  dry quote — no funds ever go to it. The all-zero address is rejected by 1Click. */
export function randomSolanaAddress(): string {
  const bytes = randomBytes(32);
  // base58 encode
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = BASE58[Number(n % 58n)] + out;
    n /= 58n;
  }
  // leading zero bytes -> leading '1's
  let leading = 0;
  for (const b of bytes) {
    if (b === 0) leading++;
    else break;
  }
  return "1".repeat(leading) + out;
}

/**
 * Dry 1Click quote: 10 USDC (Solana) -> SOL. No key, no deposit, no swap.
 * Returns the parsed quote; amountOutUsd is what the decision engine uses.
 */
export async function getDryQuote(): Promise<Quote> {
  const address = randomSolanaAddress();
  const deadline = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const res = await fetch(ONECLICK_QUOTE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dry: true,
      swapType: "EXACT_INPUT",
      slippageTolerance: 100,
      originAsset: USDC_ON_SOL,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: SOL,
      amount: "10000000", // 10 USDC, 6 decimals
      refundTo: address,
      refundType: "ORIGIN_CHAIN",
      recipient: address,
      recipientType: "DESTINATION_CHAIN",
      deadline,
    }),
  });
  if (!res.ok) {
    throw new Error(`1Click quote failed: HTTP ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { quote: Quote };
  if (!data.quote?.amountOutUsd) throw new Error("1Click quote: unexpected response shape");
  return data.quote;
}

/** Live wNEAR price in USD from the keyless 1Click tokens list. */
export async function getNearPriceUsd(): Promise<number> {
  const res = await fetch(ONECLICK_TOKENS_URL);
  if (!res.ok) {
    throw new Error(`1Click tokens failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as unknown;
  const list: unknown[] = Array.isArray(data)
    ? data
    : (data as { tokens?: unknown[] }).tokens ?? [];
  const entry = list.find(
    (t) => (t as { assetId?: string }).assetId === WRAP_NEAR,
  ) as { price?: string | number; priceUsd?: string | number } | undefined;
  if (!entry) throw new Error(`wNEAR (${WRAP_NEAR}) not found in 1Click tokens list`);
  const price = Number(entry.price ?? entry.priceUsd);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`wNEAR price unusable: ${JSON.stringify(entry)}`);
  }
  return price;
}

/**
 * Convert a USD amount to yoctoNEAR at the given NEAR price, using integer
 * math (price to 6 decimals) so no float dust leaks into the on-chain amount.
 */
export function usdToYocto(usd: number, nearPriceUsd: number): string {
  const priceMicro = BigInt(Math.round(nearPriceUsd * 1e6)); // 6 decimals
  const usdMicro = BigInt(Math.round(usd * 1e6));
  const yocto = (usdMicro * 10n ** 24n) / priceMicro;
  return yocto.toString();
}
