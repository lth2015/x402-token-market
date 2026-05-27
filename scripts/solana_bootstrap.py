"""
Bootstrap the local Solana validator for X402 real-chain tests.

Creates (idempotent — re-running is safe):
    - merchant keypair        (deposit recipient owner)
    - payer    keypair        (the customer wallet that signs USDC transfers)
    - mint     keypair        (the test USDC mint, freshly created on first run)
    - merchant USDC ATA
    - payer    USDC ATA
    - tops the payer's ATA up to TARGET_USDC ui-units (default 1,000)
    - airdrops SOL to both wallets so they can pay tx fees

Writes:
    {out_dir}/merchant.json    — 64-byte solana-keygen format
    {out_dir}/payer.json
    {out_dir}/mint.json
    {out_dir}/state.json       — { usdc_mint, merchant_pubkey, payer_pubkey, ... }
    {out_dir}/env              — shell-sourceable, sets USDC_MINT and DEPOSIT_RECIPIENT_ADDRESS

Run from the SDK's poetry env (which already has solders + httpx):
    cd sdk
    poetry run python ../scripts/solana_bootstrap.py /abs/path/to/out

Why hand-rolled instructions:
    Avoids depending on the spl-token / spl-associated-token-account Python
    packages, which are stale. solders gives us Pubkey/Keypair/Message/Hash/
    Signature; instruction layouts (InitializeMint2, MintTo, CreateATA) are
    fixed by the Solana program ABIs and inlined here.
"""
from __future__ import annotations

import argparse
import json
import os
import struct
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx
from solders.hash import Hash
from solders.instruction import AccountMeta, Instruction
from solders.keypair import Keypair
from solders.message import Message
from solders.pubkey import Pubkey

# ── Canonical program IDs ─────────────────────────────────────────
SYSTEM_PROGRAM_ID = Pubkey.from_string("11111111111111111111111111111111")
TOKEN_PROGRAM_ID  = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
ATA_PROGRAM_ID    = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
RENT_SYSVAR_ID    = Pubkey.from_string("SysvarRent111111111111111111111111111111111")

USDC_DECIMALS = 6
MINT_ACCOUNT_SIZE = 82  # SPL mint account fixed size

# Instruction discriminators within SPL Token (variant indices)
_IX_INITIALIZE_MINT2 = 20
_IX_MINT_TO          = 7

LAMPORTS_PER_SOL = 1_000_000_000


# ── Helpers ────────────────────────────────────────────────────────
def shortvec(n: int) -> bytes:
    if n < 0 or n > 0xFFFF:
        raise ValueError("shortvec out of range")
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n == 0:
            out.append(b)
            return bytes(out)
        out.append(b | 0x80)


def serialize_legacy_tx(message_bytes: bytes, signatures: list[bytes]) -> bytes:
    parts = [shortvec(len(signatures))]
    for s in signatures:
        if len(s) != 64:
            raise ValueError("signature must be 64 bytes")
        parts.append(s)
    parts.append(message_bytes)
    return b"".join(parts)


class RpcError(RuntimeError):
    pass


@dataclass
class Rpc:
    url: str
    http: httpx.Client
    _id: int = 0

    def call(self, method: str, params: list) -> object:
        self._id += 1
        r = self.http.post(
            self.url,
            json={"jsonrpc": "2.0", "id": self._id, "method": method, "params": params},
            timeout=20.0,
        )
        if r.status_code >= 400:
            raise RpcError(f"{method} HTTP {r.status_code}: {r.text[:200]}")
        body = r.json()
        if "error" in body:
            err = body["error"]
            raise RpcError(f"{method} RPC error: {err.get('message', '?')} ({err.get('code')})")
        return body["result"]


def find_ata(owner: Pubkey, mint: Pubkey) -> Pubkey:
    addr, _bump = Pubkey.find_program_address(
        [bytes(owner), bytes(TOKEN_PROGRAM_ID), bytes(mint)], ATA_PROGRAM_ID
    )
    return addr


# ── Keypair file I/O (solana-keygen compatible) ───────────────────
def load_or_create_keypair(path: Path) -> Keypair:
    if path.exists():
        raw = json.loads(path.read_text())
        return Keypair.from_bytes(bytes(raw))
    kp = Keypair()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(list(bytes(kp))))
    path.chmod(0o600)
    return kp


# ── Confirmation helpers ──────────────────────────────────────────
def wait_for_signature(rpc: Rpc, signature: str, *, timeout_s: float = 30.0) -> dict:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        res = rpc.call("getSignatureStatuses", [[signature], {"searchTransactionHistory": False}])
        value = (res.get("value") or [None])[0] if isinstance(res, dict) else None
        if value:
            if value.get("err"):
                raise RpcError(f"tx {signature} failed: {value['err']!r}")
            level = value.get("confirmationStatus")
            if level in ("confirmed", "finalized"):
                return value
        time.sleep(0.5)
    raise RpcError(f"tx {signature} not confirmed within {timeout_s}s")


def airdrop(rpc: Rpc, recipient: Pubkey, sol: float) -> None:
    lamports = int(sol * LAMPORTS_PER_SOL)
    bal_before = rpc.call("getBalance", [str(recipient)])
    if isinstance(bal_before, dict):
        bal_before = bal_before.get("value", 0)
    if bal_before >= lamports * 5:
        return  # already well-funded; skip airdrop to save time
    sig = rpc.call("requestAirdrop", [str(recipient), lamports])
    if not isinstance(sig, str):
        raise RpcError(f"airdrop returned non-string: {sig!r}")
    wait_for_signature(rpc, sig, timeout_s=15.0)


def get_blockhash(rpc: Rpc) -> Hash:
    res = rpc.call("getLatestBlockhash", [{"commitment": "finalized"}])
    value = res.get("value") or {}
    blockhash = value.get("blockhash")
    if not blockhash:
        raise RpcError(f"getLatestBlockhash missing blockhash: {res!r}")
    return Hash.from_string(blockhash)


def send_signed(rpc: Rpc, message: Message, signers: list[Keypair]) -> str:
    """Sign + serialize + sendTransaction + wait for confirm. Returns signature (base58)."""
    import base64
    msg_bytes = bytes(message)
    sigs = []
    for kp in signers:
        sig_obj = kp.sign_message(msg_bytes)
        sigs.append(bytes(sig_obj))
    wire = serialize_legacy_tx(msg_bytes, sigs)
    tx_b64 = base64.b64encode(wire).decode("ascii")
    signature = rpc.call(
        "sendTransaction",
        [tx_b64, {"encoding": "base64", "skipPreflight": False, "preflightCommitment": "processed"}],
    )
    if not isinstance(signature, str):
        raise RpcError(f"sendTransaction returned non-string: {signature!r}")
    wait_for_signature(rpc, signature)
    return signature


# ── SPL-Token instruction builders (manual layouts) ───────────────
def ix_initialize_mint2(*, mint: Pubkey, decimals: int, mint_authority: Pubkey,
                        freeze_authority: Optional[Pubkey] = None) -> Instruction:
    data = bytearray()
    data.append(_IX_INITIALIZE_MINT2)
    data.append(decimals)
    data.extend(bytes(mint_authority))
    if freeze_authority is None:
        data.append(0)  # COption::None
    else:
        data.append(1)
        data.extend(bytes(freeze_authority))
    return Instruction(
        program_id=TOKEN_PROGRAM_ID,
        accounts=[AccountMeta(pubkey=mint, is_signer=False, is_writable=True)],
        data=bytes(data),
    )


def ix_mint_to(*, mint: Pubkey, dest: Pubkey, authority: Pubkey, amount: int) -> Instruction:
    data = bytes([_IX_MINT_TO]) + struct.pack("<Q", amount)
    return Instruction(
        program_id=TOKEN_PROGRAM_ID,
        accounts=[
            AccountMeta(pubkey=mint,      is_signer=False, is_writable=True),
            AccountMeta(pubkey=dest,      is_signer=False, is_writable=True),
            AccountMeta(pubkey=authority, is_signer=True,  is_writable=False),
        ],
        data=data,
    )


def ix_create_account(*, funder: Pubkey, new_account: Pubkey, lamports: int,
                      space: int, owner: Pubkey) -> Instruction:
    """System Program CreateAccount instruction (variant 0)."""
    data = (
        struct.pack("<I", 0)              # variant index = CreateAccount
        + struct.pack("<Q", lamports)
        + struct.pack("<Q", space)
        + bytes(owner)
    )
    return Instruction(
        program_id=SYSTEM_PROGRAM_ID,
        accounts=[
            AccountMeta(pubkey=funder,      is_signer=True, is_writable=True),
            AccountMeta(pubkey=new_account, is_signer=True, is_writable=True),
        ],
        data=data,
    )


def ix_create_ata(*, funder: Pubkey, ata: Pubkey, owner: Pubkey, mint: Pubkey) -> Instruction:
    """
    Associated-Token-Account program CreateIdempotent (variant 1).
    Idempotent variant avoids 'account already exists' errors.
    """
    data = bytes([1])  # 1 = CreateIdempotent
    return Instruction(
        program_id=ATA_PROGRAM_ID,
        accounts=[
            AccountMeta(pubkey=funder,            is_signer=True,  is_writable=True),
            AccountMeta(pubkey=ata,               is_signer=False, is_writable=True),
            AccountMeta(pubkey=owner,             is_signer=False, is_writable=False),
            AccountMeta(pubkey=mint,              is_signer=False, is_writable=False),
            AccountMeta(pubkey=SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
            AccountMeta(pubkey=TOKEN_PROGRAM_ID,  is_signer=False, is_writable=False),
        ],
        data=data,
    )


# ── High-level operations ─────────────────────────────────────────
def account_exists(rpc: Rpc, pubkey: Pubkey) -> bool:
    res = rpc.call("getAccountInfo", [str(pubkey), {"encoding": "base64"}])
    value = res.get("value") if isinstance(res, dict) else None
    return value is not None


def ata_token_balance(rpc: Rpc, ata: Pubkey) -> int:
    """Return current ui-amount or 0 if account doesn't exist."""
    if not account_exists(rpc, ata):
        return 0
    res = rpc.call("getTokenAccountBalance", [str(ata)])
    value = res.get("value") if isinstance(res, dict) else None
    if not value:
        return 0
    amt = value.get("amount")
    return int(amt or "0")


def create_mint_if_needed(rpc: Rpc, payer: Keypair, mint_kp: Keypair, decimals: int) -> bool:
    """Returns True if a new mint was created, False if it already existed."""
    if account_exists(rpc, mint_kp.pubkey()):
        return False
    rent_res = rpc.call("getMinimumBalanceForRentExemption", [MINT_ACCOUNT_SIZE])
    if not isinstance(rent_res, int):
        raise RpcError(f"unexpected rent reply: {rent_res!r}")
    msg = Message.new_with_blockhash(
        [
            ix_create_account(
                funder=payer.pubkey(),
                new_account=mint_kp.pubkey(),
                lamports=rent_res,
                space=MINT_ACCOUNT_SIZE,
                owner=TOKEN_PROGRAM_ID,
            ),
            ix_initialize_mint2(
                mint=mint_kp.pubkey(),
                decimals=decimals,
                mint_authority=payer.pubkey(),
            ),
        ],
        payer.pubkey(),
        get_blockhash(rpc),
    )
    send_signed(rpc, msg, signers=[payer, mint_kp])
    return True


def ensure_ata(rpc: Rpc, payer: Keypair, owner: Pubkey, mint: Pubkey) -> Pubkey:
    ata = find_ata(owner, mint)
    if account_exists(rpc, ata):
        return ata
    msg = Message.new_with_blockhash(
        [ix_create_ata(funder=payer.pubkey(), ata=ata, owner=owner, mint=mint)],
        payer.pubkey(),
        get_blockhash(rpc),
    )
    send_signed(rpc, msg, signers=[payer])
    return ata


def mint_to_amount(rpc: Rpc, payer: Keypair, mint_authority: Keypair,
                   mint: Pubkey, dest_ata: Pubkey, amount_base: int) -> None:
    msg = Message.new_with_blockhash(
        [
            ix_mint_to(
                mint=mint, dest=dest_ata,
                authority=mint_authority.pubkey(), amount=amount_base,
            ),
        ],
        payer.pubkey(),
        get_blockhash(rpc),
    )
    signers = [payer]
    if mint_authority.pubkey() != payer.pubkey():
        signers.append(mint_authority)
    send_signed(rpc, msg, signers=signers)


# ── main ──────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("out_dir", type=Path, help="output directory for keypairs + env file")
    ap.add_argument("--rpc-url", default=os.environ.get("SOLANA_RPC_URL", "http://localhost:8899"))
    ap.add_argument("--target-usdc-ui", type=int, default=1_000,
                    help="top up payer's USDC ATA to this many UI units (default 1000)")
    ap.add_argument("--airdrop-sol", type=float, default=10.0,
                    help="airdrop this much SOL to each wallet")
    args = ap.parse_args()

    out_dir: Path = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    with httpx.Client() as http:
        rpc = Rpc(url=args.rpc_url, http=http)

        # 0. Validator reachable?
        try:
            health = rpc.call("getHealth", [])
        except RpcError as e:
            print(f"✗ RPC unhealthy at {args.rpc_url}: {e}", file=sys.stderr)
            return 2
        print(f"  ✓ RPC reachable ({args.rpc_url})  health={health!r}")

        # 1. Keypairs
        payer    = load_or_create_keypair(out_dir / "payer.json")
        merchant = load_or_create_keypair(out_dir / "merchant.json")
        mint_kp  = load_or_create_keypair(out_dir / "mint.json")
        print(f"  ✓ payer    = {payer.pubkey()}")
        print(f"  ✓ merchant = {merchant.pubkey()}")
        print(f"  ✓ mint     = {mint_kp.pubkey()}")

        # 2. Airdrops
        print(f"→ airdropping ~{args.airdrop_sol} SOL to payer + merchant…")
        airdrop(rpc, payer.pubkey(),    args.airdrop_sol)
        airdrop(rpc, merchant.pubkey(), args.airdrop_sol)

        # 3. USDC mint
        if create_mint_if_needed(rpc, payer, mint_kp, USDC_DECIMALS):
            print(f"  ✓ mint created: {mint_kp.pubkey()}")
        else:
            print(f"  · mint already exists, reusing: {mint_kp.pubkey()}")

        # 4. ATAs
        merchant_ata = ensure_ata(rpc, payer, merchant.pubkey(), mint_kp.pubkey())
        payer_ata    = ensure_ata(rpc, payer, payer.pubkey(),    mint_kp.pubkey())
        print(f"  ✓ merchant ATA = {merchant_ata}")
        print(f"  ✓ payer    ATA = {payer_ata}")

        # 5. Top up payer USDC if needed
        target_base = args.target_usdc_ui * (10 ** USDC_DECIMALS)
        current_base = ata_token_balance(rpc, payer_ata)
        if current_base >= target_base:
            print(f"  · payer ATA already has {current_base / 10**USDC_DECIMALS} USDC, skipping mint")
        else:
            to_mint = target_base - current_base
            print(f"→ minting {to_mint / 10**USDC_DECIMALS} USDC to payer ATA…")
            mint_to_amount(rpc, payer, payer, mint_kp.pubkey(), payer_ata, to_mint)
            print(f"  ✓ payer ATA balance now {ata_token_balance(rpc, payer_ata) / 10**USDC_DECIMALS} USDC")

        # 6. Persist state + env file
        state = {
            "rpc_url": args.rpc_url,
            "usdc_mint": str(mint_kp.pubkey()),
            "merchant_pubkey": str(merchant.pubkey()),
            "merchant_ata": str(merchant_ata),
            "payer_pubkey": str(payer.pubkey()),
            "payer_ata": str(payer_ata),
            "payer_keypair_path": str((out_dir / "payer.json").resolve()),
            "merchant_keypair_path": str((out_dir / "merchant.json").resolve()),
        }
        (out_dir / "state.json").write_text(json.dumps(state, indent=2))
        (out_dir / "env").write_text(
            f"# Generated by scripts/solana_bootstrap.py — source to inject into x402-api\n"
            f"export USDC_MINT={state['usdc_mint']}\n"
            f"export DEPOSIT_RECIPIENT_ADDRESS={state['merchant_pubkey']}\n"
            f"export NETSTARS_PAYER_WALLET_PATH={state['payer_keypair_path']}\n"
            f"export NETSTARS_BOOTSTRAP_DIR={out_dir.resolve()}\n"
        )

        print()
        print("✅  bootstrap complete")
        print(f"    USDC_MINT                  = {state['usdc_mint']}")
        print(f"    DEPOSIT_RECIPIENT_ADDRESS  = {state['merchant_pubkey']}")
        print(f"    NETSTARS_BOOTSTRAP_DIR     = {out_dir.resolve()}")
        print()
        print("→ next step: restart x402-api so it picks the new env:")
        print("    set -a; . " + str((out_dir / "env").resolve()) + "; set +a")
        print("    docker compose up -d --no-deps --force-recreate x402-api")
        print("→ then re-run quickstart and it'll exercise the real chain end-to-end.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
