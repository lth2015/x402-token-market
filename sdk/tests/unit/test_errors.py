"""Unit tests for response→exception mapping."""
from __future__ import annotations

import httpx
import pytest

from netstars import errors
from netstars.transport import _map_response


def _mock_resp(status: int, body: dict | None = None, headers: dict | None = None) -> httpx.Response:
    req = httpx.Request("POST", "https://api.test/v1/x")
    return httpx.Response(
        status, request=req,
        json=body if body is not None else {},
        headers=headers or {},
    )


def test_401_maps_to_authentication():
    e = _map_response(_mock_resp(401, {"error_code": "BAD_KEY", "detail": "key invalid"}))
    assert isinstance(e, errors.AuthenticationError)
    assert e.code == "BAD_KEY"


def test_403_maps_to_authorization():
    e = _map_response(_mock_resp(403))
    assert isinstance(e, errors.AuthorizationError)


def test_402_with_intent_payload_maps_to_payment_required():
    body = {
        "error_code": "INSUFFICIENT_BALANCE",
        "detail": "need 1000 token, have 500",
        "metadata": {"balance": 500, "required": 1000},
        "payment_intent": {
            "order_id": "pmt_01XYZ",
            "amount_usdc_micro": 1000000,
            "recipient": "ABCDEFGabcdefg",
            "nonce": "deadbeef" * 8,
        },
    }
    e = _map_response(_mock_resp(402, body))
    assert isinstance(e, errors.InsufficientBalanceError)
    assert e.intent is not None
    assert e.intent.order_id == "pmt_01XYZ"
    assert e.intent.amount_usdc_micro == 1000000


def test_429_carries_retry_after():
    e = _map_response(_mock_resp(429, headers={"Retry-After": "42"}))
    assert isinstance(e, errors.RateLimitError)
    assert e.retry_after == 42


def test_500_maps_to_server_error():
    e = _map_response(_mock_resp(500))
    assert isinstance(e, errors.ServerError)


def test_4xx_falls_through_to_validation():
    e = _map_response(_mock_resp(400, {"detail": "bad input"}))
    assert isinstance(e, errors.ValidationError)
