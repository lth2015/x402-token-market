"""
SDK quickstart · end-to-end happy path against the local docker-compose stack.

Two modes — auto-selected based on whether bootstrap artifacts are present:

    DEV MODE (default — works out of the box)
        Step 4 uses the x402-api /admin/payments/{id}/confirm dev shortcut to
        skip Solana entirely. Lets you exercise HMAC + ledger + internal-auth
        without needing a funded wallet.

    REAL-CHAIN MODE (auto-enabled when {bootstrap_dir}/state.json exists)
        Step 4 signs a real SPL TransferChecked + Memo transaction with the
        payer wallet (from bootstrap), POSTs /v1/payments/{id}/proof, and
        polls /v1/payments/{id} until the x402 confirmer task has credited
        the merchant's token balance. This is the full production loop.

Setup:
    make up && make migrate
    cd sdk && poetry install
    poetry run python examples/quickstart.py             # DEV mode

    # — or to exercise the real chain —
    make solana-bootstrap                                 # creates wallets + mint
    set -a; . .local/solana-bootstrap/env; set +a         # USDC_MINT etc
    docker compose up -d --no-deps --force-recreate x402-api
    poetry run python examples/quickstart.py             # auto-detects bootstrap
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
from pathlib import Path

# Allow running without `poetry install`
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import httpx

from netstars import Client

TOKEN_API = os.environ.get("NETSTARS_API_BASE", "http://localhost:8080")
X402_API  = os.environ.get("X402_API_BASE",     "http://localhost:8081")
SOLANA_RPC = os.environ.get("SOLANA_RPC_URL",   "http://localhost:8899")
API_KEY   = os.environ.get("NETSTARS_API_KEY",        "ak_localdev_test")
API_SEC   = os.environ.get("NETSTARS_API_KEY_SECRET", "secret_localdev_test")

BOOTSTRAP_DIR = Path(
    os.environ.get(
        "NETSTARS_BOOTSTRAP_DIR",
        os.path.join(os.path.dirname(__file__), "..", "..", ".local", "solana-bootstrap"),
    )
).resolve()


def step(n: int, msg: str) -> None:
    print(f"\n[{n}] {msg}")


def real_chain_settle(client: Client, raw: httpx.Client, order: dict) -> dict:
    """Sign real SPL transfer + POST /proof + poll until token_credited."""
    from netstars.wallet import FileWallet

    state = json.loads((BOOTSTRAP_DIR / "state.json").read_text())
    usdc_mint = state["usdc_mint"]
    payer_path = state["payer_keypair_path"]

    wallet = FileWallet(payer_path)
    print(f"    · payer wallet  = {wallet.public_key()}")
    print(f"    · USDC mint     = {usdc_mint}")

    # Fresh blockhash directly from the validator
    rpc = raw.post(
        SOLANA_RPC,
        json={"jsonrpc": "2.0", "id": 1, "method": "getLatestBlockhash",
              "params": [{"commitment": "finalized"}]},
        timeout=5.0,
    ).json()
    blockhash = rpc["result"]["value"]["blockhash"]

    signed_tx_b64 = wallet.sign_usdc_transfer(
        amount_usdc_micro=order["amount_usdc_micro"],
        recipient=order["recipient"],
        nonce=order["nonce"],
        recent_blockhash=blockhash,
        usdc_mint=usdc_mint,
    )
    print(f"    · signed_tx     = {signed_tx_b64[:32]}…  ({len(signed_tx_b64)} chars)")

    # Submit proof. Server: verify → broadcast → respond with tx_hash.
    r = raw.post(
        f"{X402_API}/v1/payments/{order['payment_order_id']}/proof",
        json={"signed_tx_base64": signed_tx_b64},
        timeout=20.0,
    )
    if r.status_code != 200:
        print(f"    ✗ /proof HTTP {r.status_code}  {r.text[:300]}")
        sys.exit(1)
    proof = r.json()
    tx_hash = proof.get("tx_hash")
    print(f"    · tx broadcast  = {tx_hash}")
    print(f"    · order status  = {proof['order']['status']}  (waiting for confirmer to credit)")

    # Poll order until confirmer transitions to token_credited
    deadline = time.time() + 30.0
    while time.time() < deadline:
        r = client._transport.get(f"/v1/payments/{order['payment_order_id']}")
        o = r.json()
        if o["status"] == "token_credited":
            return o
        if o["status"] in ("failed", "expired", "canceled", "refunded"):
            print(f"    ✗ order ended in {o['status']!r}")
            sys.exit(1)
        time.sleep(1.0)
    print("    ✗ timed out waiting for confirmer; check x402-api logs")
    sys.exit(1)


def dev_confirm(raw: httpx.Client, order: dict, idem: str) -> dict:
    """Skip Solana via x402 admin shortcut."""
    r = raw.post(
        f"{X402_API}/v1/admin/payments/{order['payment_order_id']}/confirm",
        json={"tx_hash": "DEV_SIM_" + idem},
    )
    if r.status_code != 200:
        print(f"    ✗ HTTP {r.status_code}  body={r.text[:300]}")
        sys.exit(1)
    c = r.json()
    return c["order"]


def main() -> None:
    bootstrap_ready = (BOOTSTRAP_DIR / "state.json").exists()
    mode = "REAL CHAIN" if bootstrap_ready else "DEV (admin/confirm shortcut)"

    print(f"  token-api: {TOKEN_API}")
    print(f"  x402-api:  {X402_API}")
    print(f"  api_key:   {API_KEY}  (HMAC-signed via SDK)")
    print(f"  mode:      {mode}")
    if bootstrap_ready:
        print(f"  bootstrap: {BOOTSTRAP_DIR}")

    with Client(api_key=API_KEY, api_key_secret=API_SEC, base_url=TOKEN_API) as nc, \
         httpx.Client(timeout=10.0) as raw:

        step(1, f"GET {TOKEN_API}/healthz   (no auth)")
        print(f"    ✓ {nc.healthz()}")

        step(2, f"GET {TOKEN_API}/v1/balance   (HMAC-signed)")
        bal0 = nc.tokens.balance()
        print(f"    ✓ balance = {bal0.balance_token} token  (≈ {bal0.usdc_equivalent} USDC)")

        step(3, f"POST {TOKEN_API}/v1/token-purchase   amount_usdc=10.0")
        idem = f"qs-{uuid.uuid4().hex[:12]}"
        order = nc.tokens.purchase(amount_usdc=10.0, idempotency_key=idem)
        print(f"    ✓ order_id   = {order['payment_order_id']}")
        print(f"    ✓ recipient  = {order['recipient']}")
        print(f"    ✓ amount     = {order['amount_usdc_micro']} micro-USDC")
        print(f"    ✓ status     = {order['status']}")

        if bootstrap_ready:
            step(4, "Sign + broadcast real USDC TransferChecked → wait for confirmer")
            settled = real_chain_settle(nc, raw, order)
            print(f"    ✓ status              = {settled['status']}")
            print(f"    ✓ tx_hash             = {settled['tx_hash']}")
        else:
            step(4, f"POST {X402_API}/v1/admin/payments/{{id}}/confirm   (DEV — skips chain)")
            settled = dev_confirm(raw, order, idem)
            print(f"    ✓ status              = {settled['status']}")
            print(f"    ✓ tx_hash             = {settled.get('tx_hash')}")

        step(5, f"GET {TOKEN_API}/v1/balance   (after credit)")
        bal1 = nc.tokens.balance()
        print(f"    ✓ balance = {bal1.balance_token} token  (≈ {bal1.usdc_equivalent} USDC)")

        step(6, "Idempotency check: same key → same order, no double-credit")
        order_again = nc.tokens.purchase(amount_usdc=10.0, idempotency_key=idem)
        same = order_again["payment_order_id"] == order["payment_order_id"]
        print(f"    {'✓' if same else '✗'} got same order_id back ({order_again['payment_order_id']})")

        step(7, f"POST {TOKEN_API}/v1/messages   (stub AI call → debit)")
        resp = nc._transport.post(
            "/v1/messages",
            json_body={
                "model": "claude-haiku-4-5",
                "messages": [{"role": "user", "content": "Hello!"}],
            },
        )
        chat = resp.json()
        print(f"    ✓ content              = {chat['content']!r}")
        print(f"    ✓ tokens_consumed      = {chat['usage']['tokens_consumed']}")
        print(f"    ✓ balance_after        = {chat['usage']['balance_after']}")

        step(8, "Recent activity (real ledger reads — powers Console Live Ticker)")
        recent = nc.tokens.recent_activity(limit=5)
        for it in recent["items"]:
            ts = it["ts"][:19] if it.get("ts") else "—"
            print(f"    · {ts}  {it['icon']}  {it['description']:<40s}  {it['amount_token']:>10d}")

        print()
        print(f"✅  End-to-end {mode} happy path complete.")
        print("    Console: open http://localhost:3000 to see the same activity.")


if __name__ == "__main__":
    try:
        main()
    except httpx.ConnectError as e:
        print(f"\n✗ Cannot reach a service: {e}")
        print("  Did you run `make up && make migrate` from the repo root?")
        sys.exit(2)
