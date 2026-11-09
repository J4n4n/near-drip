# NEAR Hackathon 2026 — submission payload (DRAFT)

> **DO NOT SUBMIT.** This file is preparation only. Per HACKATHON.md the agent
> must NOT submit, post on X, or make the repo public without the human
> confirming the exact payload first. Everything below is a draft for Janan
> to review and confirm.

- **Project name:** Drip — the pay-per-sip DCA agent on NEAR
- **Team lead name:** J4n4n
- **Contact email:** nupisoki7@proton.me
- **Team size:** 1 (plus AI agent Muse as builder)
- **Tracks:** `agents`, `business`, `security`
- **Payout address (NEAR):** `boykisser.near` — provided by Janan, 2026-11-08
- **GitHub repo:** TBD — repo will be created and made public ONLY after
  Janan confirms (do not push before then)
- **Demo link:** TBD — X demo post (Janan posts it; must tag @NEARProtocol
  and #NEARHackathon, say it was built at NEAR HACKATHON, include the video)
  and/or hosted dashboard URL
- **Idea (draft, 20–2000 chars):**
  Drip is an autonomous agent that runs a $10/day SOL DCA, paying $0.003 per
  price quote instead of a $29/month API subscription (322× cheaper). A
  human-set spending policy is enforced on-chain by a NEAR smart contract
  (max per call, daily cap, payee allowlist, kill switch); every payment —
  approved and blocked — is logged to a public on-chain ledger. The agent
  fetches live mainnet 1Click quotes and records the spend on testnet; the
  real mainnet swap is deliberately never executed. Dashboard shows the live
  ledger, policy editor, kill switch, and the $0.09/mo vs $29/mo cost chart.
- **Consent:** TBD (Janan confirms at submission time)

## Pre-submission checklist

- [x] Contract deployed to testnet, spend + blocked-spend proven on explorer
- [x] `npm run demo` works end-to-end from a clean checkout
- [x] Dashboard runs locally; demo video recorded (90–120s) — DONE 2026-11-08 ~03:41, verified: ~/workspace/near-drip/demo-video/drip-demo.mp4, 98.07s, 1080×1920 (see BUILDLOG.md). README complete.
- [x] README complete ("do X — see Y", expected outputs)
- [ ] Repo created under J4n4n and made public (human confirms)
- [ ] X demo post published by Janan (tag @NEARProtocol + #NEARHackathon) — X account @0xj4n4n EXISTS (confirmed 2026-11-08 ~01:24); login via "Continue with Google" (kaveh.rastaak@gmail.com) — Janan still needs to clear x.com site data himself (agent-side cache clear failed) and sign in
- [ ] Janan confirms this exact payload, then submission is sent
      (deadline Nov 14, 2026 23:59 UTC — aim for Nov 14 evening Tehran)
