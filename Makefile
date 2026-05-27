# =====================================================================
# X402 Token Market · Make targets
# =====================================================================
.DEFAULT_GOAL := help

.PHONY: help up down restart logs ps build pull migrate seed test fmt lint \
        sdk-test sdk-example console-dev clean solana-bootstrap

help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# ── Stack lifecycle ───────────────────────────────────────────────
up: ## Start all services in the background
	docker compose up -d
	@echo "→ MySQL : localhost:3306"
	@echo "→ Redis : localhost:6379"
	@echo "→ Solana: http://localhost:8899  (devnet validator)"
	@echo "→ x402  : http://localhost:8081/healthz"
	@echo "→ token : http://localhost:8080/healthz"
	@echo "→ wea   : http://localhost:8082/healthz"
	@echo "→ console: http://localhost:3000"

down: ## Stop and remove all containers
	docker compose down

restart: ## Restart a single service: `make restart svc=x402-api`
	docker compose restart $(svc)

logs: ## Tail logs (all services). For single: `make logs svc=token-api`
	@if [ -z "$(svc)" ]; then docker compose logs -f --tail=100; \
	else docker compose logs -f --tail=100 $(svc); fi

ps: ## List running containers + health
	docker compose ps

build: ## Force rebuild all images
	docker compose build --no-cache

pull: ## Pull latest base images
	docker compose pull mysql redis solana

# ── Database migrations (uses golang-migrate via docker run) ──────
MIGRATE_IMG = migrate/migrate:v4.17.1
# Compose's --format json drops the project name in v2.2.1, and the bare
# "internal" name isn't what Docker stores. Query Docker for the network that
# carries both the compose-network=internal label and (some) project label.
# Falls back to the dir basename if compose isn't up yet.
NET = $$(docker network ls --filter label=com.docker.compose.network=internal --format '{{.Name}}' | head -1 \
        || echo $$(basename $$PWD)_internal)

migrate-x402: ## Apply x402 migrations
	docker run --rm --network $(NET) -v "$$(pwd)/netstars/x402/db/migrations:/m" $(MIGRATE_IMG) \
	  -path /m -database "mysql://x402_app:x402_app_dev@tcp(mysql:3306)/x402_qa?multiStatements=true" up

migrate-token: ## Apply token migrations
	docker run --rm --network $(NET) -v "$$(pwd)/netstars/token/db/migrations:/m" $(MIGRATE_IMG) \
	  -path /m -database "mysql://token_app:token_app_dev@tcp(mysql:3306)/token_qa?multiStatements=true" up

migrate-wea: ## Apply wea migrations
	docker run --rm --network $(NET) -v "$$(pwd)/wea/db/migrations:/m" $(MIGRATE_IMG) \
	  -path /m -database "mysql://wea_app:wea_app_dev@tcp(mysql:3306)/wea_qa?multiStatements=true" up

migrate: migrate-x402 migrate-token migrate-wea ## Apply all migrations

# ── Solana local-validator bootstrap ──────────────────────────────
BOOTSTRAP_OUT = $(CURDIR)/.local/solana-bootstrap

solana-bootstrap: ## Mint USDC + ATAs + airdrop SOL on the local validator (idempotent)
	@mkdir -p $(BOOTSTRAP_OUT)
	cd sdk && poetry run python $(CURDIR)/scripts/solana_bootstrap.py $(BOOTSTRAP_OUT)
	@echo
	@echo "→ to apply, restart x402-api with the new env:"
	@echo "    set -a; . $(BOOTSTRAP_OUT)/env; set +a"
	@echo "    docker compose up -d --no-deps --force-recreate x402-api"

# ── SDK ──────────────────────────────────────────────────────────
sdk-test: ## Run SDK unit tests
	cd sdk && poetry run pytest tests/unit -v

sdk-example: ## Run the quickstart example (needs services up + migrations applied)
	cd sdk && poetry run python examples/quickstart.py

# ── Wea ──────────────────────────────────────────────────────────
wea-smoke: ## Closed-loop test: POST settlement, listen for HMAC callback, assert done
	python3 scripts/wea_smoke.py

# ── Console ───────────────────────────────────────────────────────
console-dev: ## Run Console in dev mode locally (hot reload), without docker
	cd netstars/token/console && npm run dev

# ── HABA AI Commerce site (independent merchant demo on :3001) ────
haba-install: ## Install HABA site deps (uses --legacy-peer-deps; see haba/README.md)
	cd haba && npm install --legacy-peer-deps --no-audit --no-fund

haba-dev: ## Run HABA site in dev mode locally (hot reload) on :3001
	cd haba && npm run dev

haba-build: ## Production build for HABA site (without docker)
	cd haba && npm run build

haba-typecheck: ## tsc --noEmit on HABA site
	cd haba && npm run typecheck

haba-up: ## Build + start HABA site via docker compose (:3001)
	docker compose up -d --build haba-site
	@echo "→ HABA AI Commerce: http://localhost:3001"

# ── House-keeping ─────────────────────────────────────────────────
clean: ## Remove containers + volumes (DESTROYS LOCAL DATA)
	docker compose down -v

test: ## Run all test suites
	$(MAKE) sdk-test
