# Wea Facilitator Console

The Wea Facilitator Console is the Web3 payment provider view of the x402 flow. It focuses on what reaches Wea: facilitator verify calls, facilitator settle calls, Solana Devnet wallet balances, and recent call outcomes.

## What It Polls

The console uses local Next.js API proxies:

| Console route | Backend endpoint |
|---|---|
| `GET /api/console/calls` | `wea-api /v1/_console/calls` |
| `GET /api/console/metrics` | `wea-api /v1/_console/metrics` |

The page refreshes both feeds every two seconds and reverses the call list so the newest calls appear first.

## Run Locally

From the repo root:

```bash
docker compose up -d wea-console
```

Or run the Next app directly:

```bash
cd wea/console
npm run dev
```

Open http://localhost:3003.

## Scenarios

The scenario buttons call `wea/console/src/app/api/scenarios/*`:

| Button | Route | Expected result |
|---|---|---|
| Trigger a real payment | `POST /api/scenarios/trigger-payment` | Goes through the gateway, then Wea receives one verify call and one settle call |
| Send bogus payload directly | `POST /api/scenarios/direct-verify` | Calls `/facilitator/verify` with an invalid signed transaction and expects `isValid=false` |

The ArchitectureCrumb links this surface with HABA, Token Console, and NetStars X402 Console so operators can move between the four actor views without changing context.

## Related Docs

- [Root README](../../README.md)
- [System architecture](../../ARCHITECTURE.md)
- [NetStars X402 Console](../../netstars/x402/console/README.md)
