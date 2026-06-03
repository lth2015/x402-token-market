#!/usr/bin/env python3
"""
Fund the demo payer wallet on Solana Devnet.

Run inside the x402-api container (has solders + httpx):
    docker compose exec x402m_x402_api python3 /app/scripts/fund-devnet-payer.py

Or locally (pip install solders httpx):
    python3 scripts/fund-devnet-payer.py

Steps performed automatically:
  1. Derive payer pubkey + USDC ATA from DEMO_PAYER_PRIVATE_KEY_B64
  2. Check SOL balance; request devnet airdrop if < 0.5 SOL
  3. Create payer USDC ATA on devnet (idempotent)
  4. Print USDC balance and Circle faucet instructions
"""
from __future__ import annotations

import base64, json, os, sys, time

try:
    from solders.keypair import Keypair
    from solders.pubkey import Pubkey
    from solders.hash import Hash
    from solders.instruction import AccountMeta, Instruction
    from solders.transaction import Transaction
    import httpx
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Run inside the x402-api container:")
    print("  docker compose exec x402m_x402_api python3 scripts/fund-devnet-payer.py")
    sys.exit(1)

RPC = os.environ.get("SOLANA_RPC_URL", "https://api.devnet.solana.com")
USDC_MINT_STR = os.environ.get("USDC_MINT", "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")
TOKEN_PROGRAM_ID  = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
ATA_PROGRAM_ID    = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
SYSTEM_PROGRAM_ID = Pubkey.from_string("11111111111111111111111111111111")


def find_ata(owner: Pubkey, mint: Pubkey) -> Pubkey:
    seeds = [bytes(owner), bytes(TOKEN_PROGRAM_ID), bytes(mint)]
    addr, _ = Pubkey.find_program_address(seeds, ATA_PROGRAM_ID)
    return addr


def rpc(client: httpx.Client, method: str, params: list) -> dict:
    r = client.post(RPC, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
                    timeout=30)
    r.raise_for_status()
    return r.json()


def get_sol_balance(client: httpx.Client, pubkey: str) -> float:
    resp = rpc(client, "getBalance", [pubkey, {"commitment": "confirmed"}])
    return resp["result"]["value"] / 1e9


def get_usdc_balance(client: httpx.Client, ata: str) -> float | None:
    resp = rpc(client, "getTokenAccountBalance", [ata, {"commitment": "confirmed"}])
    if "error" in resp:
        return None
    return float(resp["result"]["value"]["uiAmount"] or 0)


def request_airdrop(client: httpx.Client, pubkey: str, sol: float = 2.0) -> str:
    lamports = int(sol * 1e9)
    resp = rpc(client, "requestAirdrop", [pubkey, lamports])
    if "error" in resp:
        raise RuntimeError(f"Airdrop failed: {resp['error']}")
    return resp["result"]   # tx signature


def get_blockhash(client: httpx.Client) -> Hash:
    resp = rpc(client, "getLatestBlockhash", [{"commitment": "confirmed"}])
    bh_str = resp["result"]["value"]["blockhash"]
    return Hash.from_string(bh_str)


def ata_exists(client: httpx.Client, ata: str) -> bool:
    resp = rpc(client, "getAccountInfo", [ata, {"encoding": "base64", "commitment": "confirmed"}])
    return resp["result"]["value"] is not None


def create_ata_tx(payer_kp: Keypair, mint: Pubkey) -> bytes:
    """Build a transaction that creates the payer's own USDC ATA."""
    payer = payer_kp.pubkey()
    ata = find_ata(payer, mint)
    ix = Instruction(
        ATA_PROGRAM_ID,
        bytes([1]),   # CreateIdempotent
        [
            AccountMeta(payer,             is_signer=True,  is_writable=True),
            AccountMeta(ata,               is_signer=False, is_writable=True),
            AccountMeta(payer,             is_signer=False, is_writable=False),
            AccountMeta(mint,              is_signer=False, is_writable=False),
            AccountMeta(SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
            AccountMeta(TOKEN_PROGRAM_ID,  is_signer=False, is_writable=False),
        ],
    )
    return ata, ix


def send_tx(client: httpx.Client, payer_kp: Keypair, instructions, skip_preflight=False) -> str:
    bh = get_blockhash(client)
    tx = Transaction.new_signed_with_payer(
        instructions,
        payer=payer_kp.pubkey(),
        signing_keypairs=[payer_kp],
        recent_blockhash=bh,
    )
    raw_b64 = base64.b64encode(bytes(tx)).decode()
    opts = {"encoding": "base64", "skipPreflight": skip_preflight, "preflightCommitment": "confirmed"}
    resp = rpc(client, "sendTransaction", [raw_b64, opts])
    if "error" in resp:
        raise RuntimeError(f"sendTransaction failed: {resp['error']}")
    return resp["result"]


def wait_confirmed(client: httpx.Client, sig: str, max_tries: int = 20) -> bool:
    for _ in range(max_tries):
        time.sleep(2)
        resp = rpc(client, "getSignatureStatuses", [[sig]])
        st = resp["result"]["value"][0]
        if st and st.get("confirmationStatus") in ("confirmed", "finalized"):
            return st.get("err") is None
    return False


def main():
    b64 = os.environ.get("DEMO_PAYER_PRIVATE_KEY_B64", "")
    if not b64:
        print("ERROR: DEMO_PAYER_PRIVATE_KEY_B64 not set in environment")
        sys.exit(1)

    payer_kp = Keypair.from_bytes(base64.b64decode(b64))
    payer_pk = payer_kp.pubkey()
    mint     = Pubkey.from_string(USDC_MINT_STR)
    payer_ata, _ = create_ata_tx(payer_kp, mint)

    print()
    print("=" * 60)
    print("  Devnet Payer Wallet Setup")
    print("=" * 60)
    print(f"  Payer pubkey : {payer_pk}")
    print(f"  Payer ATA    : {payer_ata}")
    print(f"  USDC mint    : {USDC_MINT_STR}")
    print(f"  RPC          : {RPC}")
    print()

    with httpx.Client() as client:
        # ── 1. Check/airdrop SOL ───────────────────────────────────────
        sol = get_sol_balance(client, str(payer_pk))
        print(f"  SOL balance  : {sol:.4f} SOL")

        if sol < 0.5:
            print("  → Requesting devnet airdrop of 2 SOL…")
            try:
                sig = request_airdrop(client, str(payer_pk), 2.0)
                print(f"    airdrop sig: {sig[:20]}…")
                confirmed = wait_confirmed(client, sig)
                if confirmed:
                    sol = get_sol_balance(client, str(payer_pk))
                    print(f"    ✓ Airdrop confirmed — SOL balance: {sol:.4f}")
                else:
                    print("    ⚠ Airdrop not confirmed yet (devnet may be slow)")
            except Exception as e:
                print(f"    ✗ Airdrop failed: {e}")
                print("    → Fund manually: https://faucet.solana.com")
        else:
            print("  ✓ SOL balance sufficient")

        # ── 2. Create payer USDC ATA ───────────────────────────────────
        print()
        if ata_exists(client, str(payer_ata)):
            print(f"  ✓ Payer USDC ATA already exists: {payer_ata}")
        else:
            print("  → Creating payer USDC ATA…")
            try:
                sol_now = get_sol_balance(client, str(payer_pk))
                if sol_now < 0.01:
                    print("    ✗ Not enough SOL to create ATA — airdrop first")
                else:
                    _, ix = create_ata_tx(payer_kp, mint)
                    sig = send_tx(client, payer_kp, [ix])
                    print(f"    tx sig: {sig[:20]}…")
                    confirmed = wait_confirmed(client, sig)
                    if confirmed:
                        print(f"    ✓ ATA created: {payer_ata}")
                    else:
                        print(f"    ⚠ Tx not confirmed yet")
            except Exception as e:
                print(f"    ✗ ATA creation failed: {e}")

        # ── 3. Check USDC balance ──────────────────────────────────────
        print()
        usdc = get_usdc_balance(client, str(payer_ata))
        if usdc is None:
            print("  ✗ Payer USDC ATA not found — ATA creation may have failed")
            usdc = 0.0
        else:
            print(f"  USDC balance : {usdc:.2f} USDC-Dev")
            if usdc >= 100:
                print("  ✓ Sufficient USDC for demo topup ($100)")
            elif usdc > 0:
                print(f"  ⚠ USDC is low — need at least $100 for auto-topup")
            else:
                print("  ✗ No USDC — request from Circle faucet (see below)")

    # ── 4. Instructions ────────────────────────────────────────────────
    print()
    print("─" * 60)
    if usdc < 100:
        print()
        print("  ACTION REQUIRED: Fund payer with devnet USDC")
        print()
        print("  1. Open: https://faucet.circle.com")
        print("  2. Select: Solana  |  Network: Devnet")
        print(f"  3. Paste wallet:  {payer_pk}")
        print("  4. Request 200 USDC-Dev")
        print()
        print("  Then re-run this script to verify.")
    else:
        print()
        print("  ✓ Payer wallet is fully funded — demo topup is ready!")
        print()
        print("  Visit HABA Dashboard to trigger auto-topup:")
        print("    http://localhost:3001/dashboard")
        print()
        print("  Each order will appear on:")
        print("    Token Console  → http://localhost:3000")
        print("    x402 Console   → http://localhost:3002")
        print("    Wea Console    → http://localhost:3003")
        print()
        print("  Verify on Solana devnet explorer:")
        print("    https://explorer.solana.com/?cluster=devnet")

    print()
    print("=" * 60)


if __name__ == "__main__":
    main()
