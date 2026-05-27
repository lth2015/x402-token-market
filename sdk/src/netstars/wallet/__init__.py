"""Wallet abstraction. Pluggable Signer: file, env, AWS-KMS-encrypted keypair."""
from .base import Wallet
from .file import FileWallet

__all__ = ["Wallet", "FileWallet"]
