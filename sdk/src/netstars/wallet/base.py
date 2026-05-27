"""
Wallet protocol — abstracts where the Ed25519 signing key lives.

Concrete implementations:
- FileWallet  — Solana keypair JSON file (dev/test)
- EnvWallet   — base58 secret in env var (CI / dev)
- KMSWallet   — AWS-KMS-encrypted Ed25519 keypair, decrypted to memory on use
                (enterprise, Phase 3). AWS KMS lacks native Ed25519 Sign, so the
                keypair itself is the encrypted payload — not a KMS-resident key.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class Wallet(Protocol):
    """Minimal interface every Wallet implementation must satisfy."""

    def public_key(self) -> str:
        """Return the wallet's Solana public key (base58)."""
        ...

    def sign_message(self, message: bytes) -> bytes:
        """Sign an arbitrary byte string; return raw 64-byte Ed25519 signature."""
        ...

    # Higher-level: build & sign a USDC SPL transfer for the supplied params.
    # Returns base64-encoded signed transaction.
    #
    # In v0.1.0 we provide a default implementation in signer.py;
    # advanced wallets (KMS) can override to do tx building remotely.
    def sign_usdc_transfer(
        self,
        *,
        amount_usdc_micro: int,
        recipient: str,
        nonce: str,
        recent_blockhash: str,
        usdc_mint: str,
    ) -> str: ...
