# Netstars SDK (Python)

> X402-based payment + AI Token client for Agentic Commerce
> **Status**: v0.1.0 — bootable skeleton. Public API frozen. Internals partial; see TODOs.

## Install

```bash
poetry add netstars-sdk            # or: pip install netstars-sdk (Phase 2)
```

## 30-second example

```python
from netstars import Client, FileWallet

with Client(
    api_key="ak_…",
    api_key_secret="…",
    wallet=FileWallet("~/.netstars/wallet.json"),
    env="devnet",
) as client:
    # 1. balance
    bal = client.tokens.balance()
    print(f"have {bal.balance_token} AI tokens")

    # 2. AI call — if balance is low, SDK automatically buys more
    #    USDC via X402 and retries; your code never sees the 402.
    resp = client.chat(
        model="claude-opus-4-7",
        messages=[{"role": "user", "content": "Translate to JP: hello"}],
    )
    print(resp.content)
    print(f"used {resp.usage.tokens_consumed} tokens; "
          f"balance now {resp.usage.balance_after}")
```

## What's in v0.1.0

| Piece | Status |
|------|--------|
| `Client` (sync) — facade + sub-resources | ✅ working |
| HMAC request signing | ✅ working, tested |
| Typed exception hierarchy + response→exception mapping | ✅ working, tested |
| Retry / backoff / jitter | ✅ working |
| `FileWallet` (Solana keypair JSON) | ✅ working |
| Pydantic models for ChatRequest / Response / PaymentIntent / Order | ✅ working |
| X402 coordinator (402 → sign → submit → poll → retry) | ⚠️ structure done, USDC tx builder is stub (see `signer.py`) |
| MCP server (`netstars-mcp`) | ❌ Phase 2 |
| `AsyncClient` | ❌ Phase 2 |
| KMS Wallet (AWS KMS encrypted keypair) | ❌ Phase 3 |
| Streaming chat (`chat_stream`) | ❌ Phase 2 |

## Layout

```
src/netstars/
├─ __init__.py        public re-exports
├─ client.py          Client facade
├─ transport.py       HTTP + HMAC signing + retry
├─ x402.py            402 → sign → poll → retry coordinator
├─ wallet/
│  ├─ base.py         Wallet protocol
│  └─ file.py         FileWallet
├─ signer.py          USDC SPL transfer builder (STUB — see DESIGN.md §5)
├─ models.py          Pydantic dataclasses
└─ errors.py          Exception hierarchy
```

## Run tests

```bash
poetry install
poetry run pytest tests/unit -v
```

Offline; no network needed. 11 tests cover signing + error mapping.

## Run the example against local stack

```bash
# From repo root, ensure the stack is up:
make up && make migrate

# Then:
cd sdk
poetry install
poetry run python examples/quickstart.py
```

## Design docs

- [PRD.md](PRD.md) — what we're building
- [ARCHITECTURE.md](ARCHITECTURE.md) — component view
- [DESIGN.md](DESIGN.md) — algorithms + pseudocode (the source of truth)
