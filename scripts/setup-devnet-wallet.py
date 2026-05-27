#!/usr/bin/env python3
"""
X402 Token Market — Devnet Wallet Setup
========================================
Generates two Solana keypairs (merchant + demo payer) and prints all the
information you need to configure real Devnet USDC payments.

Run this script ONCE inside the x402-api container (which has solders installed):

    docker compose exec x402-api python /app/../../../scripts/setup-devnet-wallet.py

Or if you have Python + solders installed locally:

    pip install solders
    python scripts/setup-devnet-wallet.py

After running, follow the printed instructions to:
  1. Airdrop devnet SOL to both wallets (for tx fees)
  2. Create USDC Associated Token Accounts (ATAs)
  3. Get devnet USDC from the Circle faucet
  4. Copy values into your .env file

USDC on Devnet: NOT real money. Used for demo purposes only.
"""
from __future__ import annotations

import base64
import sys

try:
    from solders.keypair import Keypair
    from solders.pubkey import Pubkey
except ImportError:
    print("ERROR: solders is not installed. Run: pip install 'solders>=0.21'")
    print("Or execute this script inside the x402-api container:")
    print("  docker compose exec x402-api python scripts/setup-devnet-wallet.py")
    sys.exit(1)

# ── ATA derivation (mirrors tx_builder.py / proof.py) ──────────────────────────
TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
ATA_PROGRAM_ID   = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
USDC_DEVNET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"

def find_ata(owner: Pubkey, mint: Pubkey) -> Pubkey:
    seeds = [bytes(owner), bytes(TOKEN_PROGRAM_ID), bytes(mint)]
    addr, _ = Pubkey.find_program_address(seeds, ATA_PROGRAM_ID)
    return addr

def keypair_to_b64(kp: Keypair) -> str:
    return base64.b64encode(bytes(kp)).decode()


def main() -> None:
    print()
    print("=" * 65)
    print("  X402 Token Market — Devnet Wallet Generator")
    print("=" * 65)

    # Generate two keypairs
    merchant_kp = Keypair()
    payer_kp    = Keypair()

    merchant_pk = merchant_kp.pubkey()
    payer_pk    = payer_kp.pubkey()

    mint_pk = Pubkey.from_string(USDC_DEVNET_MINT)
    merchant_ata = find_ata(merchant_pk, mint_pk)
    payer_ata    = find_ata(payer_pk, mint_pk)

    merchant_b64 = keypair_to_b64(merchant_kp)
    payer_b64    = keypair_to_b64(payer_kp)

    print()
    print("┌─────────────────────────────────────────────────────────────┐")
    print("│  Generated wallets (Devnet — NOT real money)                │")
    print("└─────────────────────────────────────────────────────────────┘")
    print()
    print("  MERCHANT WALLET (receives USDC from customers)")
    print(f"    Public key:  {merchant_pk}")
    print(f"    USDC ATA:    {merchant_ata}")
    print()
    print("  DEMO PAYER WALLET (sends USDC in server-side checkout)")
    print(f"    Public key:  {payer_pk}")
    print(f"    USDC ATA:    {payer_ata}")
    print()
    print("─" * 65)
    print()
    print("  PRIVATE KEYS (base64) — keep secret, do NOT commit to git")
    print()
    print(f"  Merchant private key (for your records):")
    print(f"    {merchant_b64}")
    print()
    print(f"  DEMO_PAYER_PRIVATE_KEY_B64 (put this in .env):")
    print(f"    {payer_b64}")
    print()

    print("─" * 65)
    print()
    print("  STEP 1 — Add to .env")
    print()
    print(f"    DEPOSIT_RECIPIENT_ADDRESS={merchant_pk}")
    print(f"    DEMO_PAYER_PRIVATE_KEY_B64={payer_b64}")
    print()

    print("─" * 65)
    print()
    print("  STEP 2 — Airdrop devnet SOL for transaction fees")
    print()
    print(f"    solana airdrop 2 {merchant_pk} --url devnet")
    print(f"    solana airdrop 2 {payer_pk} --url devnet")
    print()
    print("  (If solana-cli is not installed locally, skip this and fund")
    print("   via https://solfaucet.com or https://faucet.solana.com)")
    print()

    print("─" * 65)
    print()
    print("  STEP 3 — Create USDC Associated Token Accounts")
    print()
    print(f"    # Merchant ATA:")
    print(f"    spl-token create-account {USDC_DEVNET_MINT} \\")
    print(f"      --owner {merchant_pk} --url devnet")
    print()
    print(f"    # Payer ATA (will also be created automatically by the first tx):")
    print(f"    spl-token create-account {USDC_DEVNET_MINT} \\")
    print(f"      --owner {payer_pk} --url devnet")
    print()

    print("─" * 65)
    print()
    print("  STEP 4 — Get devnet USDC (Circle official faucet)")
    print()
    print("    1. Open: https://faucet.circle.com")
    print("    2. Select: Solana Devnet")
    print(f"    3. Paste payer address: {payer_pk}")
    print("    4. Request 10 USDC-Dev (free, not real money)")
    print()
    print("  NOTE: The dev-checkout endpoint sends [order amount] USDC per")
    print("  checkout. With MAX_USDC = $9, 10 USDC covers about 1 demo run.")
    print("  Request more from the faucet as needed.")
    print()

    print("─" * 65)
    print()
    print("  STEP 5 — Rebuild x402-api with new .env values")
    print()
    print("    docker compose build x402-api")
    print("    docker compose up -d --no-deps x402-api")
    print()
    print("  Verify configuration:")
    print("    curl http://localhost:8081/")
    print("    # → demo_payer_configured: true")
    print()

    print("=" * 65)
    print()
    print("  Once configured, /cart checkout will attempt a real Devnet")
    print("  USDC tx. The tx_hash links to:")
    print("    https://explorer.solana.com/tx/<hash>?cluster=devnet")
    print()


if __name__ == "__main__":
    main()
