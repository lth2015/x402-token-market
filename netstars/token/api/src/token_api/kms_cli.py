"""
Ops CLI for the KMS path. Two subcommands:

    encrypt   plaintext → KMS CiphertextBlob (printed as base64 + as a MySQL
              FROM_BASE64('…') SQL snippet ready to paste into an UPDATE)
    decrypt   CiphertextBlob (base64) → plaintext (for verification only;
              DO NOT pipe the output to logs)

Typical flow when ops creates a new agent_key in QA/prod:

    1. Generate a fresh random secret:
           secret=$(openssl rand -hex 24)         # 48 hex chars = 192-bit
    2. Encrypt with the env's KMS key:
           KMS_MODE=aws AWS_REGION=ap-northeast-1 AWS_KMS_KEY_ALIAS=alias/netstars-token \\
             poetry run python -m token_api.kms_cli encrypt --plaintext "$secret"
    3. Use the printed SQL snippet to INSERT into agent_keys.
    4. Hand the *plaintext* secret to the merchant out-of-band; the server
       never sees plaintext again (it's the KMS-decrypted bytes from now on).

The CLI uses the same `make_kms_client()` factory the server does, so it
respects KMS_MODE — running it with KMS_MODE=dev just round-trips bytes,
which is useful for local testing of the SDK signing path.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import os
import sys
from typing import Optional

from .kms import KmsError, make_kms_client


async def _cmd_encrypt(plaintext: str, key_id: Optional[str]) -> int:
    client = make_kms_client()
    try:
        ct = await client.encrypt(plaintext.encode("utf-8"), key_id=key_id)
    except KmsError as e:
        print(f"✗ encrypt failed: {e}", file=sys.stderr)
        return 2
    b64 = base64.b64encode(ct).decode("ascii")
    print(f"# KMS mode: {client.mode}")
    print(f"# Ciphertext is {len(ct)} bytes ({len(b64)} chars base64)")
    print()
    print(f"ciphertext_base64={b64}")
    print()
    print("# SQL snippet (paste into an UPDATE on agent_keys):")
    print(f"UPDATE agent_keys SET key_secret_enc = FROM_BASE64('{b64}') WHERE id = '<agk_id>';")
    return 0


async def _cmd_decrypt(ciphertext_b64: str) -> int:
    client = make_kms_client()
    try:
        ct = base64.b64decode(ciphertext_b64, validate=True)
    except Exception as e:
        print(f"✗ bad base64 input: {e}", file=sys.stderr)
        return 2
    try:
        plaintext = await client.decrypt(ct)
    except KmsError as e:
        print(f"✗ decrypt failed: {e}", file=sys.stderr)
        return 2
    print(f"# KMS mode: {client.mode}")
    print(f"# Plaintext: {len(plaintext)} bytes")
    print(plaintext.decode("utf-8", errors="replace"))
    return 0


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(
        prog="python -m token_api.kms_cli",
        description="Encrypt/decrypt agent-key secrets via the configured KMS.",
    )
    sub = ap.add_subparsers(dest="cmd", required=True)

    enc = sub.add_parser("encrypt", help="Plaintext → KMS CiphertextBlob (base64)")
    enc.add_argument("--plaintext", required=True, help="The secret to encrypt")
    enc.add_argument("--key-id", default=os.environ.get("AWS_KMS_KEY_ALIAS"),
                     help="alias/<name> or KMS key ARN (defaults to AWS_KMS_KEY_ALIAS)")

    dec = sub.add_parser("decrypt", help="CiphertextBlob (base64) → plaintext")
    dec.add_argument("--ciphertext-b64", required=True, help="Base64-encoded ciphertext")

    args = ap.parse_args(argv)

    if args.cmd == "encrypt":
        return asyncio.run(_cmd_encrypt(args.plaintext, args.key_id))
    if args.cmd == "decrypt":
        return asyncio.run(_cmd_decrypt(args.ciphertext_b64))
    ap.print_help(sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
