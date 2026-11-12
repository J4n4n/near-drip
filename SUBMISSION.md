# NEAR Hackathon 2026 — Drip (submitted)

Submitted 2026-11-10 ~00:24 Tehran (Nov 9 ~20:54 UTC) via the nearhackathon.com
form. Confirmation shown: "SUBMISSION RECEIVED — You're on the radar!"
(no confirmation number was displayed). Judging Nov 16–18, 2026; results by
Nov 18 23:59 UTC. Repo and demo post stay up until at least Nov 18 (ideally Nov 25).

- **Project name:** Drip — the pay-per-sip DCA agent on NEAR
- **Team lead:** Janan Rastaak
- **Contact email:** nupisoki7@proton.me
- **Team size:** 1 (solo)
- **Tracks:** `agents`, `business`, `security`
- **Payout address (NEAR):** `boykisser.near`
- **GitHub repo:** https://github.com/J4n4n/near-drip
- **Demo post:** https://x.com/0XJ4N4N/status/2119880252201583063
- **What we built:** Drip is an autonomous agent that runs a $10/day SOL DCA,
  paying $0.003 per price quote instead of a $29/month API subscription
  (322× cheaper). A human-set spending policy is enforced on-chain by a NEAR
  smart contract (max per call, daily cap, payee allowlist, kill switch);
  every payment — approved and blocked — is logged to a public on-chain
  ledger. The agent fetches live mainnet 1Click quotes and records the spend
  on testnet; the real mainnet swap is deliberately never executed.
  Dashboard shows the live ledger, policy editor, kill switch, and the
  $0.09/mo vs $29/mo cost chart.

## Checklist
- [x] Contract deployed to testnet, spend + blocked-spend proven on explorer
- [x] `npm run demo` works end-to-end from a clean checkout
- [x] Dashboard runs locally; demo video recorded (98s, see BUILDLOG.md)
- [x] README complete ("do X — see Y", expected outputs)
- [x] Repo public under J4n4n (commit c0fe1c3)
- [x] X demo post published (tags @NEARProtocol + #NEARHackathon, repo link)
- [x] Submitted via nearhackathon.com — "SUBMISSION RECEIVED"
