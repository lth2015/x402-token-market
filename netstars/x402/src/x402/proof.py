"""
Verify a client-submitted SPL TransferChecked + Memo transaction against an
existing payment_orders row.

Wire format we accept (legacy Solana tx, base64-encoded):

    [shortvec(n_sigs)] [sig_0]…[sig_{n-1}] [serialized_message]

A valid X402 proof transaction must:

    1.  Decode and have ≥1 signature.
    2.  Have a parseable `Message` (legacy or v0).
    3.  All declared signatures verify against the message bytes.
    4.  Contain an SPL Token TransferChecked instruction with:
          - mint     == USDC_MINT
          - dest     == ATA(recipient_owner, USDC_MINT)
          - decimals == 6
          - amount   == order.amount_usdc_micro
    5.  Contain an SPL Memo instruction whose UTF-8 data starts with
        "x402-nonce:{order.nonce}".

Returns a `ProofResult` describing what we found, or raises `ProofError`.
"""
from __future__ import annotations

import base64
import struct
from dataclasses import dataclass
from typing import Optional

from solders.hash import Hash
from solders.message import Message
from solders.pubkey import Pubkey
from solders.signature import Signature

# ── Constants (must match sdk/src/netstars/signer.py) ─────────────
TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
ATA_PROGRAM_ID   = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
MEMO_PROGRAM_ID  = Pubkey.from_string("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")
USDC_DECIMALS = 6
_SPL_TRANSFER_CHECKED_DISCRIMINATOR = 12
MEMO_NONCE_PREFIX = "x402-nonce:"


class ProofError(ValueError):
    """Raised when the submitted proof does not satisfy the protocol."""


@dataclass(slots=True)
class ProofResult:
    payer: str                # base58 — the wallet that paid
    amount_usdc_micro: int
    recipient_ata: str        # base58
    memo: str
    signature_b58: str        # tx signature (first sig, = the canonical id)


# ── shortvec ───────────────────────────────────────────────────────
def _shortvec_decode(buf: bytes, offset: int = 0) -> tuple[int, int]:
    """Returns (value, bytes_consumed)."""
    n = 0
    shift = 0
    consumed = 0
    while True:
        if offset + consumed >= len(buf):
            raise ProofError("shortvec ran off buffer end")
        b = buf[offset + consumed]
        consumed += 1
        n |= (b & 0x7F) << shift
        if (b & 0x80) == 0:
            return n, consumed
        shift += 7
        if shift > 14:
            raise ProofError("shortvec too long (>3 bytes)")


def find_associated_token_address(owner: Pubkey, mint: Pubkey) -> Pubkey:
    seeds = [bytes(owner), bytes(TOKEN_PROGRAM_ID), bytes(mint)]
    addr, _bump = Pubkey.find_program_address(seeds, ATA_PROGRAM_ID)
    return addr


# ── Wire parser ───────────────────────────────────────────────────
def _parse_legacy_tx(wire: bytes) -> tuple[list[bytes], bytes]:
    """Split a legacy Solana tx into (signatures, message_bytes)."""
    n_sigs, used = _shortvec_decode(wire, 0)
    if n_sigs == 0:
        raise ProofError("no signatures in transaction")
    if len(wire) < used + n_sigs * 64:
        raise ProofError("signature section truncated")
    sigs: list[bytes] = []
    for i in range(n_sigs):
        start = used + i * 64
        sigs.append(wire[start:start + 64])
    msg_bytes = wire[used + n_sigs * 64:]
    if not msg_bytes:
        raise ProofError("empty message after signatures")
    return sigs, msg_bytes


# ── Main entry point ───────────────────────────────────────────────
def verify_proof(
    *,
    signed_tx_b64: str,
    expected_recipient_owner: str,  # the deposit wallet's owner pubkey
    expected_amount_usdc_micro: int,
    expected_nonce: str,
    usdc_mint: str,
) -> ProofResult:
    """
    Verify a base64-encoded signed transaction against a payment order's
    expectations. Returns ProofResult on success; raises ProofError otherwise.

    NB: this does NOT confirm the tx landed on-chain — that's the confirmer's
    job (poll getSignatureStatuses on the returned signature_b58).
    """
    try:
        wire = base64.b64decode(signed_tx_b64, validate=True)
    except (ValueError, Exception) as e:
        raise ProofError(f"base64 decode failed: {e}") from e

    sigs, msg_bytes = _parse_legacy_tx(wire)
    try:
        msg = Message.from_bytes(msg_bytes)
    except Exception as e:
        raise ProofError(f"message parse failed: {e}") from e

    # Verify signatures: msg.header.num_required_signatures must be <= len(sigs);
    # each sig must verify against msg_bytes for its corresponding account_key.
    n_required = msg.header.num_required_signatures
    if n_required == 0:
        raise ProofError("message claims 0 required signatures")
    if len(sigs) < n_required:
        raise ProofError(f"only {len(sigs)} signatures provided, message requires {n_required}")
    account_keys = list(msg.account_keys)
    if len(account_keys) < n_required:
        raise ProofError("malformed message: not enough account keys for signatures")

    for i in range(n_required):
        try:
            sig = Signature.from_bytes(sigs[i])
        except Exception as e:
            raise ProofError(f"signature[{i}] malformed: {e}") from e
        if not sig.verify(account_keys[i], msg_bytes):
            raise ProofError(f"signature[{i}] did not verify against account {account_keys[i]}")

    # Compute the canonical id of the tx (= first signature, base58)
    sig_b58 = str(Signature.from_bytes(sigs[0]))

    # Expected addresses
    try:
        mint_pk = Pubkey.from_string(usdc_mint)
        recipient_owner_pk = Pubkey.from_string(expected_recipient_owner)
    except Exception as e:
        raise ProofError(f"server config invalid pubkey: {e}") from e
    expected_dest_ata = find_associated_token_address(recipient_owner_pk, mint_pk)

    # Walk instructions
    transfer_seen = False
    memo_seen = False
    memo_text: Optional[str] = None
    payer = str(account_keys[0])

    for ix in msg.instructions:
        program_id = account_keys[ix.program_id_index]
        ix_data = bytes(ix.data)
        ix_accounts = [account_keys[i] for i in ix.accounts]

        if program_id == TOKEN_PROGRAM_ID:
            if transfer_seen:
                raise ProofError("multiple SPL Token instructions; protocol expects exactly one")
            if len(ix_data) < 1:
                raise ProofError("empty SPL Token instruction")
            if ix_data[0] != _SPL_TRANSFER_CHECKED_DISCRIMINATOR:
                raise ProofError(
                    f"SPL Token instruction is not TransferChecked "
                    f"(got variant {ix_data[0]}, want {_SPL_TRANSFER_CHECKED_DISCRIMINATOR})"
                )
            if len(ix_data) < 1 + 8 + 1:
                raise ProofError("TransferChecked data truncated")
            amount = struct.unpack("<Q", ix_data[1:9])[0]
            decimals = ix_data[9]
            if decimals != USDC_DECIMALS:
                raise ProofError(f"TransferChecked decimals={decimals}, want {USDC_DECIMALS}")
            if amount != expected_amount_usdc_micro:
                raise ProofError(
                    f"TransferChecked amount={amount}, want {expected_amount_usdc_micro}"
                )
            # accounts: [source_ata, mint, dest_ata, owner]
            if len(ix_accounts) < 4:
                raise ProofError("TransferChecked needs 4 accounts, got fewer")
            tc_mint = ix_accounts[1]
            tc_dest = ix_accounts[2]
            if tc_mint != mint_pk:
                raise ProofError(f"TransferChecked mint={tc_mint}, want {mint_pk}")
            if tc_dest != expected_dest_ata:
                raise ProofError(
                    f"TransferChecked dest={tc_dest}, want {expected_dest_ata} "
                    f"(ATA of {recipient_owner_pk} for USDC)"
                )
            transfer_seen = True

        elif program_id == MEMO_PROGRAM_ID:
            if memo_seen:
                raise ProofError("multiple Memo instructions; protocol expects exactly one")
            try:
                memo_text = ix_data.decode("utf-8")
            except UnicodeDecodeError as e:
                raise ProofError(f"memo not UTF-8: {e}") from e
            if not memo_text.startswith(MEMO_NONCE_PREFIX):
                raise ProofError(f"memo missing prefix {MEMO_NONCE_PREFIX!r}: {memo_text!r}")
            got_nonce = memo_text[len(MEMO_NONCE_PREFIX):]
            if got_nonce != expected_nonce:
                raise ProofError(
                    f"memo nonce mismatch: got {got_nonce!r}, want {expected_nonce!r}"
                )
            memo_seen = True

        # Other instructions (e.g. ComputeBudget) are tolerated as long as
        # they don't change the verdict. Add stricter checks here if needed.

    if not transfer_seen:
        raise ProofError("no SPL TransferChecked instruction found")
    if not memo_seen:
        raise ProofError("no Memo instruction found")
    assert memo_text is not None

    return ProofResult(
        payer=payer,
        amount_usdc_micro=expected_amount_usdc_micro,
        recipient_ata=str(expected_dest_ata),
        memo=memo_text,
        signature_b58=sig_b58,
    )


__all__ = ["ProofError", "ProofResult", "verify_proof"]


# Defensive: silence unused import for IDEs
_ = Hash
