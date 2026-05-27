"""
X402 protocol coordinator — auto-negotiates the 402 → pay → retry dance.
"""
from __future__ import annotations

import time
from typing import TYPE_CHECKING, Optional

from .errors import PaymentFailedError, PaymentRequiredError, TimeoutError

if TYPE_CHECKING:
    from .client import Client
    from .models import PaymentIntent, PaymentOrder


class X402Coordinator:
    """
    Wraps a single business call (e.g. POST /v1/messages) and, if the server
    returns 402, automatically:

      1. signs a USDC transfer locally,
      2. POSTs the proof to /v1/payments/{id}/proof,
      3. polls until the order reaches `token_credited`,
      4. retries the original call exactly once.

    A second 402 on the retry raises PaymentFailedError to prevent loops.
    """

    def __init__(self, client: "Client"):
        self._client = client

    def call(self, method: str, path: str, *, json_body: dict, trace_id: Optional[str] = None):
        from .transport import new_traceparent
        trace = trace_id or new_traceparent()
        attempts_with_402 = 0
        while True:
            try:
                resp = self._client._transport.request(method, path, json_body=json_body, trace_id=trace)
                return resp
            except PaymentRequiredError as exc:
                attempts_with_402 += 1
                if attempts_with_402 > 1:
                    raise PaymentFailedError(
                        "received 402 again after a successful top-up — "
                        "possible balance race or pricing mismatch",
                        trace_id=trace,
                    ) from exc
                if not self._client._auto_purchase:
                    raise
                if exc.intent is None:
                    raise PaymentFailedError(
                        "402 response did not include a payment_intent",
                        trace_id=trace,
                    ) from exc
                self._client._emit("payment_initiated", order_id=exc.intent.order_id,
                                   amount_usdc_micro=exc.intent.amount_usdc_micro, trace_id=trace)
                self._handle_402(exc.intent, trace)
                self._client._emit("payment_confirmed", order_id=exc.intent.order_id, trace_id=trace)
                # loop → retry original request

    # ── Internal ────────────────────────────────────────────────────
    def _handle_402(self, intent: "PaymentIntent", trace_id: str) -> None:
        """Sign the USDC transfer, submit proof, wait for credit."""
        # Step 1: get a recent blockhash (this would be a real Solana RPC call;
        #         in v0.1.0 we delegate to the Wallet which may stub it).
        # The Wallet.sign_usdc_transfer expects recent_blockhash + usdc_mint.
        # In v0.1.0 we don't have a Solana RPC client in the SDK; the SDK gets
        # `recent_blockhash` and `usdc_mint` from the 402 response metadata
        # (server populates them) or a future helper.
        recent_blockhash = (intent.model_dump().get("recent_blockhash")
                            or "DUMMY_BLOCKHASH_for_v0.1.0")
        usdc_mint = (intent.model_dump().get("usdc_mint")
                     or "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")  # devnet
        signed_tx_b64 = self._client._wallet.sign_usdc_transfer(
            amount_usdc_micro=intent.amount_usdc_micro,
            recipient=intent.recipient,
            nonce=intent.nonce,
            recent_blockhash=recent_blockhash,
            usdc_mint=usdc_mint,
        )

        # Step 2: submit proof
        self._client._transport.post(
            f"/v1/payments/{intent.order_id}/proof",
            json_body={"signed_tx_base64": signed_tx_b64},
            trace_id=trace_id,
        )

        # Step 3: poll for token_credited
        self._wait_for_credit(intent.order_id, trace_id, timeout=30.0)

    def _wait_for_credit(self, order_id: str, trace_id: str, *, timeout: float) -> "PaymentOrder":
        from .models import PaymentOrder
        deadline = time.time() + timeout
        while time.time() < deadline:
            resp = self._client._transport.get(f"/v1/payments/{order_id}", trace_id=trace_id)
            order = PaymentOrder.model_validate(resp.json())
            if order.status == "token_credited":
                return order
            if order.status in {"failed", "expired", "canceled", "refunded"}:
                raise PaymentFailedError(
                    f"order ended in '{order.status}': {order.status_reason or 'no reason'}",
                    order=order, trace_id=trace_id,
                )
            time.sleep(0.5)
        raise TimeoutError(
            f"payment {order_id} not credited within {timeout:.1f}s",
            trace_id=trace_id,
        )
