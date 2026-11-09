# Drip demo video — build log

**File:** `drip-demo.mp4` — 1080×1920 vertical, H.264 + AAC, **98.07 s**,
21.2 MB (22,259,712 bytes). Built 2026-11-08 (early — deadline Nov 14, 2026 23:59 UTC).
**Nothing submitted, posted, or made public. No mainnet tx, no money spent.**

## Verification (all checked before delivery)

- `ffprobe`: video h264 1080×1920, audio AAC 48 kHz stereo, both 98.07 s.
- Frames visually checked at 5 s (wakeup robot + caption), 32 s (run-day receipt
  card), 58 s (kill-switch/unauthorized card), 93 s (celebrate robot + caption).
- Audio: mean volume −31.5 dB, max −5.8 dB. Silence detection shows only the
  intended ~1.5 s pads between segments — no mid-narration gaps. Narration is
  trimmed per segment, so it stays in sync with the card/clip on screen.
- All 9 segments built at exact planned durations (7.5 + 9 + 13.5 + 15.5 + 11 +
  13.5 + 14 + 10 + 4 = 98.0 s), concatenated with the ffmpeg concat **filter**.

## What is real vs simulated

**Real (captured live Nov 8, 2026, NEAR testnet):**
- `POST /run-day` run live during production: quote 10 USDC → 0.111195 SOL
  ($9.97, decision BUY), fee 0.000804 NEAR ($0.003), spend tx
  `7KqFNypYZT9QbyfVx7YCvK7AEvnx2EGUP3iD1nCMS9hp` → ledger entry **#8**.
  Tx confirmed via testnet RPC: `SuccessValue` decodes to
  `{"success":true,"entry_id":8}`. Full receipt saved in `rundays-live.json`.
- Ledger: **9 entries — 7 approved, 2 blocked** (kill switch), fetched live
  from `get_ledger()` via the agent `/status` endpoint. Contract balance
  9.969 NEAR, total spent 0.00628 NEAR at capture time.
- Blocked spend tx `6VQPUAHTAbKRDRrPpFHwqSoVQQiFfadt2nikBSmPR8aF`
  (`kill_switch_on`, entry #6) and unauthorized spend tx
  `7hiLQYo48RtbhrusNCLNrZBDR4F5ZJbSWpcC8cEJq423` →
  `{success:false, reason:"unauthorized"}` — both from the earlier proof run
  (`contract/proof-last-run.log`), real on-chain txs.
- 1Click quote: real dry quote, HTTP 201, no API key (10 USDC → ~0.1112 SOL).
- Agent server (:3001) and dashboard (:5173) both started for this video,
  verified live (`GET /status` OK, dashboard HTTP 200), then **stopped after**.
  The live run-day added ledger entry #8 — the ledger count in the video (9)
  is current as of this build; the brief's "8 entries / 6 approved" was the
  state before this run.

**Simulated / labelled on screen:**
- The **mainnet swap step is labelled `[ SIMULATION ]`** on the quote card and
  stated in the narration: the 1Click quote is real and dry, but the mainnet
  swap is **never executed** (zero capital, by design).
- The robot clips (wakeup / bill-shock / celebrate) are AI-generated
  illustrations reused from the swap.io video — same Drip character, not
  footage of anything real.
- The dashboard itself is **not** shown as a screenshot: headless Chromium is
  blocked on this VM (Hatch WebGL domain policy — direct `chrome --screenshot`
  refuses to start), and subagents cannot drive the live browser. The ledger,
  policy, and receipt shown are the exact live data the dashboard displays
  (same RPC calls), rendered as terminal-style cards — labelled as cards, not
  presented as screenshots. Dashboard availability was verified (HTTP 200).

**Everything is testnet-only.** No mainnet transaction, no real money, no
spending anywhere in the video or its production — except 0.000804 **testnet**
NEAR for the live run-day spend.

## Segments (98.0 s)

| # | s | Visual | Narration |
|---|---|--------|-----------|
| 1 | 7.5 | wakeup robot clip | hook: Drip buys $10 of SOL every morning |
| 2 | 9.0 | bill-shock robot clip | problem: $29/mo subscription for one quote a day |
| 3 | 13.5 | policy card | fix: on-chain policy (0.01/call, 0.05/day, allowlist, kill switch) |
| 4 | 15.5 | run-day receipt card | real live day: quote, BUY, $0.003 fee, tx, entry #8 |
| 5 | 11.0 | ledger card | 9 entries, 7 approved / 2 blocked, public ledger |
| 6 | 13.5 | guard card | kill switch blocks (#6); stranger → unauthorized |
| 7 | 14.0 | quote card | 1Click dry quote real; mainnet swap = SIMULATION |
| 8 | 10.0 | celebrate robot clip | $0.09/mo vs $29/mo, 322× cheaper |
| 9 | 4.0 | end card (silent) | DRIP · NEAR Hackathon 2026 · testnet only |

## Files

- `drip-demo.mp4` — final video
- `build_video.sh` — segment + concat build (re-runnable)
- `make_cards.py` — card generator (PIL, 1080×1920)
- `narration/*.txt` + `narration/*.mp3` — English voiceover (Helio voice,
  via `/opt/hatch/bin/tts`), 8 segments
- `cards/*.png` — 6 cards (policy, run, ledger, guard, quote, end)
- `segments/seg1–9.mp4` — individual segments
- `rundays-live.json` — full live run-day receipt (Nov 8, 2026)
- `check/frame-{5,32,58,93}.jpg` — verification frames

## Still open (not this task)

- Janan posts the video on X from his phone (@0XJ4N4N) with the demo text,
  tagging @NEARProtocol + #NEARHackathon, saying it was built at NEAR HACKATHON.
- Repo creation under J4n4n + public (human confirms), submission before
  Nov 14, 2026 23:59 UTC.
