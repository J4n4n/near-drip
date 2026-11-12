# Drip — the pay-per-sip DCA agent on NEAR

**NEAR Hackathon 2026 "Build Beyond Boundaries" — tracks: `agents` (primary), `business`, `security`.**
Deadline: **Nov 14, 2026 23:59 UTC**. Built Nov 8–14, 2026.

## One line

An autonomous agent runs a **$10/day SOL DCA** for you, paying **$0.003 per price
quote** instead of a **$29/month subscription** (322× cheaper) — with a human-set
spending policy enforced **on-chain by a NEAR smart contract**, and every payment
logged to a public ledger.

## The problem

A trading bot needs one price a day. The API industry sells that as a
$29/month subscription — charged even on days the bot never trades. Payment is
tied to an account, an API key, and a dashboard.

## The idea

x402 / NEAR Intents flip the model: payment becomes a property of the request.
The agent asks for a quote, gets a `402`-style invoice, pays a third of a cent,
and gets its answer. No account. No API key. No subscription. And because the
agent holds real money, a human-set policy contract caps what it can spend —
enforced on-chain, not by promise.

## What is real, what is not

- **Real:** live mainnet 1Click quotes (USDC→SOL, dry, no key — see
  `docs/spike-1click.md`); a real NEAR testnet contract holding real testnet
  NEAR; real on-chain `spend` transfers to a real payee account; a real
  on-chain ledger; a real kill switch that blocks overspend on-chain.
- **Deliberately NOT real:** the mainnet swap is **never executed**. Drip builds
  the quote and stops. Settlement on mainnet is a one-line change (deposit to
  the quote's `depositAddress`). The builder has zero money, so no real money
  moves anywhere in this demo — by design, and stated here explicitly.

## Architecture

```
drip-treasury (contract, near-sdk-js, NEAR testnet)
  Holds testnet NEAR. Policy: max_spend_per_call, daily_cap, allowlist,
  kill_switch. spend() logs every payment (approved AND blocked) to an
  on-chain ledger. Only the agent's scoped function-call key can call spend();
  only the owner can change policy.

drip-agent (backend, Node.js/TypeScript)
  Loop: 1Click quote → buy/hold/skip decision (rules engine; NEAR AI Cloud
  if a key is configured) → policy check (view call) → spend() call →
  receipt log. CLI one-shot (`npm run demo`) + HTTP server (`npm run server`,
  GET /status, POST /run-day, POST /policy) on :3001.

drip-dashboard (frontend, React + Vite)
  Live ledger from the contract, policy editor, kill switch, cost chart
  ($0.09/mo vs $29/mo), "Run one day" button, explorer links per payment.
```

## Quickstart (do X — see Y)

Prerequisites: Node 20+, npm. No money, no KYC, no mainnet anywhere.

```bash
# 1. Install (from repo root)
npm install
#    → see: workspaces installed, no errors

# 2. Copy env (testnet key files are already in .near-credentials/,
#    gitignored; never commit them)
cp .env.example .env

# 3. Run one full day end-to-end from the CLI
npm run demo
#    → see: live 1Click quote (10 USDC → ~0.11 SOL), decision buy/hold/skip,
#      policy check, spend() receipt with tx hash + explorer link,
#      cost ledger: today $0.003 · 30 days $0.09 · subscription $29.00

# 4. Run the dashboard
npm run server   # terminal 1 — agent API on :3001
npm run dev      # terminal 2 — dashboard on :5173
#    → open http://localhost:5173, click "Run one day"
#    → see: the ledger row appear with an explorer link; flip the kill
#      switch, run again, see the blocked entry in the ledger.
```

## Contract interface (frozen — agent and dashboard build against this)

Deployed contract: `drip-treasury-2026.testnet` (NEAR testnet).
Explorer: https://explorer.testnet.near.org/accounts/drip-treasury-2026.testnet

| Method | Type | Args | Returns |
|---|---|---|---|
| `init` | call (once, owner) | `{ owner: string }` | — |
| `set_policy` | call (owner only) | `{ max_spend_per_call_yocto?: string, daily_cap_yocto?: string, allowlist?: string[], kill_switch?: boolean }` | policy |
| `spend` | call (agent key only: predecessor must be the contract account) | `{ payee: string, amount_yocto: string, purpose: string }` | `{ success: boolean, reason?: string, entry_id?: number }` |
| `get_policy` | view | — | `{ max_spend_per_call_yocto, daily_cap_yocto, allowlist, kill_switch, owner, agent_account_id }` |
| `get_ledger` | view | — | `LedgerEntry[]` |
| `get_stats` | view | — | `{ balance_yocto, spent_today_yocto, total_spent_yocto, entries }` |

`LedgerEntry = { id, timestamp_ms, payee, amount_yocto, purpose,
status: "approved" | "blocked", reason? }`.
"Today" = UTC day of `timestamp_ms`. `spend` never panics on policy failure —
it logs a blocked entry and returns `{ success: false, reason }`.
Reasons: `unauthorized` | `kill_switch_on` | `exceeds_max_spend_per_call` |
`payee_not_allowlisted` | `exceeds_daily_cap`.

Default policy (set at init): max 0.01 NEAR/call, daily cap 0.05 NEAR,
allowlist `["drip-payee-2026.testnet"]`, kill switch off.
Payee `drip-payee-2026.testnet` stands in for "the price-API provider".

## Agent loop (one day)

1. `POST https://1click.chaindefuser.com/v0/quote` (dry, no key): 10 USDC→SOL.
2. Decision: buy if `amountOutUsd >= 9.90`, else hold/skip (rules engine;
   `src/ai.ts` has the same interface for NEAR AI Cloud when configured).
3. Convert the $0.003 quote fee to NEAR via the live wNEAR price from
   `GET https://1click.chaindefuser.com/v0/tokens` (`nep141:wrap.near`).
4. Policy check via `get_policy` + `get_stats`; call `spend()` with the
   agent's function-call key (scoped to `spend` on the treasury contract only).
5. Print/log the receipt: tx hash, explorer URL, ledger entry id.

## Disclosure

The Drip concept (pay-per-quote DCA, $0.09/mo vs $29/mo) is reused from the
builder's swap.io x402 video work. Only the NEAR integration in this repo —
contract, agent backend, dashboard — is new, written since Oct 19, 2026
(hackathon announcement). The swap.io video and this prototype are independent
projects. No code in this repo was written before the hackathon window.

## Submission (SUBMITTED)

Submitted 2026-11-10 ~00:24 Tehran via nearhackathon.com — "SUBMISSION RECEIVED".
See `SUBMISSION.md` for the submitted payload. Payout address (provided by the human):
**boykisser.near**. Judging Nov 16–18, 2026; keep repo + demo live until Nov 18 (ideally Nov 25).

## Verified state (2026-11-07 ~22:00 UTC — all verified live by the coordinator)

- **Contract:** `drip-treasury-2026.testnet`, code_hash
  `3bhp6d29BVfkGknGZheZ2sVP3NaThRfGeMw5KNJMY7n6`
  ([explorer](https://explorer.testnet.near.org/accounts/drip-treasury-2026.testnet)).
  Deploy tx `FmAtEyNL75yU6f2NbMuWUFxkh3zCTosry82teH24Sg7p`, init tx
  `Garz25bDXNbpLUATNRC13F11anu5rzqnXqQVyPVm1Qtt`. Source
  `contract/src/index.ts`, artifact `build/contract.wasm` (541,745 bytes),
  near-sdk-js 2.0.0.
- **Ledger (8 entries, on-chain):** 6 approved spends (incl. 3 live 1Click
  quote fees of 0.000824 NEAR, entries #0/#1/#7) + 2 blocked spends
  (kill switch on, entries #4/#6, reason `kill_switch_on`). Balance
  9.9709 NEAR; payee `drip-payee-2026.testnet` balance 10.00125 NEAR.
- **Proof txs:** approved spend
  [FxnDvK3GHefiDPNVcp7KCm4feuRJw3vtm8h6p2Joe1Jz](https://explorer.testnet.near.org/transactions/FxnDvK3GHefiDPNVcp7KCm4feuRJw3vtm8h6p2Joe1Jz)
  (entry #5, via the agent's scoped function-call key); blocked spend
  [6VQPUAHTAbKRDRrPpFHwqSoVQQiFfadt2nikBSmPR8aF](https://explorer.testnet.near.org/transactions/6VQPUAHTAbKRDRrPpFHwqSoVQQiFfadt2nikBSmPR8aF)
  (entry #6); unauthorized spend from another account
  [7hiLQYo48RtbhrusNCLNrZBDR4F5ZJbSWpcC8cEJq423](https://explorer.testnet.near.org/transactions/7hiLQYo48RtbhrusNCLNrZBDR4F5ZJbSWpcC8cEJq423)
  → `{success:false, reason:"unauthorized"}`, no ledger entry. Full log:
  `contract/proof-last-run.log`. Kill switch left OFF, default policy intact.
- **Agent loop:** `npm run demo` verified end-to-end 3× (live dry quote
  10 USDC → ~0.1118 SOL, decision BUY, fee $0.003 = 0.000824 NEAR, on-chain
  receipt). Server endpoints verified live together with the dashboard:
  `GET /status`, `POST /run-day`, `POST /policy`. Agent function-call key
  `ed25519:9J4WSeGQmKKPQq2y7rMGdU5kG4TwUeTy5bPxw8GCrfTY` (receiver treasury,
  methods `["spend"]`, 0.1 NEAR allowance; setup tx
  `G1QBYyrNWcwYuUUmc1uukuW2yaAwscmuCtfvWXo3wd4p`).
- **Dashboard:** `npm run build` succeeds; `npm run dev` serves HTTP 200 on
  :5173 with live contract data; policy payload confirmed compatible with the
  agent's `POST /policy` (yocto fields + kill_switch).
- **Versions:** contract near-sdk-js 2.0.0 / near-api-js 5.1.1 / TS 4.7.4;
  agent near-api-js 7.4.0 / express 5.3.0 / TS 7.0.2; dashboard react 19.3.1 /
  vite 8.3.6 / near-api-js 7.4.0 / TS 5.9.3. Each workspace pins its own
  toolchain (see `contract/BUILD_NOTES.md` for the near-sdk-js install
  workarounds: postinstall `tar` buffer overflow, manual binaryen/quickjs/
  wasi-sdk extraction, `prebuild` symlink fix).
- **Secrets:** none in the repo. Keys live only in gitignored
  `.near-credentials/` (treasury, payee, agent-key; chmod 600). No `.env`
  file exists (only `.env.example`).
