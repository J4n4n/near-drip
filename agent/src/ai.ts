// Drip agent — AI decision layer (thin stub).
// SAME interface as decision.ts decide().
// If NEAR_AI_API_KEY is set, asks NEAR AI Cloud (OpenAI-compatible chat API)
// for a buy/hold call; any failure, ambiguity or missing key falls back to the
// rules engine. The rules engine is the default — do NOT spend time chasing
// free AI credits; the deterministic rule is the shipped behaviour.
import { decide as decideRules, type DecisionResult } from "./decision.js";
import type { Quote } from "./oneclick.js";
import { NEAR_AI_API_KEY } from "./config.js";

const NEAR_AI_URL = "https://cloud.near.ai/api/v1/chat/completions";

export async function decide(quote: Quote): Promise<DecisionResult> {
  if (!NEAR_AI_API_KEY) return decideRules(quote);
  try {
    const res = await fetch(NEAR_AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NEAR_AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-70b-instruct",
        messages: [
          {
            role: "system",
            content:
              "You decide a $10/day SOL DCA. Reply with exactly one word: buy or hold. " +
              "Buy if 10 USDC buys at least $9.90 of SOL, else hold.",
          },
          {
            role: "user",
            content: `Quote: 10 USDC -> ${quote.amountOutFormatted} SOL = $${quote.amountOutUsd} (est. ${quote.timeEstimate}s). Buy or hold?`,
          },
        ],
        max_tokens: 10,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`NEAR AI HTTP ${res.status}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const word = data.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "";
    if (word.startsWith("buy")) {
      return { decision: "buy", reason: "NEAR AI Cloud: buy" };
    }
    if (word.startsWith("hold")) {
      return { decision: "hold", reason: "NEAR AI Cloud: hold" };
    }
    throw new Error(`NEAR AI unparseable reply: ${word}`);
  } catch (err) {
    const rules = decideRules(quote);
    return {
      ...rules,
      reason: `${rules.reason} (AI unavailable, rules fallback: ${err instanceof Error ? err.message : String(err)})`,
    };
  }
}
