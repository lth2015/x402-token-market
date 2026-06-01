# NetStars X402 Console

The NetStars X402 Console is the operator view for the resource server side of the standard x402 payment loop. It shows issued HTTP 402 challenges, submitted `X-PAYMENT` proofs, gateway-side verification decisions, replay/resource/network failures, and settled Solana Devnet transactions.

## What It Polls

The console uses local Next.js API proxies so the browser never calls backend services directly:

| Console route | Backend endpoint |
|---|---|
| `GET /api/console/events?limit=20` | `x402-api /v1/_console/events` |
| `GET /api/console/metrics` | `x402-api /v1/_console/metrics` |

It refreshes both feeds every two seconds.

## Run Locally

From the repo root:

```bash
docker compose up -d x402-console
```

Or run the Next app directly:

```bash
cd netstars/x402/console
npm run dev
```

Open http://localhost:3002.

## Scenarios

The left rail exposes protocol checks that call `netstars/x402/console/src/app/api/scenarios/*`:

| Button | Route | Expected result |
|---|---|---|
| Normal payment | `POST /api/scenarios/normal` | HTTP 402 challenge, signed payment retry, WEA verify + settle, final 200 |
| Replay attack | `POST /api/scenarios/replay` | Reusing the last `X-PAYMENT` is rejected with replay protection |
| Expired order | `POST /api/scenarios/expired` | A short-lived challenge expires before retry and is rejected with 410 `EXPIRED` |
| Tamper resource | `POST /api/scenarios/tamper-resource` | Payload resource binding mismatch is rejected |
| Tamper network | `POST /api/scenarios/tamper-network` | Network mismatch is rejected |
| Malformed X-PAYMENT | `POST /api/scenarios/malformed` | Header decode failure is rejected |

The ArchitectureCrumb links this surface with HABA, Token Console, and Wea so the four actor views remain navigable during demos.

## Related Docs

- [Root README](../../../README.md)
- [System architecture](../../../ARCHITECTURE.md)
- [Wea Facilitator Console](../../../wea/console/README.md)
