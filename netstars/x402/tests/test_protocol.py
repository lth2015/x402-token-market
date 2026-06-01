from __future__ import annotations

import base64
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from x402.protocol import (  # noqa: E402
    NETWORK_SOLANA_DEVNET,
    PaymentPayload,
    SolanaExactPayload,
    XPaymentDecodeError,
    assert_payload_matches_requirements,
    build_challenge_body,
    build_requirements,
    decode_x_payment_header,
    encode_x_payment_header,
)


RESOURCE = "http://x402-api:8080/v1/protected/checkout/order"
USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
PAY_TO = "61e1MSTEN5dTjNGNQcwUivRVubYz6ebYfmz9qvYtkeNr"
FACILITATOR = "http://wea-api:8080"


def valid_payload(**overrides: object) -> PaymentPayload:
  data = {
      "network": NETWORK_SOLANA_DEVNET,
      "resource": RESOURCE,
      "payload": SolanaExactPayload(signedTxBase64="c2lnbmVkLXR4"),
  }
  data.update(overrides)
  return PaymentPayload(**data)


def valid_requirements(**overrides: object):
  data = {
      "network": NETWORK_SOLANA_DEVNET,
      "usdc_mint": USDC_MINT,
      "pay_to": PAY_TO,
      "amount_usdc_micro": 1_500_000,
      "resource": RESOURCE,
      "description": "MARVIE order checkout",
      "nonce": "nonce-test-123",
      "facilitator_url": FACILITATOR,
      "max_timeout_seconds": 600,
      "expires_at": datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
  }
  data.update(overrides)
  return build_requirements(**data)


def test_x_payment_header_round_trip() -> None:
  payload = valid_payload()

  decoded = decode_x_payment_header(encode_x_payment_header(payload))

  assert decoded == payload
  assert decoded.model_dump() == payload.model_dump()


@pytest.mark.parametrize("header", ["not-base64!", "abc==="])
def test_decode_rejects_malformed_base64(header: str) -> None:
  with pytest.raises(XPaymentDecodeError, match="not valid base64"):
    decode_x_payment_header(header)


def test_decode_rejects_non_json_base64() -> None:
  header = base64.b64encode(b"not json").decode("ascii")

  with pytest.raises(XPaymentDecodeError, match="not valid JSON"):
    decode_x_payment_header(header)


def test_decode_rejects_missing_required_field() -> None:
  raw = {
      "x402Version": 1,
      "scheme": "exact",
      "resource": RESOURCE,
      "payload": {"signedTxBase64": "c2lnbmVkLXR4"},
  }
  header = base64.b64encode(json.dumps(raw).encode("utf-8")).decode("ascii")

  with pytest.raises(XPaymentDecodeError, match="schema violation"):
    decode_x_payment_header(header)


def test_payload_requirements_mismatch_scheme_network_and_resource() -> None:
  reqs = valid_requirements()

  with pytest.raises(ValueError, match="scheme mismatch"):
    assert_payload_matches_requirements(
        PaymentPayload(
            scheme="exact",
            network=NETWORK_SOLANA_DEVNET,
            resource=RESOURCE,
            payload=SolanaExactPayload(signedTxBase64="c2lnbmVkLXR4"),
        ).model_copy(update={"scheme": "other"}),
        reqs,
        expected_resource=RESOURCE,
    )

  with pytest.raises(ValueError, match="network mismatch"):
    assert_payload_matches_requirements(
        valid_payload(network="solana"),
        reqs,
        expected_resource=RESOURCE,
    )

  with pytest.raises(ValueError, match="requirements were for"):
    assert_payload_matches_requirements(
        valid_payload(resource=f"{RESOURCE}/other"),
        reqs,
        expected_resource=RESOURCE,
    )

  with pytest.raises(ValueError, match="actual request URL"):
    assert_payload_matches_requirements(
        valid_payload(),
        reqs,
        expected_resource=f"{RESOURCE}/other",
    )


def test_payload_matches_requirements_accepts_matching_payload() -> None:
  assert_payload_matches_requirements(
      valid_payload(),
      valid_requirements(),
      expected_resource=RESOURCE,
  )


def test_build_requirements_extra_and_serialization_shape() -> None:
  reqs = valid_requirements()

  assert reqs.scheme == "exact"
  assert reqs.network == NETWORK_SOLANA_DEVNET
  assert reqs.maxAmountRequired == "1500000"
  assert isinstance(reqs.maxAmountRequired, str)
  assert reqs.payTo == PAY_TO
  assert reqs.asset == USDC_MINT
  assert reqs.extra["nonce"] == "nonce-test-123"
  assert reqs.extra["facilitator"] == FACILITATOR
  assert reqs.extra["decimals"] == 6
  assert reqs.extra["name"] == "USDC"
  assert reqs.extra["expiresAt"] == "2026-06-01T12:00:00+00:00"
  assert reqs.nonce == "nonce-test-123"
  assert reqs.facilitator == FACILITATOR
  assert reqs.expires_at_iso == "2026-06-01T12:00:00+00:00"

  challenge = build_challenge_body([reqs])
  assert challenge["x402Version"] == 1
  assert challenge["error"] == "PAYMENT_REQUIRED"
  assert challenge["accepts"][0]["maxAmountRequired"] == "1500000"
