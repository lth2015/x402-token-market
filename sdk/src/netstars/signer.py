"""
USDC SPL transfer builder + signer · v0.2.0 (real implementation).

What we build:
    [0]  SPL Token TransferChecked  (sender_ATA → recipient_ATA, USDC, amount)
    [1]  SPL Memo                   (UTF-8 "x402-nonce:{nonce}")

Why TransferChecked (not plain Transfer):
    Pins the mint + decimals into the instruction, so the receiver can't be
    tricked by a wrong-mint or wrong-decimals transfer. Mandatory for X402.

We serialize the legacy Solana transaction by hand:
    [shortvec(n_sigs)] [sig_0] ... [sig_{n-1}] [serialized_message]

This avoids depending on solders' Transaction API surface (which changes
across versions). Message construction itself uses `solders.message.Message`
which is stable and correct.

Preconditions caller must satisfy:
    - The sender's USDC ATA exists and holds ≥ amount_usdc_micro
    - The recipient's USDC ATA exists (otherwise create-ATA must be prepended;
      the X402 deposit address is provisioned once at merchant onboarding)

Future: VersionedTransaction + Address Lookup Tables — irrelevant for v0.2.0.
"""
from __future__ import annotations

import base64
import struct

from solders.hash import Hash
from solders.instruction import AccountMeta, Instruction
from solders.message import Message
from solders.pubkey import Pubkey

from .errors import WalletError
from .wallet.base import Wallet

# ── Canonical Solana program IDs (mainnet + devnet identical) ──────
TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
ATA_PROGRAM_ID   = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
MEMO_PROGRAM_ID  = Pubkey.from_string("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")

USDC_DECIMALS = 6
_SPL_TRANSFER_CHECKED_DISCRIMINATOR = 12  # variant index in SPL Token Instruction enum

MEMO_NONCE_PREFIX = "x402-nonce:"  # must match x402-api/proof.py


# ── Helpers ────────────────────────────────────────────────────────
def _shortvec_encode(n: int) -> bytes:
    """Solana 'compact-u16' encoding used for tx signature & account arrays."""
    if n < 0 or n > 0xFFFF:
        raise ValueError(f"shortvec out of range: {n}")
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n == 0:
            out.append(b)
            return bytes(out)
        out.append(b | 0x80)


def find_associated_token_address(owner: Pubkey, mint: Pubkey) -> Pubkey:
    """Standard SPL Associated Token Account derivation (program-derived address)."""
    seeds = [bytes(owner), bytes(TOKEN_PROGRAM_ID), bytes(mint)]
    addr, _bump = Pubkey.find_program_address(seeds, ATA_PROGRAM_ID)
    return addr


def make_transfer_checked_ix(
    *,
    source_ata: Pubkey,
    dest_ata: Pubkey,
    mint: Pubkey,
    owner: Pubkey,
    amount: int,
    decimals: int = USDC_DECIMALS,
) -> Instruction:
    """SPL Token: TransferChecked."""
    data = (
        bytes([_SPL_TRANSFER_CHECKED_DISCRIMINATOR])
        + struct.pack("<Q", amount)
        + bytes([decimals])
    )
    accounts = [
        AccountMeta(pubkey=source_ata, is_signer=False, is_writable=True),
        AccountMeta(pubkey=mint,       is_signer=False, is_writable=False),
        AccountMeta(pubkey=dest_ata,   is_signer=False, is_writable=True),
        AccountMeta(pubkey=owner,      is_signer=True,  is_writable=False),
    ]
    return Instruction(program_id=TOKEN_PROGRAM_ID, accounts=accounts, data=data)


def make_memo_ix(memo: str, signer: Pubkey) -> Instruction:
    """SPL Memo. We mark `signer` as a signer so verifier can attribute the memo."""
    return Instruction(
        program_id=MEMO_PROGRAM_ID,
        accounts=[AccountMeta(pubkey=signer, is_signer=True, is_writable=False)],
        data=memo.encode("utf-8"),
    )


# ── Main entry point used by Wallet.sign_usdc_transfer ────────────
def build_and_sign_usdc_transfer(
    *,
    wallet: Wallet,
    amount_usdc_micro: int,
    recipient: str,
    nonce: str,
    recent_blockhash: str,
    usdc_mint: str,
) -> str:
    """
    Construct a legacy Solana tx carrying:
       (1) SPL TransferChecked of `amount_usdc_micro` USDC from the wallet's
           ATA to the recipient's ATA
       (2) SPL Memo with f"x402-nonce:{nonce}"

    Sign with the wallet's Ed25519 key. Return base64-encoded wire bytes
    ready to POST to the x402 /proof endpoint.
    """
    if amount_usdc_micro <= 0:
        raise WalletError("amount must be positive", code="WALLET_BAD_INPUT")
    if not nonce:
        raise WalletError("nonce required", code="WALLET_BAD_INPUT")

    try:
        owner = Pubkey.from_string(wallet.public_key())
        recipient_pk = Pubkey.from_string(recipient)
        mint_pk = Pubkey.from_string(usdc_mint)
        blockhash = Hash.from_string(recent_blockhash)
    except Exception as e:  # solders raises ValueError on bad base58 / wrong length
        raise WalletError(
            f"invalid Solana input: {e}",
            code="WALLET_BAD_INPUT",
            metadata={
                "recipient": recipient[:12] + "…",
                "usdc_mint": usdc_mint[:12] + "…",
            },
        ) from e

    source_ata = find_associated_token_address(owner, mint_pk)
    dest_ata = find_associated_token_address(recipient_pk, mint_pk)

    ixs = [
        make_transfer_checked_ix(
            source_ata=source_ata,
            dest_ata=dest_ata,
            mint=mint_pk,
            owner=owner,
            amount=amount_usdc_micro,
        ),
        make_memo_ix(memo=f"{MEMO_NONCE_PREFIX}{nonce}", signer=owner),
    ]
    msg = Message.new_with_blockhash(ixs, owner, blockhash)
    msg_bytes = bytes(msg)

    sig_bytes = wallet.sign_message(msg_bytes)
    if len(sig_bytes) != 64:
        raise WalletError(
            f"wallet returned {len(sig_bytes)}-byte sig (expected 64)",
            code="WALLET_BAD_SIGNATURE",
        )

    wire = _shortvec_encode(1) + sig_bytes + msg_bytes
    return base64.b64encode(wire).decode("ascii")
