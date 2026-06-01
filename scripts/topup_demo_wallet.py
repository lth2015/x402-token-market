#!/usr/bin/env python3
"""
Check and lightly top up the demo payer wallet used by the x402 Devnet demo.

No third-party dependencies: this script talks to Solana JSON-RPC with urllib.
"""
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path
from typing import Any
from urllib import error as urlerror
from urllib import request as urlreq


DEFAULT_RPC_URL = "https://api.devnet.solana.com"
DEFAULT_DEMO_PAYER = "5gYYVxNa4EfeYafSoM9c2e4YSFuRh1aRaw9G1zzMwYMS"
DEFAULT_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
FAUCET_URL = "https://faucet.circle.com"
LAMPORTS_PER_SOL = 1_000_000_000


class RpcError(RuntimeError):
    pass


def load_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    env: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        env[key.strip()] = value
    return env


def env_value(name: str, fallback: str, file_env: dict[str, str]) -> str:
    return os.environ.get(name) or file_env.get(name) or fallback


def rpc_call(rpc_url: str, method: str, params: list[Any] | None = None) -> Any:
    body = json.dumps({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params or [],
    }).encode("utf-8")
    req = urlreq.Request(
        rpc_url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlreq.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urlerror.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RpcError(f"{method} HTTP {exc.code}: {detail}") from exc
    except urlerror.URLError as exc:
        raise RpcError(f"{method} failed: {exc.reason}") from exc

    if "error" in payload:
        raise RpcError(f"{method} RPC error: {payload['error']}")
    return payload.get("result")


def get_sol_balance(rpc_url: str, pubkey: str) -> float:
    result = rpc_call(rpc_url, "getBalance", [pubkey, {"commitment": "confirmed"}])
    lamports = int(result.get("value", 0))
    return lamports / LAMPORTS_PER_SOL


def get_usdc_balance(rpc_url: str, pubkey: str, mint: str) -> float:
    result = rpc_call(
        rpc_url,
        "getTokenAccountsByOwner",
        [
            pubkey,
            {"mint": mint},
            {"encoding": "jsonParsed", "commitment": "confirmed"},
        ],
    )
    total_base_units = 0
    decimals = 6
    for item in result.get("value", []):
        token_amount = (
            item.get("account", {})
            .get("data", {})
            .get("parsed", {})
            .get("info", {})
            .get("tokenAmount", {})
        )
        decimals = int(token_amount.get("decimals", decimals))
        total_base_units += int(token_amount.get("amount", "0"))
    return total_base_units / (10 ** decimals)


def classify_sol(balance: float) -> str:
    if balance < 0.05:
        return "low"
    if balance < 0.5:
        return "OK"
    return "good"


def classify_usdc(balance: float) -> str:
    if balance < 5:
        return "low"
    if balance < 20:
        return "OK"
    return "good"


def request_airdrop(rpc_url: str, pubkey: str) -> str:
    result = rpc_call(rpc_url, "requestAirdrop", [pubkey, LAMPORTS_PER_SOL])
    if not isinstance(result, str):
        raise RpcError(f"requestAirdrop returned unexpected result: {result!r}")
    return result


def print_balances(rpc_url: str, pubkey: str, mint: str) -> tuple[float, float]:
    sol = get_sol_balance(rpc_url, pubkey)
    usdc = get_usdc_balance(rpc_url, pubkey, mint)
    print(f"Demo payer: {pubkey}")
    print(f"RPC:        {rpc_url}")
    print(f"SOL:        {sol:.6f} ({classify_sol(sol)})")
    print(f"USDC:       {usdc:.6f} ({classify_usdc(usdc)})")
    if classify_sol(sol) == "low" or classify_usdc(usdc) == "low":
        print("Overall:    low")
    elif classify_sol(sol) == "good" and classify_usdc(usdc) == "good":
        print("Overall:    good")
    else:
        print("Overall:    OK")
    return sol, usdc


def main() -> int:
    parser = argparse.ArgumentParser(description="Check or top up the x402 demo payer wallet.")
    parser.add_argument("--airdrop", action="store_true", help="Request 1 SOL from the Solana Devnet airdrop.")
    parser.add_argument("--print-faucet-url", action="store_true", help="Print the Circle faucet URL and payer address.")
    parser.add_argument("--env-file", default=".env", help="Path to an env file. Defaults to .env.")
    args = parser.parse_args()

    file_env = load_env_file(Path(args.env_file))
    rpc_url = env_value("SOLANA_RPC_URL", DEFAULT_RPC_URL, file_env)
    pubkey = env_value("DEMO_PAYER_PUBKEY", DEFAULT_DEMO_PAYER, file_env)
    mint = env_value("USDC_MINT", DEFAULT_USDC_MINT, file_env)

    try:
        print_balances(rpc_url, pubkey, mint)

        if args.airdrop:
            before = get_sol_balance(rpc_url, pubkey)
            print()
            print("Requesting 1 SOL airdrop...")
            sig = request_airdrop(rpc_url, pubkey)
            print(f"Airdrop signature: {sig}")
            deadline = time.time() + 10
            after = before
            while time.time() < deadline:
                time.sleep(1)
                after = get_sol_balance(rpc_url, pubkey)
                if after >= before + 0.9:
                    break
            print(f"SOL after: {after:.6f} ({classify_sol(after)})")
    except RpcError as exc:
        print(f"ERROR: {exc}")
        return 1

    if args.print_faucet_url:
        print()
        print(f"Circle faucet: {FAUCET_URL}")
        print(f"Address:       {pubkey}")
        print("Network:       Solana Devnet")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
