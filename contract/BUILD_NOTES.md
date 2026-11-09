# Drip treasury contract — BUILD NOTES

Contract: **drip-treasury-2026.testnet** (NEAR testnet)
Explorer: https://explorer.testnet.near.org/accounts/drip-treasury-2026.testnet
Last built/deployed/proven: 2026-11-08 ~01:25 UTC (Nov 8, 2026 ~04:55 Tehran).
Deadline Nov 14, 2026 23:59 UTC; scope lock Nov 12.

## Exact versions used

| Tool | Version | Source |
|---|---|---|
| Node | v24.22.1 | `node --version` |
| npm | 10.9.4 | `npm --version` |
| near-sdk-js | **2.0.0** (latest stable, `latest` tag; published 2024-06-07) | `npm view near-sdk-js version` → 2.0.0; installed `near-sdk-js@^2.0.0` |
| near-api-js (contract) | **5.1.1** (`^5.1.1` in contract/package.json) | used by scripts/deploy.mjs + scripts/prove.mjs |
| typescript (contract) | **4.7.4** (`~4.7.2` devDep) | pinned to match near-sdk-js 2.0.0's own dep — see workaround #2 |
| near-api-js (agent/dashboard workspaces) | 7.4.0 | installed by the parallel agent/dashboard pieces; NOT used by the contract |

## How to rebuild / redeploy / re-prove

```bash
cd ~/workspace/near-drip/contract
npm run build    # near-sdk-js build src/index.ts build/contract.wasm
npm run deploy   # deploys build/contract.wasm, calls init() only if needed
npm run prove    # end-to-end on-chain proof (see below); re-runnable
```

`npm run deploy` is re-runnable: NEAR keeps state across redeploys and
`init()` throws "Contract already initialized", so the script checks
`get_policy` first and skips `init()` when state exists. Verified by a
second deploy (tx CE2HW87MaiKx6LjKtVzJYXC4Amcw2iamXBv9xj4TLPNd) which
reported "Contract already initialized, skipping init()".

`npm run prove` is re-runnable: each run appends one approved + one blocked
ledger entry (0.001 NEAR each approved spend) and ends with kill_switch OFF.

## On-chain proof (testnet, latest full run)

Full log: `contract/proof-last-run.log`.

- Deploy tx: FmAtEyNL75yU6f2NbMuWUFxkh3zCTosry82teH24Sg7p
  (https://explorer.testnet.near.org/transactions/FmAtEyNL75yU6f2NbMuWUFxkh3zCTosry82teH24Sg7p)
- init tx: Garz25bDXNbpLUATNRC13F11anu5rzqnXqQVyPVm1Qtt
  (https://explorer.testnet.near.org/transactions/Garz25bDXNbpLUATNRC13F11anu5rzqnXqQVyPVm1Qtt)
- (a) APPROVED spend, 0.001 NEAR to drip-payee-2026.testnet, via the
  agent's scoped function-call key (allowance 0.1 NEAR, method `spend`
  only, receiver drip-treasury-2026.testnet — key created by the agent
  piece, verified on-chain):
  tx **FxnDvK3GHefiDPNVcp7KCm4feuRJw3vtm8h6p2Joe1Jz**
  https://explorer.testnet.near.org/transactions/FxnDvK3GHefiDPNVcp7KCm4feuRJw3vtm8h6p2Joe1Jz
  Return value `{"success":true,"entry_id":5}`; ledger entry 5 approved;
  tx receipts contain a Transfer of exactly 1000000000000000000000 yocto
  to drip-payee-2026.testnet (verified via RPC EXPERIMENTAL_tx_status).
- (b) BLOCKED spend with kill_switch ON, same key/amount:
  tx **6VQPUAHTAbKRDRrPpFHwqSoVQQiFfadt2nikBSmPR8aF**
  https://explorer.testnet.near.org/transactions/6VQPUAHTAbKRDRrPpFHwqSoVQQiFfadt2nikBSmPR8aF
  Return value `{"success":false,"reason":"kill_switch_on","entry_id":6}`;
  ledger entry 6 blocked, reason kill_switch_on; tx receipts contain NO
  transfer to the payee. Kill switch set back OFF afterwards
  (tx 2Byx3Cy2n4jAz9gmPqjDFubNHw69xB3s5Hm4FRjbbCkF).
- (c) Bonus check — spend signed by another account (payee key):
  tx 7hiLQYo48RtbhrusNCLNrZBDR4F5ZJbSWpcC8cEJq423 returns
  `{"success":false,"reason":"unauthorized"}` and appends no ledger entry.

Final state after the proof run: policy = defaults (max 0.01 NEAR/call,
daily cap 0.05 NEAR, allowlist [drip-payee-2026.testnet], kill_switch false),
7 ledger entries, spent_today 0.004648... NEAR, balance ~9.977 NEAR.
Note: entries 0–1 are the agent backend piece's own demo spends
("1Click quote fee — Drip day 2026-11-07", 0.000824... NEAR each), made
while this proof was running — the contract ledger is shared, by design.

Explorer pages are JS-rendered: a plain text fetch of a tx URL returns only
the app shell. The txs above were verified through the NEAR RPC
(EXPERIMENTAL_tx_status: SuccessValue + receipts), which is the
authoritative source; the explorer URLs are the canonical human links.

## Frozen interface — compliance

Implemented exactly as specified in README.md / the task:

- `init({owner})`, `set_policy` (owner-only, panics otherwise),
  `spend` (predecessor must be the contract account), `get_policy`,
  `get_ledger`, `get_stats`; LedgerEntry / SpendResult shapes unchanged.
- Default policy at init: max 0.01 NEAR/call
  (10000000000000000000000 yocto), daily cap 0.05 NEAR
  (50000000000000000000000 yocto), allowlist
  ["drip-payee-2026.testnet"], kill_switch false. Verified live.
- `spend` never panics on the four policy failures; each appends a BLOCKED
  entry and returns `{success:false,reason}` with reason in
  {kill_switch_on, exceeds_max_spend_per_call, payee_not_allowlisted,
  exceeds_daily_cap}. Check order: kill_switch → max per call → allowlist
  → daily cap.
- "Today" = UTC day of `timestamp_ms` (floor(ms / 86,400,000)).
- `entry_id` = the entry's 0-based index in the ledger (= position in the
  array returned by `get_ledger`).

## Deviations / interpretation decisions (all deliberate, none change the interface)

1. **Unauthorized `spend` appends NO ledger entry.** The spec's "append a
   BLOCKED entry on any failure" covers the four policy failures, which
   can only be reached by the contract account itself. An unauthorized
   call (any other predecessor) returns `{success:false,
   reason:"unauthorized"}` without writing: otherwise anyone could spam
   the ledger at the treasury's storage expense. Verified in proof (c).
2. **Transfer is attached with `NearPromise.new(payee).transfer(amount).build()`**,
   not returned as the call's promise — so `spend` can still return its
   `{success, entry_id}` JSON. Consequence: if a transfer action itself
   failed (only possible if the contract balance fell below the amount,
   which the policy caps make unlikely at 10 NEAR treasury), the returned
   `success:true` would not reflect it. The transfer receipt is the
   ground truth; the proof script checks it.
3. **Non-positive amounts** (`amount <= 0`) are treated as blocked with
   reason `exceeds_max_spend_per_call` (closest frozen reason; a zero or
   negative spend is not a payable spend). A malformed (unparseable)
   `amount_yocto` still panics — that is a caller bug, not a policy
   failure. The agent always sends well-formed positive amounts.
4. **`set_policy` panics on non-owner** via `throw new Error(...)` (the
   near-sdk-js QuickJS trap fails the tx with that message), per spec.

## Build workarounds (environment, not contract logic)

1. **near-sdk-js 2.0.0 postinstall is broken on this machine.** Its
   postinstall downloads binaryen/quickjs/wasi-sdk and extracts them with
   `tar xvf` via `child_process.exec`, whose default 1 MB stdout buffer
   kills `tar` mid-extraction (verbose listing exceeds the buffer), so the
   install fails. Workaround: installed with `--ignore-scripts`, then ran
   the postinstall steps manually with non-verbose `tar xf
   --no-same-owner` into
   `node_modules/near-sdk-js/lib/cli/deps/` (binaryen 0.1.16,
   quickjs 0.1.3, wasi-sdk 11.0). The binaryen tarball contains only
   `lib/libbinaryen.so` + `wasi-stub/` (no `bin/wasm-opt`) — that is the
   complete upstream artifact; the CLI only uses `wasi-stub/run.sh`.
   If `node_modules` is ever wiped, re-run those manual steps (or
   `npm install --ignore-scripts near-sdk-js@2.0.0` then extract the three
   archives by hand). The deps live under `node_modules/` (gitignored).
2. **TypeScript version clash.** The workspace root hoists TypeScript
   7.0.2 (agent piece), but near-sdk-js's build invokes
   `node_modules/.bin/tsc <file>` with a `tsconfig.json` present, which
   TS 7 rejects (TS5112) and TS 7 also removed `--moduleResolution node`
   (TS5108). Fix: contract devDep `typescript@~4.7.2` (exactly what
   near-sdk-js 2.0.0 declares), installed nested at
   `contract/node_modules/.bin/tsc` (4.7.4), which typechecks the contract
   cleanly and is what `npm run build` picks up first on PATH.
3. **near-sdk-js CLI hardcodes relative paths** (`node_modules/near-sdk-js`,
   `node_modules/.bin/tsc`, `.../lib/cli/deps/qjsc`), which do not exist
   under `contract/` in an npm-workspaces layout (hoisted to the repo
   root). Fix: `prebuild` script recreates the symlink
   `contract/node_modules/near-sdk-js -> ../../node_modules/near-sdk-js`
   if missing (npm may prune it on reinstall). The symlink is inside
   `node_modules/` (gitignored); the `prebuild` step is versioned in
   `contract/package.json`.

## Files

- `contract/src/index.ts` — the contract (near-sdk-js, TypeScript).
- `contract/build/contract.wasm` — built artifact (541,745 bytes).
- `contract/scripts/deploy.mjs` — re-runnable deploy + init.
- `contract/scripts/prove.mjs` — re-runnable on-chain proof (a/b/c above).
- `contract/proof-last-run.log` — full output of the latest proof run.
- `contract/BUILD_NOTES.md` — this file.

## No blockers

No GitHub repo exists for this project and none was created; nothing was
pushed. No mainnet anywhere. No secrets in code — key files live in
`~/workspace/near-drip/.near-credentials/` (gitignored, chmod 600) and are
only read at runtime by the scripts; the secret key is never printed.
