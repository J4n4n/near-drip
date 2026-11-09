// Drip treasury contract — NEAR testnet, near-sdk-js (TypeScript).
//
// An autonomous DCA agent pays per price quote out of this treasury.
// A human-set spending policy is enforced on-chain: max spend per call,
// daily cap, payee allowlist, and a kill switch. Every spend attempt —
// approved AND blocked — is appended to a public on-chain ledger.
//
// Frozen interface (see ~/workspace/near-drip/README.md):
//   init, set_policy (owner only), spend (contract account only),
//   get_policy, get_ledger, get_stats.
//
// TESTNET ONLY. No mainnet, no real money.

import {
  NearBindgen,
  near,
  call,
  view,
  initialize,
  NearPromise,
} from "near-sdk-js";

// ---------------------------------------------------------------------------
// Types (frozen — agent backend and dashboard build against these shapes)
// ---------------------------------------------------------------------------

export type SpendStatus = "approved" | "blocked";

export type SpendBlockReason =
  | "unauthorized"
  | "kill_switch_on"
  | "exceeds_max_spend_per_call"
  | "payee_not_allowlisted"
  | "exceeds_daily_cap";

export interface Policy {
  max_spend_per_call_yocto: string;
  daily_cap_yocto: string;
  allowlist: string[];
  kill_switch: boolean;
}

export interface LedgerEntry {
  id: number;
  timestamp_ms: number;
  payee: string;
  amount_yocto: string;
  purpose: string;
  status: SpendStatus;
  reason?: string;
}

export interface SpendResult {
  success: boolean;
  reason?: string;
  entry_id?: number;
}

export interface PolicyView extends Policy {
  owner: string;
  agent_account_id: string;
}

export interface Stats {
  balance_yocto: string;
  spent_today_yocto: string;
  total_spent_yocto: string;
  entries: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Default policy at init: max 0.01 NEAR/call, daily cap 0.05 NEAR,
// allowlist = the price-API payee, kill switch off.
const DEFAULT_MAX_SPEND_PER_CALL_YOCTO = "10000000000000000000000"; // 0.01 NEAR
const DEFAULT_DAILY_CAP_YOCTO = "50000000000000000000000"; // 0.05 NEAR
const DEFAULT_ALLOWLIST = ["drip-payee-2026.testnet"];

const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

@NearBindgen({ requireInit: true })
export class DripTreasury {
  owner: string;
  agent_account_id: string;
  policy: Policy;
  ledger: LedgerEntry[];

  constructor() {
    this.owner = "";
    this.agent_account_id = "";
    this.policy = {
      max_spend_per_call_yocto: DEFAULT_MAX_SPEND_PER_CALL_YOCTO,
      daily_cap_yocto: DEFAULT_DAILY_CAP_YOCTO,
      allowlist: [...DEFAULT_ALLOWLIST],
      kill_switch: false,
    };
    this.ledger = [];
  }

  // -- init (call once, right after deploy) --------------------------------

  @initialize({})
  init({ owner }: { owner: string }): void {
    this.owner = owner;
    this.agent_account_id = near.currentAccountId();
    this.policy = {
      max_spend_per_call_yocto: DEFAULT_MAX_SPEND_PER_CALL_YOCTO,
      daily_cap_yocto: DEFAULT_DAILY_CAP_YOCTO,
      allowlist: [...DEFAULT_ALLOWLIST],
      kill_switch: false,
    };
    this.ledger = [];
  }

  // -- policy (owner only) ---------------------------------------------------

  @call({})
  set_policy({
    max_spend_per_call_yocto,
    daily_cap_yocto,
    allowlist,
    kill_switch,
  }: {
    max_spend_per_call_yocto?: string;
    daily_cap_yocto?: string;
    allowlist?: string[];
    kill_switch?: boolean;
  }): Policy {
    if (near.predecessorAccountId() !== this.owner) {
      throw new Error("only the owner can set the policy");
    }
    if (max_spend_per_call_yocto !== undefined) {
      this.policy.max_spend_per_call_yocto = max_spend_per_call_yocto;
    }
    if (daily_cap_yocto !== undefined) {
      this.policy.daily_cap_yocto = daily_cap_yocto;
    }
    if (allowlist !== undefined) {
      this.policy.allowlist = allowlist;
    }
    if (kill_switch !== undefined) {
      this.policy.kill_switch = kill_switch;
    }
    return { ...this.policy, allowlist: [...this.policy.allowlist] };
  }

  // -- spend (contract account only = the agent's function-call key) ---------
  //
  // NEVER panics on a policy failure: the attempt is logged as a BLOCKED
  // ledger entry and { success: false, reason } is returned.
  // The only panic paths are caller bugs (malformed amount) and the
  // owner-only guard in set_policy above.
  // The transfer itself is attached with .build() (not returned as the
  // call's promise) so this method can still return its SpendResult JSON.

  @call({})
  spend({
    payee,
    amount_yocto,
    purpose,
  }: {
    payee: string;
    amount_yocto: string;
    purpose: string;
  }): SpendResult {
    if (near.predecessorAccountId() !== near.currentAccountId()) {
      // Auth failure, not a policy failure: no ledger entry (anyone could
      // otherwise spam the ledger from any account at the treasury's
      // storage expense).
      return { success: false, reason: "unauthorized" };
    }

    const now_ms = Number(near.blockTimestamp() / 1_000_000n);
    const amount = BigInt(amount_yocto);

    const blocked = (reason: SpendBlockReason): SpendResult => {
      const entry: LedgerEntry = {
        id: this.ledger.length,
        timestamp_ms: now_ms,
        payee,
        amount_yocto,
        purpose,
        status: "blocked",
        reason,
      };
      this.ledger.push(entry);
      return { success: false, reason, entry_id: entry.id };
    };

    if (this.policy.kill_switch) {
      return blocked("kill_switch_on");
    }
    if (amount <= 0n || amount > BigInt(this.policy.max_spend_per_call_yocto)) {
      return blocked("exceeds_max_spend_per_call");
    }
    if (!this.policy.allowlist.includes(payee)) {
      return blocked("payee_not_allowlisted");
    }
    if (
      this.spentToday(now_ms) + amount >
      BigInt(this.policy.daily_cap_yocto)
    ) {
      return blocked("exceeds_daily_cap");
    }

    // Approved: schedule the transfer, then log it and return the receipt.
    NearPromise.new(payee).transfer(amount).build();

    const entry: LedgerEntry = {
      id: this.ledger.length,
      timestamp_ms: now_ms,
      payee,
      amount_yocto,
      purpose,
      status: "approved",
    };
    this.ledger.push(entry);
    return { success: true, entry_id: entry.id };
  }

  // -- views -----------------------------------------------------------------

  @view({})
  get_policy(): PolicyView {
    return {
      max_spend_per_call_yocto: this.policy.max_spend_per_call_yocto,
      daily_cap_yocto: this.policy.daily_cap_yocto,
      allowlist: [...this.policy.allowlist],
      kill_switch: this.policy.kill_switch,
      owner: this.owner,
      agent_account_id: this.agent_account_id,
    };
  }

  @view({})
  get_ledger(): LedgerEntry[] {
    return [...this.ledger];
  }

  @view({})
  get_stats(): Stats {
    const now_ms = Number(near.blockTimestamp() / 1_000_000n);
    return {
      balance_yocto: near.accountBalance().toString(),
      spent_today_yocto: this.spentToday(now_ms).toString(),
      total_spent_yocto: this.totalSpent().toString(),
      entries: this.ledger.length,
    };
  }

  // -- internals ---------------------------------------------------------------

  private spentToday(now_ms: number): bigint {
    const today = Math.floor(now_ms / MS_PER_DAY);
    let sum = 0n;
    for (const entry of this.ledger) {
      if (
        entry.status === "approved" &&
        Math.floor(entry.timestamp_ms / MS_PER_DAY) === today
      ) {
        sum += BigInt(entry.amount_yocto);
      }
    }
    return sum;
  }

  private totalSpent(): bigint {
    let sum = 0n;
    for (const entry of this.ledger) {
      if (entry.status === "approved") {
        sum += BigInt(entry.amount_yocto);
      }
    }
    return sum;
  }
}
