// Drip agent — rules decision engine.
// Same interface as ai.ts decide(): buy if the quote is good value, else hold.
import type { Quote } from "./oneclick.js";

export type Decision = "buy" | "hold" | "skip";

export interface DecisionResult {
  decision: Decision;
  reason: string;
}

/** Buy if 10 USDC buys at least $9.90 of SOL (i.e. slippage/fees < 1%). */
export const BUY_THRESHOLD_USD = 9.9;

export function decide(quote: Quote): DecisionResult {
  const outUsd = Number(quote.amountOutUsd);
  if (!Number.isFinite(outUsd)) {
    return { decision: "skip", reason: `quote amountOutUsd unusable: ${quote.amountOutUsd}` };
  }
  if (outUsd >= BUY_THRESHOLD_USD) {
    return {
      decision: "buy",
      reason: `10 USDC -> $${outUsd.toFixed(4)} of SOL (>= $${BUY_THRESHOLD_USD} threshold): price is good, DCA today`,
    };
  }
  return {
    decision: "hold",
    reason: `10 USDC -> $${outUsd.toFixed(4)} of SOL (< $${BUY_THRESHOLD_USD} threshold): price too bad, skip today's DCA`,
  };
}
