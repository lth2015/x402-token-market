# X402 Gateway · Detailed Design

> **属于**：[ARCHITECTURE.md](ARCHITECTURE.md) · [PRD.md](PRD.md)
> **DB**：Aurora MySQL 8.0（详见 [db/SCHEMA.sql](db/SCHEMA.sql)）

---

## 1. 项目骨架

```
netstars/x402/
├─ src/x402/
│   ├─ main.py                  FastAPI app + uvicorn entrypoint
│   ├─ deps.py                  DI factories (DB session, Redis, settings)
│   ├─ config.py                Pydantic Settings (从 env)
│   ├─ db/
│   │   ├─ engine.py            SQLAlchemy 2.0 Core + asyncio
│   │   └─ tables.py            Table objects（不是 ORM；只用 Core）
│   ├─ models/                  Pydantic v2 dataclasses (API I/O)
│   │   ├─ payment.py
│   │   ├─ webhook.py
│   │   └─ admin.py
│   ├─ routers/
│   │   ├─ payments.py          /v1/payments/*
│   │   ├─ webhook_inbound.py   /internal/wea/callback
│   │   └─ admin.py             /admin/*
│   ├─ services/
│   │   ├─ orders.py            创建/查询/状态迁移
│   │   ├─ idempotency.py       Redis + DB 双保险
│   │   ├─ proof_verifier.py    Solana tx 解析与校验
│   │   ├─ wea_client.py        mTLS httpx client to Wea
│   │   ├─ token_client.py      mTLS httpx client to Token
│   │   └─ webhook_sender.py    出站 webhook，HMAC 签名
│   ├─ workers/
│   │   ├─ main.py              worker entrypoint
│   │   ├─ expire_scanner.py    每分钟扫过期订单
│   │   ├─ webhook_retry.py     失败 webhook 重投
│   │   └─ reconciler.py        每小时三方对账
│   ├─ middleware/
│   │   ├─ auth.py              API Key + HMAC 校验
│   │   ├─ tracing.py           W3C TraceContext
│   │   ├─ logging.py           structured JSON
│   │   └─ errors.py            统一 RFC9457 错误响应
│   ├─ ulid.py                  ULID generation
│   └─ healthcheck.py
├─ tests/
├─ Dockerfile
├─ docker-compose.yml          local dev (MySQL + Redis + 自身)
└─ pyproject.toml
```

---

## 2. 关键算法 · 订单创建 + Idempotency 双保险

```python
# src/x402/services/orders.py

class OrderService:
    def __init__(self, db: AsyncEngine, redis: Redis, settings: Settings):
        self._db = db
        self._redis = redis
        self._s = settings

    async def create_payment(
        self,
        req: CreatePaymentRequest,
        api_key_id: str,
        idempotency_key: str,
        trace_id: str,
    ) -> PaymentOrder:
        # ── Step 1: Redis lock (fast path) ──────────────────────────────
        redis_key = f"idem:{api_key_id}:{idempotency_key}"
        body_hash = sha256(req.canonical_json().encode()).hexdigest()

        lock_result = await self._redis.set(
            redis_key, body_hash,
            nx=True, ex=86400,                # 24h
        )
        if not lock_result:
            # Already exists — check body match
            cached_hash = await self._redis.get(redis_key)
            if cached_hash != body_hash.encode():
                raise IdempotencyConflictError()
            # Fetch existing order
            return await self._fetch_by_idempotency(api_key_id, idempotency_key)

        # ── Step 2: DB transaction (truth path) ─────────────────────────
        try:
            async with self._db.begin() as conn:
                order_id = "pmt_" + new_ulid()
                expires_at = utcnow() + timedelta(seconds=self._s.payment_order_expiry_seconds)

                try:
                    await conn.execute(insert(payment_orders).values(
                        id=order_id,
                        merchant_id=req.merchant_id,
                        api_key_id=api_key_id,
                        idempotency_key=idempotency_key,
                        amount_usdc_micro=req.amount_usdc_micro,
                        recipient=self._s.payment_recipient_address,
                        nonce=secrets.token_hex(32),
                        status='created',
                        expires_at=expires_at,
                        metadata=json.dumps(req.metadata or {}),
                        webhook_url=req.webhook_url,
                        webhook_secret_enc=encrypt_pii(req.webhook_secret) if req.webhook_secret else None,
                        created_trace_id=trace_id,
                    ))
                except IntegrityError:
                    # Race: Redis lock won by us but DB unique violation
                    # → fetch the existing one
                    await conn.rollback()
                    return await self._fetch_by_idempotency(api_key_id, idempotency_key)

            return await self._fetch_by_id(order_id)

        except Exception:
            # On any error, release Redis lock so retry can proceed
            await self._redis.delete(redis_key)
            raise
```

**双保险原理**：
- **Redis** = 快路径（< 1ms 拒绝重复），但 Redis 失败时不可信
- **DB unique constraint** = 慢路径（< 50ms），永远正确
- 任一层成功就是成功；DB 失败时主动释放 Redis 锁让 client 重试

---

## 3. 关键算法 · 402 Challenge 生成

```python
# 当 SDK 调用 /v1/messages 但余额不足 → token-api 返回 402
# token-api 内部调 x402.create_payment_intent
# 本服务不直接处理"业务路径触发 402"；只处理"显式 create payment"
# 但提供独立的 /v1/protected/* 入口用于未来扩展（其他 SaaS 通过 x402 收费）

@router.api_route("/v1/protected/{path:path}", methods=["GET","POST","PUT","DELETE"])
async def protected(path: str, request: Request, payment_required: int = 1000000):
    """
    Generic X402-protected resource.
    Phase 1 not actively used; token-api handles 402 inline.
    """
    # Check if request has X-Payment-Proof header
    proof = request.headers.get("X-Payment-Proof")
    if not proof:
        # Return 402 with payment requirements
        intent = PaymentIntent(
            amount=Decimal(payment_required) / 1_000_000,
            asset="USDC",
            network="solana",
            recipient=settings.payment_recipient_address,
            nonce=secrets.token_hex(32),
            order_id="pmt_" + new_ulid(),
            expires_at=utcnow() + timedelta(minutes=30),
        )
        # Persist intent
        await order_service.create_intent(intent)
        return JSONResponse(
            status_code=402,
            content={"payment_required": intent.model_dump(mode="json")},
            headers={"WWW-Authenticate": f'X402 realm="netstars", order_id="{intent.order_id}"'},
        )
    # Verify proof, then forward to actual resource
    ...
```

---

## 4. 关键算法 · 支付证明验证

```python
# src/x402/services/proof_verifier.py
from solders.transaction import VersionedTransaction
from spl.token.constants import TOKEN_PROGRAM_ID
import base58, base64

USDC_MINT = {
    "devnet":  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    "mainnet": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
}

class ProofVerifier:
    async def verify(self, order: PaymentOrder, signed_tx_b64: str) -> VerifiedProof:
        tx_bytes = base64.b64decode(signed_tx_b64)
        try:
            tx = VersionedTransaction.from_bytes(tx_bytes)
        except Exception as e:
            raise ProofInvalidError("malformed_transaction", str(e))

        # 1. Signatures must verify
        if not tx.verify_signatures():
            raise ProofInvalidError("invalid_signature")

        # 2. Extract the SPL transfer instruction (transfer_checked or transfer)
        transfer = self._extract_spl_transfer(tx, expected_mint=USDC_MINT[settings.network])
        if not transfer:
            raise ProofInvalidError("not_a_spl_transfer")

        # 3. Amount match
        if transfer["amount"] != order.amount_usdc_micro:
            raise ProofInvalidError("amount_mismatch",
                f"expected {order.amount_usdc_micro}, got {transfer['amount']}")

        # 4. Recipient match (destination ATA → wallet)
        expected_dest_ata = derive_associated_token_address(
            wallet=order.recipient, mint=USDC_MINT[settings.network]
        )
        if transfer["destination"] != expected_dest_ata:
            raise ProofInvalidError("wrong_recipient")

        # 5. Nonce memo check (extract from memo instruction)
        memo = self._extract_memo(tx)
        if memo != order.nonce:
            raise ProofInvalidError("nonce_mismatch")

        # 6. Blockhash freshness (don't accept old txs that may have been mined elsewhere)
        # Note: we don't enforce this strictly — Wea will reject if too old anyway

        # 7. Compute tx_hash (= first signature, base58)
        tx_hash = base58.b58encode(bytes(tx.signatures[0])).decode()

        return VerifiedProof(tx=tx, tx_hash=tx_hash, signed_tx_b64=signed_tx_b64)
```

---

## 5. 状态机转换 · 完整路径

```python
# All transitions executed via OrderService.transition(), which:
#  1. Loads current row WITH UPDATE lock
#  2. Validates legal transition (DB trigger ALSO enforces, double safety)
#  3. Applies UPDATE
#  4. Inserts audit_log row
#  5. Returns updated order

async def transition(
    self, order_id: str,
    from_status: PaymentStatus,
    to_status: PaymentStatus,
    *, updates: dict | None = None,
    audit_metadata: dict | None = None,
    trace_id: str,
) -> PaymentOrder:
    async with self._db.begin() as conn:
        # Lock row
        row = (await conn.execute(
            select(payment_orders).where(payment_orders.c.id == order_id).with_for_update()
        )).one_or_none()
        if not row:
            raise OrderNotFoundError(order_id)
        if row.status != from_status.value:
            raise OrderStateConflictError(
                f"Expected {from_status}, got {row.status}"
            )

        # Apply update
        await conn.execute(
            update(payment_orders)
              .where(payment_orders.c.id == order_id)
              .values(status=to_status.value, **(updates or {}))
        )
        # Audit
        await conn.execute(insert(audit_log).values(
            actor_type='system',
            action=f'payment.{to_status.value}',
            resource_type='payment_order',
            resource_id=order_id,
            before_state={'status': from_status.value},
            after_state={'status': to_status.value, **(updates or {})},
            trace_id=trace_id,
            metadata=audit_metadata or {},
        ))
    return await self._fetch_by_id(order_id)
```

合法迁移由 DB trigger `trg_payment_orders_fsm` 兜底（非法迁移直接 SIGNAL SQLSTATE 45000）。

---

## 6. Wea Callback 处理

```python
# src/x402/routers/webhook_inbound.py
@router.post("/internal/wea/callback")
async def wea_callback(
    request: Request,
    x_wea_signature: str = Header(),
    body: dict = Body(),
    db: AsyncEngine = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    # 1. Verify HMAC (mTLS already done at ALB)
    raw_body = await request.body()
    expected = hmac.new(settings.wea_callback_hmac_secret.encode(), raw_body, sha256).hexdigest()
    if not hmac.compare_digest(expected, x_wea_signature):
        # log + reject (no body to leak info)
        return Response(status_code=401)

    # 2. Persist raw callback for debugging
    async with db.begin() as conn:
        await conn.execute(insert(wea_callbacks_log).values(
            settlement_id=body['settlement_id'],
            payment_order_id=body.get('payment_order_id'),
            payload_json=body,
            signature=x_wea_signature,
            verified=True,
        ))

    # 3. Idempotency: tx_hash already recorded → ack but don't reprocess
    tx_hash = body.get('tx_hash')
    if tx_hash:
        existing = await order_service.find_by_tx_hash(tx_hash)
        if existing and existing.status == 'token_credited':
            return {"ok": True, "duplicate": True}

    # 4. Apply status transition based on Wea status
    order_id = body['payment_order_id']
    wea_status = body['status']

    if wea_status == 'confirmed':
        order = await order_service.transition(
            order_id, from_status=PaymentStatus.PENDING,
            to_status=PaymentStatus.CONFIRMED,
            updates={'tx_hash': tx_hash, 'confirmed_at': utcnow(),
                     'solana_slot': body.get('slot')},
            trace_id=request.state.trace_id,
        )
        # 5. Forward credit to Token system
        await token_client.credit(
            merchant_id=order.merchant_id,
            amount_usdc_micro=order.amount_usdc_micro,
            payment_order_id=order.id,
            tx_hash=tx_hash,
        )
        await order_service.transition(
            order_id, from_status=PaymentStatus.CONFIRMED,
            to_status=PaymentStatus.TOKEN_CREDITED,
            trace_id=request.state.trace_id,
        )
        # 6. Send webhook to client
        await webhook_sender.enqueue(order_id, event_type='payment.confirmed')

    elif wea_status == 'failed':
        await order_service.transition(
            order_id, from_status=PaymentStatus.PENDING,
            to_status=PaymentStatus.FAILED,
            updates={'status_reason': body.get('reason', 'wea_failed')},
            trace_id=request.state.trace_id,
        )
        await webhook_sender.enqueue(order_id, event_type='payment.failed')

    return {"ok": True}
```

---

## 7. Worker 实现细节

### 7.1 Expire Scanner（每分钟）

```python
# src/x402/workers/expire_scanner.py
class ExpireScanner:
    async def run_once(self):
        async with leader_lock(self._redis, "x402:leader:expire", ttl=10):
            async with self._db.begin() as conn:
                # Find expired orders in 'created' or 'pending'
                rows = await conn.execute(
                    select(payment_orders.c.id)
                      .where(payment_orders.c.status.in_(['created', 'pending']))
                      .where(payment_orders.c.expires_at < utcnow())
                      .limit(1000)
                )
                for (order_id,) in rows:
                    try:
                        await order_service.transition(
                            order_id,
                            from_status=PaymentStatus.CREATED,  # tries 'created' first
                            to_status=PaymentStatus.EXPIRED,
                            updates={'status_reason': 'timeout'},
                            trace_id=f"sys-expire-{new_ulid()}",
                        )
                    except OrderStateConflictError:
                        # Try 'pending' if not 'created'
                        try:
                            await order_service.transition(
                                order_id,
                                from_status=PaymentStatus.PENDING,
                                to_status=PaymentStatus.EXPIRED,
                                updates={'status_reason': 'timeout'},
                                trace_id=...,
                            )
                        except OrderStateConflictError:
                            pass  # already moved on
```

### 7.2 Webhook Retry（持续）

```python
class WebhookRetryWorker:
    INTERVALS = [300, 900, 3600, 21600, 86400]  # 5m, 15m, 1h, 6h, 24h

    async def run_loop(self):
        while True:
            async with self._db.begin() as conn:
                # SELECT ... FOR UPDATE SKIP LOCKED to claim work
                rows = (await conn.execute(text("""
                    SELECT id FROM webhook_deliveries
                    WHERE status = 'failed_retrying'
                      AND next_retry_at <= NOW()
                    ORDER BY next_retry_at
                    LIMIT 10
                    FOR UPDATE SKIP LOCKED
                """))).all()

                for (delivery_id,) in rows:
                    asyncio.create_task(self._deliver(delivery_id))

            await asyncio.sleep(5)

    async def _deliver(self, delivery_id: int):
        delivery = await self._fetch(delivery_id)
        try:
            resp = await httpx_client.post(
                delivery.target_url,
                json=delivery.payload_json,
                headers={
                    "X-Netstars-Signature": hmac_sign(delivery.payload_json, delivery.secret),
                    "Content-Type": "application/json",
                },
                timeout=10.0,
            )
            if 200 <= resp.status_code < 300:
                await self._mark_delivered(delivery_id, resp.status_code, resp.text[:1024])
            else:
                await self._schedule_retry(delivery_id, resp.status_code, resp.text[:1024])
        except Exception as e:
            await self._schedule_retry(delivery_id, 0, str(e)[:1024])

    async def _schedule_retry(self, delivery_id, status_code, body):
        delivery = await self._fetch(delivery_id)
        new_attempt = delivery.attempt_count + 1
        if new_attempt >= len(self.INTERVALS):
            await self._mark_dead_letter(delivery_id)
        else:
            next_retry = utcnow() + timedelta(seconds=self.INTERVALS[new_attempt])
            await self._update_retry(delivery_id, new_attempt, status_code, body, next_retry)
```

### 7.3 Reconciler（每小时三方对账）

```python
class Reconciler:
    """
    Three-way reconciliation:
      x402.payment_orders.status='confirmed' but no token credit?
      wea has tx_hash but x402 missed callback?
      token credited but x402 status not 'token_credited'?
    """
    async def run_hourly(self):
        async with leader_lock(self._redis, "x402:leader:reconcile", ttl=600):
            # Case 1: x402 confirmed > 5min but not token_credited
            stale = await self._find_stuck_confirmed(threshold_minutes=5)
            for order in stale:
                logger.warning("reconcile: re-credit token", order_id=order.id)
                try:
                    await token_client.credit(...)
                    await order_service.transition(order.id,
                        from_status=PaymentStatus.CONFIRMED,
                        to_status=PaymentStatus.TOKEN_CREDITED,
                        ...)
                except TokenServiceError as e:
                    metrics.counter("x402_reconcile_credit_failed").inc()

            # Case 2: pull Wea's confirmed list, compare to x402's
            wea_recent = await wea_client.list_settlements(
                since=utcnow() - timedelta(hours=2)
            )
            for s in wea_recent:
                if s.status == 'done' and not await self._has_order_credited(s.payment_order_id):
                    logger.warning("reconcile: lost wea callback", settlement_id=s.id)
                    # Simulate the callback
                    await self._replay_wea_callback(s)
```

---

## 8. 错误响应统一格式（RFC 9457）

```python
# src/x402/middleware/errors.py
@app.exception_handler(NetstarsError)
async def netstars_error_handler(request: Request, exc: NetstarsError):
    body = {
        "type":   f"https://errors.netstars.jp/{exc.code}",
        "title":  exc.title,
        "status": exc.status_code,
        "detail": str(exc),
        "instance": request.url.path,
        "trace_id": request.state.trace_id,
        "error_code": exc.code,
        "metadata": exc.metadata,
    }
    return JSONResponse(status_code=exc.status_code, content=body)
```

---

## 9. 性能优化要点

- 所有 IO 走 async（FastAPI + httpx.AsyncClient + asyncmy/aiomysql）
- DB 连接池：min 5, max 20, recycle 3600s
- Redis pipeline 用于幂等性检查（lock + GET 一次往返）
- 单 Pod 目标：50 TPS（Phase 1）→ 单 Pod 200 TPS（Phase 3 引入 uvloop + 优化）
- 监控关键指标 SLO，HPA 触发：`x402_payment_create_duration_seconds_p95`

---

## 10. 本地开发（docker-compose）

```yaml
# netstars/x402/docker-compose.yml
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: dev
      MYSQL_DATABASE: x402_qa
      MYSQL_USER: x402_app
      MYSQL_PASSWORD: x402_app_dev
    ports: ["3306:3306"]
    command: >
      --character-set-server=utf8mb4 --collation-server=utf8mb4_0900_ai_ci
      --default-time-zone=+00:00
      --transaction-isolation=READ-COMMITTED
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
  x402-api:
    build: .
    environment:
      DATABASE_URL: mysql+aiomysql://x402_app:x402_app_dev@mysql:3306/x402_qa
      REDIS_URL: redis://redis:6379/0
      ENV: local
    ports: ["8080:8080"]
    depends_on: [mysql, redis]
```

启动：
```bash
cd netstars/x402
docker compose up -d mysql redis
migrate -database "mysql://x402_app:x402_app_dev@tcp(localhost:3306)/x402_qa" \
        -path db/migrations up
poetry install
poetry run uvicorn x402.main:app --reload --port 8080
```

---

## 11. 部署 / runbook（基础）

```bash
# Build & push
docker build -t REPLACE_ECR/x402-token-market/x402/api:vX.Y.Z .
docker push   REPLACE_ECR/x402-token-market/x402/api:vX.Y.Z

# Update K8s
kubectl set image -n x402 deploy/x402-api api=REPLACE_ECR/x402-token-market/x402/api:vX.Y.Z
kubectl rollout status -n x402 deploy/x402-api

# Rollback
kubectl rollout undo -n x402 deploy/x402-api
```

完整 deploy 走 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)。
