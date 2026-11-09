// Drip agent — one-day loop.
// 1. dry 1Click quote (10 USDC -> SOL, no key, no swap — the mainnet swap is
//    NEVER executed; this code stops after the quote + the testnet spend).
// 2. decide buy/hold/skip. 3. convert the $0.003 quote fee to yoctoNEAR at the
//    live wNEAR price. 4. policy check. 5. spend() on testnet if buy + allowed.
import { decide } from "./ai.js";
import {
  getDryQuote,
  getNearPriceUsd,
  usdToYocto,
  type Quote,
} from "./oneclick.js";
import {
  getPolicy,
  getStats,
  isContractDeployed,
  spend,
  type Policy,
  type Stats,
} from "./near.js";
import {
  CONTRACT_ID,
  PAYEE_ACCOUNT_ID,
  QUOTE_FEE_USD,
  SUBSCRIPTION_USD,
} from "./config.js";
import type { DecisionResult } from "./decision.js";

export class ContractNotDeployedError extends Error {
  partial: {
    date: string;
    quote: Quote;
    decision: DecisionResult;
    nearPriceUsd: number;
    feeYocto: string;
    feeNear: string;
  };

  constructor(partial: ContractNotDeployedError["partial"]) {
    super(
      `Contract not deployed yet on ${CONTRACT_ID} (no code on the account). ` +
        `Quote/decision/conversion still ran; the on-chain spend is pending the deploy.`,
    );
    this.name = "ContractNotDeployedError";
    this.partial = partial;
  }
}

export interface DayReceipt {
  date: string;
  quote: Quote;
  decision: DecisionResult;
  nearPriceUsd: number;
  feeYocto: string;
  feeNear: string;
  policy: Policy;
  stats: Stats;
  spend?: {
    txHash: string;
    explorerUrl: string;
    entryId?: number;
    success: boolean;
    reason?: string;
  };
  spendSkippedReason?: string;
  cost: { todayUsd: number; monthProjectionUsd: number; subscriptionUsd: number };
}

const fmtNear = (yocto: string): string =>
  (Number(yocto) / 1e24).toFixed(6).replace(/\.?0+$/, "") || "0";

export async function runOneDay(): Promise<DayReceipt> {
  const date = new Date().toISOString().slice(0, 10);

  // 1. Dry quote (live, keyless).
  const quote = await getDryQuote();

  // 2. Decision (AI if configured, else rules).
  const decision = await decide(quote);

  // 3. $0.003 quote fee -> yoctoNEAR at the live wNEAR price.
  const nearPriceUsd = await getNearPriceUsd();
  const feeYocto = usdToYocto(QUOTE_FEE_USD, nearPriceUsd);

  // 4. Policy check — requires the deployed contract.
  const partial = {
    date,
    quote,
    decision,
    nearPriceUsd,
    feeYocto,
    feeNear: fmtNear(feeYocto),
  };
  if (!(await isContractDeployed())) throw new ContractNotDeployedError(partial);
  const policy = await getPolicy();
  const stats = await getStats();

  const receipt: DayReceipt = {
    date,
    quote,
    decision,
    nearPriceUsd,
    feeYocto,
    feeNear: fmtNear(feeYocto),
    policy,
    stats,
    cost: {
      todayUsd: QUOTE_FEE_USD,
      monthProjectionUsd: +(QUOTE_FEE_USD * 30).toFixed(3),
      subscriptionUsd: SUBSCRIPTION_USD,
    },
  };

  // Local pre-check mirrors the on-chain policy (the contract is the real
  // enforcer — spend() logs a blocked entry and returns success:false if any
  // of these fail on-chain, so a race here is safe).
  const preCheck = (): string | null => {
    if (policy.kill_switch) return "kill switch is ON";
    if (!policy.allowlist.includes(PAYEE_ACCOUNT_ID))
      return `payee ${PAYEE_ACCOUNT_ID} is not allowlisted`;
    if (BigInt(feeYocto) > BigInt(policy.max_spend_per_call_yocto))
      return `fee ${fmtNear(feeYocto)} NEAR exceeds max_spend_per_call ${fmtNear(policy.max_spend_per_call_yocto)} NEAR`;
    if (
      BigInt(stats.spent_today_yocto) + BigInt(feeYocto) >
      BigInt(policy.daily_cap_yocto)
    )
      return `daily cap ${fmtNear(policy.daily_cap_yocto)} NEAR would be exceeded`;
    return null;
  };

  if (decision.decision !== "buy") {
    receipt.spendSkippedReason = `decision is ${decision.decision}: ${decision.reason}`;
    return receipt;
  }
  const blocked = preCheck();
  if (blocked) {
    receipt.spendSkippedReason = `policy blocks spend: ${blocked}`;
    return receipt;
  }

  // 5. On-chain spend (testnet) — pays the quote fee to the payee account.
  const result = await spend({
    payee: PAYEE_ACCOUNT_ID,
    amount_yocto: feeYocto,
    purpose: `1Click quote fee — Drip day ${date}`,
  });
  receipt.spend = {
    txHash: result.txHash,
    explorerUrl: result.explorerUrl,
    entryId: result.entryId,
    success: result.success,
    reason: result.reason,
  };
  if (!result.success) {
    receipt.spendSkippedReason = `spend() blocked on-chain: ${result.reason ?? "unknown"}`;
  }
  return receipt;
}
