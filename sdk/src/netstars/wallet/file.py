"""FileWallet — load a Solana keypair from a JSON file."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Union

import base58
import nacl.signing

from ..errors import WalletError


class FileWallet:
    """
    Loads a Solana keypair from the standard `solana-keygen` JSON file format:
    a 64-element JSON array where the first 32 bytes are the private seed and
    the last 32 are the public key.

    >>> w = FileWallet("~/.netstars/wallet.json")
    >>> w.public_key()
    '5KJp…'
    """

    def __init__(self, keypair_path: Union[str, Path]):
        path = Path(os.path.expanduser(str(keypair_path)))
        if not path.exists():
            raise WalletError(
                f"keypair file not found: {path}",
                code="WALLET_NOT_FOUND",
                metadata={"path": str(path)},
            )
        try:
            raw = json.loads(path.read_text())
        except json.JSONDecodeError as e:
            raise WalletError(f"keypair file not JSON: {e}", code="WALLET_PARSE_ERROR") from e
        if not isinstance(raw, list) or len(raw) != 64:
            raise WalletError(
                f"keypair must be 64-element array, got len={len(raw) if isinstance(raw, list) else type(raw).__name__}",
                code="WALLET_FORMAT_ERROR",
            )
        try:
            seed = bytes(raw[:32])
        except (TypeError, ValueError) as e:
            raise WalletError(f"bad byte values in keypair: {e}", code="WALLET_FORMAT_ERROR") from e

        self._sk = nacl.signing.SigningKey(seed)
        self._vk = self._sk.verify_key
        self._pubkey_b58 = base58.b58encode(bytes(self._vk)).decode("ascii")
        self._path = path

    def __repr__(self) -> str:  # pragma: no cover
        return f"FileWallet(pubkey={self._pubkey_b58[:8]}…, path={self._path})"

    # ── Wallet protocol ─────────────────────────────────────────────
    def public_key(self) -> str:
        return self._pubkey_b58

    def sign_message(self, message: bytes) -> bytes:
        signed = self._sk.sign(message)
        return signed.signature

    def sign_usdc_transfer(
        self,
        *,
        amount_usdc_micro: int,
        recipient: str,
        nonce: str,
        recent_blockhash: str,
        usdc_mint: str,
    ) -> str:
        from ..signer import build_and_sign_usdc_transfer
        return build_and_sign_usdc_transfer(
            wallet=self,
            amount_usdc_micro=amount_usdc_micro,
            recipient=recipient,
            nonce=nonce,
            recent_blockhash=recent_blockhash,
            usdc_mint=usdc_mint,
        )
