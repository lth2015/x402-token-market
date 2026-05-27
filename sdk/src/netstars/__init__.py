"""
Netstars SDK · X402-based payment + AI Token client for Agentic Commerce.

Quick start::

    from netstars import Client, FileWallet

    client = Client(
        api_key="ak_…",
        api_key_secret="…",
        wallet=FileWallet("~/.netstars/wallet.json"),
        env="devnet",
    )
    balance = client.tokens.balance()
    resp = client.chat(model="claude-opus-4-7", messages=[{"role":"user","content":"hi"}])

See https://developer.netstars.jp for full docs.
"""

from .client import Client
from .errors import (
    AuthenticationError,
    AuthorizationError,
    InsufficientBalanceError,
    NetstarsError,
    PaymentFailedError,
    PaymentRequiredError,
    RateLimitError,
    ServerError,
    TimeoutError,
    ValidationError,
    WalletError,
)
from .models import ChatRequest, ChatResponse, PaymentIntent, PaymentOrder, Usage
from .wallet import FileWallet, Wallet

__version__ = "0.1.0"
__all__ = [
    "Client",
    "FileWallet",
    "Wallet",
    # models
    "ChatRequest",
    "ChatResponse",
    "PaymentIntent",
    "PaymentOrder",
    "Usage",
    # errors
    "NetstarsError",
    "AuthenticationError",
    "AuthorizationError",
    "PaymentRequiredError",
    "PaymentFailedError",
    "InsufficientBalanceError",
    "RateLimitError",
    "ValidationError",
    "ServerError",
    "TimeoutError",
    "WalletError",
]
