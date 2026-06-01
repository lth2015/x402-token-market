# X402 Token Market

Local demo stack for a four-actor Solana USDC payment flow:

```text
HABA consumer -> NetStars x402 Gateway -> Wea Facilitator -> Solana Devnet
```

## Services

| Surface / service | URL | Stack | Brand | State |
|---|---:|---|---|---|
| HABA consumer site | http://localhost:3001 | Next.js 15 + React 19 + Tailwind | emerald | light theme |
| Token Console | http://localhost:3000 | Next.js 15 + Tailwind + next-intl | blue | light theme |
| NetStars X402 Console | http://localhost:3002 | Next.js 15 + Tailwind | blue | light theme, protocol scenarios |
| Wea Facilitator Console | http://localhost:3003 | Next.js 15 + Tailwind | violet | light theme, facilitator telemetry |
| x402-api | http://localhost:8081 | FastAPI | NetStars gateway | resource server, x402 verify + settle orchestration |
| wea-api | http://localhost:8082 | Rust axum | Wea | facilitator verify + Solana JSON-RPC settle |
| token-api | http://localhost:8080 | FastAPI | NetStars token ledger | AI usage metering and ledger APIs |
| mysql | localhost:3306 | MySQL 8.0 | infrastructure | local logical databases |
| redis | localhost:6379 | Redis 7 | infrastructure | cache / local coordination |

## Quickstart

```bash
docker compose up -d
make migrate-x402
python3 scripts/x402_protocol_e2e.py
```

The protocol E2E should finish with all assertions passing. Use `docker compose ps` if any service is still starting.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - system architecture and the standard x402 flow.
- [netstars/x402/console/README.md](netstars/x402/console/README.md) - gateway console scenarios and telemetry.
- [wea/console/README.md](wea/console/README.md) - facilitator console scenarios and telemetry.
- [docs/PROGRESS.md](docs/PROGRESS.md) - implementation progress log.
