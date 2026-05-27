#!/usr/bin/env python3
"""
wea-api end-to-end smoke test.

Closes the loop:
  1. Boot a tiny HTTP server on this machine to receive callbacks.
  2. POST /v1/settlements to wea-api, pointing callback_url at our server.
  3. Wait for the callback to arrive (worker advances pending → broadcasting
     → confirmed → done, then POSTs HMAC-signed body to us).
  4. Verify the HMAC signature, the status, and that GET /v1/settlements/{id}
     reports `status=done` + `callback_status=sent_ok`.

Run:
  python3 scripts/wea_smoke.py
"""
from __future__ import annotations

import hashlib
import hmac
import http.server
import json
import os
import secrets
import socket
import sys
import threading
import time
import urllib.request
import urllib.error

WEA_BASE        = os.environ.get("WEA_BASE",     "http://localhost:8082")
# Callback URL must be reachable FROM the wea-api docker container, so we use
# host.docker.internal which Docker Desktop on macOS/Windows maps to the host.
# On Linux you'd typically pass `--add-host=host.docker.internal:host-gateway`
# (already covered by docker-compose's networking on recent Docker Desktop).
CALLBACK_HOST   = os.environ.get("CALLBACK_HOST", "host.docker.internal")
TIMEOUT_SECS    = int(os.environ.get("TIMEOUT_SECS", "30"))


class Receiver(http.server.BaseHTTPRequestHandler):
    """Captures one POST then sets the global `received` event."""
    server_version = "wea-smoke/0.1"

    def do_POST(self):  # noqa: N802 (BaseHTTPRequestHandler API)
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else b""
        self.server.captured = {  # type: ignore[attr-defined]
            "body":      body,
            "ts":        self.headers.get("X-Wea-Timestamp"),
            "sig":       self.headers.get("X-Wea-Signature"),
            "stl_id":    self.headers.get("X-Wea-Settlement-Id"),
            "ctype":     self.headers.get("Content-Type"),
        }
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')
        self.server.received.set()  # type: ignore[attr-defined]

    def log_message(self, *_):  # quiet
        pass


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("0.0.0.0", 0))
        return s.getsockname()[1]


def post_json(url: str, body: dict) -> dict:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())


def get_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.loads(r.read().decode())


def main() -> int:
    print(f"  wea base:     {WEA_BASE}")
    print(f"  callback via: {CALLBACK_HOST}")

    # 1) Boot receiver.
    port = free_port()
    server = http.server.HTTPServer(("0.0.0.0", port), Receiver)
    server.received = threading.Event()  # type: ignore[attr-defined]
    server.captured = None               # type: ignore[attr-defined]
    th = threading.Thread(target=server.serve_forever, daemon=True)
    th.start()
    print(f"\n[1] receiver listening on 0.0.0.0:{port}")

    # 2) POST a settlement.
    secret = secrets.token_hex(16)
    fake_signed_tx_b64 = "FAKE_TX_FOR_MVP_DOES_NOT_NEED_TO_PARSE"
    payload = {
        "payment_order_id":      f"pmt_smoke_{secrets.token_hex(4)}",
        "expected_amount_micro": 5_000_000,         # 5 USDC
        "expected_recipient":    "5dHJpDeM4kvNSnSqkA2D9wmJZ5fHZ3iH3a6CkZxJ2hYz",
        "expected_asset":        "USDC",
        "signed_tx_b64":         fake_signed_tx_b64,
        "callback_url":          f"http://{CALLBACK_HOST}:{port}/wea/callback",
        "callback_secret":       secret,
        "confirmation_level":    "confirmed",
    }
    print(f"[2] POST {WEA_BASE}/v1/settlements")
    print(f"    payment_order_id = {payload['payment_order_id']}")
    created = post_json(f"{WEA_BASE}/v1/settlements", payload)
    print(f"    ✓ accepted: settlement_id={created['settlement_id']} status={created['status']}")
    stl_id = created["settlement_id"]

    # 3) Wait for callback.
    print(f"[3] waiting up to {TIMEOUT_SECS}s for HMAC-signed callback ...")
    if not server.received.wait(timeout=TIMEOUT_SECS):
        print("    ✗ callback NEVER arrived. Check `docker logs x402m_wea_api`.")
        return 2

    cap = server.captured  # type: ignore[union-attr]
    body = cap["body"]
    expected_sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    sig_ok = hmac.compare_digest(expected_sig, (cap["sig"] or ""))
    body_json = json.loads(body)
    print(f"    ✓ received {len(body)} bytes, HMAC valid={sig_ok}")
    print(f"      X-Wea-Settlement-Id = {cap['stl_id']}")
    print(f"      payload.status      = {body_json.get('status')}")
    print(f"      payload.tx_hash     = {body_json.get('tx_hash')}")

    if not sig_ok:
        print(f"    ✗ HMAC mismatch. expected={expected_sig}  got={cap['sig']}")
        return 3
    if body_json.get("status") not in {"confirmed", "failed"}:
        print(f"    ✗ unexpected payload status: {body_json.get('status')!r}")
        return 4
    if cap["stl_id"] != stl_id:
        print(f"    ✗ X-Wea-Settlement-Id mismatch: {cap['stl_id']!r} vs {stl_id}")
        return 5

    # 4) GET /v1/settlements/{id} — worker has flipped to `done` post-callback.
    # Allow a brief delay for the post-callback UPDATE to settle.
    final = None
    for _ in range(20):
        final = get_json(f"{WEA_BASE}/v1/settlements/{stl_id}")
        if final.get("status") == "done" and final.get("callback_status") == "sent_ok":
            break
        time.sleep(0.2)
    print(f"[4] GET {WEA_BASE}/v1/settlements/{stl_id}")
    print(f"    status={final.get('status')}  callback_status={final.get('callback_status')}  "
          f"tx_hash={final.get('tx_hash')}")
    if final.get("status") != "done" or final.get("callback_status") != "sent_ok":
        print("    ✗ row did not reach terminal (done + sent_ok).")
        return 6

    print("\n✅  wea closed the loop end-to-end (pending → broadcasting → confirmed → done).")
    server.shutdown()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
