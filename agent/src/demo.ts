// Drip agent — CLI one-shot: runs one day and prints a human summary + JSON receipt.
// Usage: npm run demo   (from agent/ or repo root)
import { ContractNotDeployedError, runOneDay } from "./loop.js";
import { CONTRACT_ID, explorerAccountUrl } from "./config.js";

async function main(): Promise<void> {
  console.log("=== Drip — one day (NEAR testnet) ===");
  console.log(`Contract: ${CONTRACT_ID}  (${explorerAccountUrl(CONTRACT_ID)})`);
  try {
    const r = await runOneDay();
    console.log(`\nDate: ${r.date}`);
    console.log(
      `Quote (dry, live 1Click): 10 USDC -> ${r.quote.amountOutFormatted} SOL ` +
        `($${r.quote.amountOutUsd}, ~${r.quote.timeEstimate}s)`,
    );
    console.log(`Decision: ${r.decision.decision.toUpperCase()} — ${r.decision.reason}`);
    console.log(
      `Quote fee: $${r.cost.todayUsd} = ${r.feeNear} NEAR ` +
        `(wNEAR $${r.nearPriceUsd.toFixed(4)})`,
    );
    console.log(
      `Policy: max/call ${Number(r.policy.max_spend_per_call_yocto) / 1e24} NEAR, ` +
        `daily cap ${Number(r.policy.daily_cap_yocto) / 1e24} NEAR, ` +
        `kill switch ${r.policy.kill_switch ? "ON" : "off"}, ` +
        `allowlist [${r.policy.allowlist.join(", ")}]`,
    );
    console.log(
      `Stats: balance ${Number(r.stats.balance_yocto) / 1e24} NEAR, ` +
        `spent today ${Number(r.stats.spent_today_yocto) / 1e24} NEAR, ` +
        `entries ${r.stats.entries}`,
    );
    if (r.spend) {
      console.log(
        `\nSpend: ${r.spend.success ? "APPROVED" : "BLOCKED"} ` +
          `(entry #${r.spend.entryId ?? "?"})${r.spend.reason ? ` — ${r.spend.reason}` : ""}`,
      );
      console.log(`Tx: ${r.spend.txHash}`);
      console.log(`Explorer: ${r.spend.explorerUrl}`);
    } else {
      console.log(`\nSpend skipped: ${r.spendSkippedReason}`);
    }
    console.log(
      `\nCost: today $${r.cost.todayUsd.toFixed(3)} · 30 days $${r.cost.monthProjectionUsd.toFixed(2)} ` +
        `· subscription $${r.cost.subscriptionUsd.toFixed(2)} ` +
        `(${(r.cost.subscriptionUsd / r.cost.monthProjectionUsd).toFixed(0)}x cheaper)`,
    );
    console.log("\n--- receipt (JSON) ---");
    console.log(JSON.stringify(r, null, 2));
  } catch (err) {
    if (err instanceof ContractNotDeployedError) {
      const p = err.partial;
      console.log(`\nDate: ${p.date}`);
      console.log(
        `Quote (dry, live 1Click): 10 USDC -> ${p.quote.amountOutFormatted} SOL ` +
          `($${p.quote.amountOutUsd}, ~${p.quote.timeEstimate}s)`,
      );
      console.log(`Decision: ${p.decision.decision.toUpperCase()} — ${p.decision.reason}`);
      console.log(
        `Quote fee: $0.003 = ${p.feeNear} NEAR (wNEAR $${p.nearPriceUsd.toFixed(4)})`,
      );
      console.log(`Cost: today $0.003 · 30 days $0.09 · subscription $29.00 (322x cheaper)`);
      console.error(`\nCONTRACT NOT DEPLOYED YET: ${err.message}`);
      console.error(
        "Nothing was spent and no receipt was faked. Re-run once the contract is deployed.",
      );
      process.exitCode = 2;
      return;
    }
    console.error("\nDemo failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

void main();
