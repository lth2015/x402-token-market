# Local Development

> Bring the full stack up on your laptop in < 5 minutes.
> Architecture: see [ARCHITECTURE.md](ARCHITECTURE.md) · Modules: see each `*/PRD.md`.

---

## Prereqs

- Docker Desktop (or Docker Engine + Compose v2)
- `make` (preinstalled on macOS/Linux)
- Python 3.12 + [Poetry](https://python-poetry.org) — for SDK dev
- Node.js 20 — for Console dev
- (Optional) [`golang-migrate`](https://github.com/golang-migrate/migrate) binary if you want to run migrations outside the make target

## Quickstart

```bash
cp .env.example .env                 # (optional: fill in real AI Provider keys)

make up                              # starts MySQL + Redis + Solana + 4 services
make ps                              # wait until all show "(healthy)"
make migrate                         # apply DB schemas for x402 / token / wea
make logs                            # tail everything
```

Endpoints:
- **HABA AI Commerce (demo merchant site)** → http://localhost:3001
- **Console** → http://localhost:3000
- **Token API** → http://localhost:8080  (try `/healthz`)
- **X402 API** → http://localhost:8081
- **Wea API** → http://localhost:8082
- **Solana RPC** → http://localhost:8899  (devnet validator, single-node, no real money)
- **MySQL** → `mysql://root:rootdev@localhost:3306` (admin) · `x402_app/x402_app_dev`, `token_app/token_app_dev`, `wea_app/wea_app_dev` (apps)
- **Redis** → `redis://localhost:6379`

## Make targets

```
make help            list all targets
make up              start everything
make down            stop everything (keeps volumes)
make clean           stop AND drop volumes (DESTROYS DATA)
make migrate         apply DB migrations to all 3 databases
make logs            tail all logs (or: make logs svc=token-api)
make restart svc=X   restart one service
make sdk-test        run SDK unit tests
make sdk-example     run examples/quickstart.py against the stack
make console-dev     run Console with hot reload (without docker)
```

## SDK development loop

```bash
cd sdk
poetry install
poetry run pytest tests/unit       # offline unit tests
# After `make up` + `make migrate`:
poetry run python examples/quickstart.py     # DEV mode (skips real Solana)
```

The quickstart auto-detects two modes:

| Mode | Trigger | What it does |
|---|---|---|
| **DEV** (default) | no bootstrap artifacts | Step 4 calls the x402 `admin/confirm` shortcut — no Solana tx is sent. Exercises HMAC + ledger + internal-auth without funding a wallet. |
| **REAL CHAIN** | `.local/solana-bootstrap/state.json` exists | Step 4 signs a real SPL `TransferChecked + Memo` with the bootstrap payer wallet, POSTs `/v1/payments/{id}/proof`, polls until the confirmer credits the merchant. |

### Enabling REAL CHAIN mode

```bash
make solana-bootstrap                          # creates merchant + payer + USDC mint,
                                               # airdrops SOL, mints 1000 USDC to payer
set -a; . .local/solana-bootstrap/env; set +a  # exports USDC_MINT + DEPOSIT_RECIPIENT_ADDRESS
docker compose up -d --no-deps --force-recreate x402-api   # picks up new env

cd sdk && poetry run python examples/quickstart.py         # now runs through real chain
```

Bootstrap is **idempotent** — reruns reuse existing keypairs/mint and only top up
the payer's USDC if it dips below the target.

## Console development loop

The fastest iteration is to run the Console **outside docker** (hot reload, no rebuild):

```bash
cd netstars/token/console
npm install
npm run dev                         # http://localhost:3000
```

Set `NEXT_PUBLIC_API_BASE=http://localhost:8080` to talk to the dockerised token-api.

## HABA AI Commerce site (independent merchant demo)

HABA is the example **merchant** in this demo — see [`docs/haba-demo-requirements.md`](docs/haba-demo-requirements.md) for the 4-actor topology (HABA / Netstars / WEA / Solana).
It runs as its own deployable on port **3001**, decoupled from Console:

```bash
make haba-install                   # install deps (--legacy-peer-deps, like Console)
make haba-dev                       # → http://localhost:3001 (hot reload)
# OR via docker:
make haba-up                        # build + start haba-site service
```

The HABA site never imports Netstars Console code; the two projects evolve independently. See [`haba/README.md`](haba/README.md) for project layout and the milestone progress in [`docs/haba-technical-plan.md`](docs/haba-technical-plan.md) §7.

## Reset everything

```bash
make clean        # nukes mysql/redis volumes
make build        # rebuild all images from scratch
make up
make migrate
```

## Troubleshooting

| Symptom | Fix |
|---------|------|
| `make up` fails with "port already in use" | `lsof -i :3306` (or :3000, :8080, etc.) and stop the conflicting process, OR change the port mapping in `docker-compose.yml` |
| Solana validator OOM-killed | give Docker Desktop ≥ 4 GB RAM (Preferences → Resources) |
| `make migrate` says "Dirty database" | a previous migration crashed. `migrate force <last-good-version>` then retry; or `make clean` to start fresh |
| `npm run dev` fails compiling | `rm -rf .next node_modules && npm install` |
| `poetry install` errors on `nacl` / `solders` | install Xcode CLT (`xcode-select --install`) on macOS, or `apt install build-essential` on Linux |

## Wea closed-loop demo (mock RPC)

`wea-api` runs as an independent settlement service. In MVP it uses a mock
Solana RPC (so it works on Apple Silicon), a single-process worker loop,
and HMAC-SHA256 signed callbacks.

```bash
make wea-smoke          # ~3 seconds end-to-end
```

The script:
1. Boots a tiny HTTP receiver on a free local port.
2. POSTs `/v1/settlements` with `callback_url=http://host.docker.internal:<port>/...`.
3. Waits for the wea worker to drive `pending → broadcasting → confirmed → done`
   and POST an HMAC-signed body to the receiver.
4. Verifies the HMAC over the body with the caller-supplied `callback_secret`.
5. Polls `GET /v1/settlements/{id}` to confirm `status=done` + `callback_status=sent_ok`.

`x402-api` does NOT delegate to `wea-api` in this build — the SDK quickstart
still goes through x402's own confirmer. Wiring x402 to call wea is a
separate change (feature-flagged `USE_WEA=1` planned in §13.3 of the PRD).

## Apple Silicon (M1/M2/M3) note

`solanalabs/solana:v1.18.22` is **amd64-only**, and the Solana validator binary
requires AVX (an x86 CPU feature) — QEMU can't emulate it, so the validator
container crash-loops on M-series Macs. The compose stack treats Solana as a
**soft dependency** (other services no longer wait for it to be healthy), so
`make up` still brings everything else online cleanly.

If you actually need REAL CHAIN mode on Apple Silicon, run the validator on
the host instead of in compose:

```bash
brew install solana                                 # or follow https://solana.com/docs/intro/installation
solana-test-validator --reset --quiet               # native arm64 binary, no QEMU
# Compose services point at host.docker.internal:8899 — set
# SOLANA_RPC_URL=http://host.docker.internal:8899 in .env, then:
docker compose stop solana                          # silence the crash-loop
docker compose up -d --no-deps --force-recreate x402-api wea-api
```

You can also just leave Solana stopped — DEV-mode `quickstart.py` never
touches the chain and works fine without any validator running.

## What's NOT in the stack yet (Tier 4+)

- AI Provider mock server — for now AI calls hit the real Anthropic/OpenAI APIs (or fail with 401 if you use DUMMY keys)
- OTel Collector / Prometheus / Grafana — observability stack; can be added when needed
- AWS Secrets Manager emulator (LocalStack) — currently we use plain env vars locally
