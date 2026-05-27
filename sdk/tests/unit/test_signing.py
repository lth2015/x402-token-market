"""Unit tests for HMAC request signing — pure-function, offline, fast."""
from __future__ import annotations

import hashlib
import hmac

from netstars.transport import sign_request


def _expected_sig(method: str, path: str, body: bytes, ts: str, nonce: str, secret: str) -> str:
    body_sha = hashlib.sha256(body).hexdigest()
    msg = f"{method.upper()}\n{path}\n{ts}\n{nonce}\n{body_sha}"
    return hmac.new(secret.encode(), msg.encode(), hashlib.sha256).hexdigest()


def test_sign_request_headers_present():
    h = sign_request(
        method="POST", path="/v1/payments", body=b'{"a":1}',
        api_key_id="ak_test", api_key_secret="s3cret",
    )
    assert h["Authorization"] == "Bearer ak_test"
    assert "X-Netstars-Timestamp" in h
    assert "X-Netstars-Nonce" in h
    assert len(h["X-Netstars-Signature"]) == 64  # sha256 hex


def test_sign_request_body_changes_signature():
    h1 = sign_request(method="POST", path="/v1/x", body=b"a",
                      api_key_id="ak", api_key_secret="s")
    h2 = sign_request(method="POST", path="/v1/x", body=b"b",
                      api_key_id="ak", api_key_secret="s")
    assert h1["X-Netstars-Signature"] != h2["X-Netstars-Signature"]


def test_sign_request_matches_independent_computation():
    body = b'{"amount_usdc_micro":10000000}'
    h = sign_request(method="POST", path="/v1/payments", body=body,
                     api_key_id="ak_xyz", api_key_secret="topsecret")
    expected = _expected_sig(
        method="POST", path="/v1/payments", body=body,
        ts=h["X-Netstars-Timestamp"], nonce=h["X-Netstars-Nonce"],
        secret="topsecret",
    )
    assert h["X-Netstars-Signature"] == expected


def test_sign_request_method_changes_signature():
    h_post = sign_request(method="POST", path="/x", body=b"", api_key_id="ak", api_key_secret="s")
    h_get  = sign_request(method="GET",  path="/x", body=b"", api_key_id="ak", api_key_secret="s")
    # different method must give different signature even with same body/path
    assert h_post["X-Netstars-Signature"] != h_get["X-Netstars-Signature"]
