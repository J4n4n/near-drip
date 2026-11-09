# Spike: 1Click quote API (verified live, 2026-11-07 ~21:38 UTC)

## Verdict: WORKS, no API key, no JWT — dry quotes are free and keyless

- Endpoint: `POST https://1click.chaindefuser.com/v0/quote`
- Tokens list: `GET https://1click.chaindefuser.com/v0/tokens` (also keyless)

## Asset IDs (from the live tokens list — do NOT guess these)

- USDC on Solana: `nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near`
  (decimals 6)
- SOL (native): `nep141:sol.omft.near` (decimals 9)
- wNEAR price feed: `nep141:wrap.near` (decimals 24, price ≈ $3.64 at check)

Wrong asset IDs fail with HTTP 400 `{"message":"tokenIn is not valid"}`.
The docs example uses `X-API-Key` in the header — it is NOT required for dry
quotes (verified: 201 without any key).

## Working request (10 USDC → SOL, dry)

```json
{
  "dry": true,
  "swapType": "EXACT_INPUT",
  "slippageTolerance": 100,
  "originAsset": "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near",
  "depositType": "ORIGIN_CHAIN",
  "destinationAsset": "nep141:sol.omft.near",
  "amount": "10000000",
  "refundTo": "<valid non-zero Solana address>",
  "refundType": "ORIGIN_CHAIN",
  "recipient": "<valid non-zero Solana address>",
  "recipientType": "DESTINATION_CHAIN",
  "deadline": "2026-11-09T00:00:00Z"
}
```

Notes:
- `refundTo` / `recipient` must be valid Solana addresses. The all-zeros
  address `11111111111111111111111111111111` is REJECTED
  (`"recipient is not valid"`). A random 32-byte base58 address works.
- `deadline` must be a future ISO timestamp.

## Observed response (HTTP 201)

```json
{
  "quote": {
    "amountIn": "10000000",
    "amountInFormatted": "10.0",
    "amountInUsd": "9.996350000000",
    "amountOut": "112194806",
    "amountOutFormatted": "0.112194806",
    "amountOutUsd": "9.972996305340",
    "timeEstimate": 17,
    "refundFee": "236525",
    "withdrawFee": "112499"
  },
  "quoteRequest": { "dry": true, "swapType": "EXACT_INPUT", "...": "..." },
  "signature": "ed25519:...",
  "timestamp": "2026-11-07T21:38:18.161Z",
  "correlationId": "0ce73744-48bc-4594-a1d8-99f0d2e6cb1b"
}
```

Dry responses contain NO `depositAddress` / `deadline` (per docs). `amountOutUsd`
is the field the decision engine uses (buy if ≥ 9.90).

## Testnet accounts (created 2026-11-07 via helper.testnet.near.org, free)

- Treasury / contract: `drip-treasury-2026.testnet` — 10 NEAR.
  Key in `.near-credentials/treasury.json` (gitignored, chmod 600).
  Tx: `4q1bMi2QgpjvafutzFfDPZfzcF1QCyhkkX4B96orHeTW`
- Payee (stands in for "the price-API provider"): `drip-payee-2026.testnet`
  — 10 NEAR. Key in `.near-credentials/payee.json` (gitignored, chmod 600).

Verify any time:
`curl https://rpc.testnet.near.org -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":"x","method":"query","params":{"request_type":"view_account","account_id":"drip-treasury-2026.testnet","finality":"final"}}'`

## Environment notes

- Node v24.22.1, npm 10.9.4. `npm install` WORKS inside ~/workspace (the old
  "npm fails in workspace" note was a red herring — it was an invalid package
  name starting with a dot).
- /tmp is a 512 MB tmpfs — do not put node_modules there.
