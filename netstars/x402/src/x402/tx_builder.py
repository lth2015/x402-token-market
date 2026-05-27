"""
Build and sign X402 payment transactions for Solana.

Used by the dev-checkout endpoint to construct a real devnet USDC payment
without requiring a client-side wallet. In production deployments, the
client wallet (Phantom / Solflare) would perform this signing browser-side.

Transaction structure (legacy Solana format):
  1. [optional] SPL ATA CreateIdempotent — ensure recipient ATA exists
  2. SPL Token TransferChecked — payer ATA → recipient ATA
  3. SPL Memo — "x402-nonce:{order_nonce}"

This is the exact structure that proof.py verifies. Extra instructions
(CreateIdempotent) are tolerated by the verifier per its comment:
  "Other instructions (e.g. ComputeBudget) are tolerated as long as
   they don't change the verdict."
"""
from __future__ import annotations

import base64
import struct

from solders.hash import Hash
from solders.instruction import AccountMeta, Instruction
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.transaction import Transaction

# ── Program IDs (must match proof.py) ─────────────────────────────────────────
TOKEN_PROGRAM_ID  = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
ATA_PROGRAM_ID    = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
MEMO_PROGRAM_ID   = Pubkey.from_string("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")
SYSTEM_PROGRAM_ID = Pubkey.from_string("11111111111111111111111111111111")

_TRANSFER_CHECKED_IX = 12   # SPL Token instruction discriminator
USDC_DECIMALS        = 6


class TxBuildError(RuntimeError):
    """Raised when transaction construction fails for any reason."""


# ── PDA helpers ────────────────────────────────────────────────────────────────

def find_ata(owner: Pubkey, mint: Pubkey) -> Pubkey:
    """
    Derive the Associated Token Account (ATA) address deterministically.
    Mirrors proof.py's find_associated_token_address exactly.
    """
    seeds = [bytes(owner), bytes(TOKEN_PROGRAM_ID), bytes(mint)]
    addr, _ = Pubkey.find_program_address(seeds, ATA_PROGRAM_ID)
    return addr


# ── Instruction builders ───────────────────────────────────────────────────────

def _ix_create_ata_idempotent(
    payer: Pubkey,
    owner: Pubkey,
    mint: Pubkey,
    ata: Pubkey,
) -> Instruction:
    """
    ATA Program CreateIdempotent (discriminator = 1).
    Safe to include even when the ATA already exists — the program is a no-op
    in that case, so we always prepend it to make the first payment work.

    Accounts (ATA program v1.1+, no rent-sysvar needed):
      0  payer              writable, signer   — pays rent if new
      1  associated_token   writable           — new ATA address
      2  owner              readonly           — ATA owner
      3  mint               readonly           — token mint
      4  system_program     readonly
      5  token_program      readonly
    """
    return Instruction(
        ATA_PROGRAM_ID,
        bytes([1]),   # CreateIdempotent discriminator
        [
            AccountMeta(payer,             is_signer=True,  is_writable=True),
            AccountMeta(ata,               is_signer=False, is_writable=True),
            AccountMeta(owner,             is_signer=False, is_writable=False),
            AccountMeta(mint,              is_signer=False, is_writable=False),
            AccountMeta(SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
            AccountMeta(TOKEN_PROGRAM_ID,  is_signer=False, is_writable=False),
        ],
    )


def _ix_transfer_checked(
    source_ata: Pubkey,
    mint: Pubkey,
    dest_ata: Pubkey,
    authority: Pubkey,
    amount_micro: int,
    decimals: int = USDC_DECIMALS,
) -> Instruction:
    """
    SPL Token TransferChecked (discriminator = 12).
    Transfers `amount_micro` smallest units (micro-USDC) with an explicit
    decimals check so the verifier can validate the amount unambiguously.

    Accounts:
      0  source_ata   writable           — sender's ATA (debit here)
      1  mint         readonly           — token mint (decimals check)
      2  dest_ata     writable           — receiver's ATA (credit here)
      3  authority    signer             — source ATA owner / delegate
    """
    data = bytes([_TRANSFER_CHECKED_IX]) + struct.pack("<Q", amount_micro) + bytes([decimals])
    return Instruction(
        TOKEN_PROGRAM_ID,
        data,
        [
            AccountMeta(source_ata, is_signer=False, is_writable=True),
            AccountMeta(mint,       is_signer=False, is_writable=False),
            AccountMeta(dest_ata,   is_signer=False, is_writable=True),
            AccountMeta(authority,  is_signer=True,  is_writable=False),
        ],
    )


def _ix_memo(text: str) -> Instruction:
    """
    SPL Memo instruction (no data discriminator — raw UTF-8 bytes).
    Embeds the nonce so proof.py can verify `x402-nonce:{nonce}` exactly.
    """
    return Instruction(MEMO_PROGRAM_ID, text.encode("utf-8"), [])


# ── Public API ─────────────────────────────────────────────────────────────────

def build_x402_payment_tx(
    *,
    payer_keypair: Keypair,
    recipient_owner: Pubkey,
    mint: Pubkey,
    amount_micro: int,
    nonce: str,
    recent_blockhash: Hash,
    ensure_dest_ata: bool = True,
) -> bytes:
    """
    Build and sign a legacy Solana X402 payment transaction.

    Returns raw wire bytes (shortvec(n_sigs) + sigs + message) ready for
    base64-encoding and submission to POST /v1/payments/{id}/proof.

    Parameters
    ----------
    payer_keypair     Solana keypair that both pays the fee and signs the
                      TransferChecked (i.e. owns the source USDC ATA).
    recipient_owner   The **owner** public key of the destination wallet;
                      the ATA is derived deterministically from it.
    mint              USDC mint address (devnet: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU).
    amount_micro      Amount in micro-USDC (1 USDC = 1_000_000).
    nonce             The `nonce` from the payment order row (verified by proof.py).
    recent_blockhash  Latest finalized blockhash from the Solana RPC.
    ensure_dest_ata   If True (default), prepend a CreateIdempotentATA instruction
                      so the recipient ATA is created if it does not yet exist.

    Raises
    ------
    TxBuildError      If any construction step fails.
    """
    if amount_micro <= 0:
        raise TxBuildError(f"amount_micro must be > 0, got {amount_micro}")

    payer       = payer_keypair.pubkey()
    source_ata  = find_ata(payer, mint)
    dest_ata    = find_ata(recipient_owner, mint)

    instructions: list[Instruction] = []

    if ensure_dest_ata:
        instructions.append(
            _ix_create_ata_idempotent(payer, recipient_owner, mint, dest_ata)
        )

    instructions.append(
        _ix_transfer_checked(source_ata, mint, dest_ata, payer, amount_micro)
    )
    instructions.append(
        _ix_memo(f"x402-nonce:{nonce}")
    )

    try:
        tx = Transaction.new_signed_with_payer(
            instructions,
            payer=payer,
            signing_keypairs=[payer_keypair],
            recent_blockhash=recent_blockhash,
        )
    except Exception as exc:
        raise TxBuildError(f"Transaction.new_signed_with_payer failed: {exc}") from exc

    return bytes(tx)


def keypair_from_b64(b64_str: str) -> Keypair:
    """
    Restore a Keypair from its base64-encoded 64-byte representation.
    (setup-devnet-wallet.py stores keys in this format.)
    """
    try:
        raw = base64.b64decode(b64_str.strip())
    except Exception as exc:
        raise TxBuildError(f"base64 decode of keypair failed: {exc}") from exc
    if len(raw) != 64:
        raise TxBuildError(f"keypair must be 64 bytes, got {len(raw)}")
    try:
        return Keypair.from_bytes(raw)
    except Exception as exc:
        raise TxBuildError(f"Keypair.from_bytes failed: {exc}") from exc


__all__ = [
    "TxBuildError",
    "find_ata",
    "build_x402_payment_tx",
    "keypair_from_b64",
]
