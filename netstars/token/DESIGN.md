# Token System · Detailed Design

> **属于**：[ARCHITECTURE.md](ARCHITECTURE.md) · [PRD.md](PRD.md)
> **DB**：Aurora MySQL 8.0（详见 [db/SCHEMA.sql](db/SCHEMA.sql)）
> **UI**：详见 [ui/UX-SPEC.md](ui/UX-SPEC.md)

---

## 1. 项目骨架

```
netstars/token/
├─ api/                       FastAPI service (Python 3.12)
│   ├─ src/token_api/
│   │   ├─ main.py
│   │   ├─ config.py
│   │   ├─ deps.py
│   │   ├─ db/
│   │   ├─ models/
│   │   ├─ routers/
│   │   │   ├─ tokens.py             /v1/balance, /v1/token-purchase
│   │   │   ├─ chat.py               /v1/messages, /v1/chat/completions
│   │   │   ├─ usage.py              /v1/usage
│   │   │   ├─ models_list.py        /v1/models
│   │   │   ├─ orders.py             /v1/orders
│   │   │   ├─ invoices.py           /v1/invoices
│   │   │   ├─ internal.py           /internal/credit, /internal/agent-key-validate
│   │   │   ├─ console_api.py        /console/api/* (BFF for Next.js)
│   │   │   └─ admin.py              /admin/*
│   │   ├─ services/
│   │   │   ├─ ledger.py             ★ 账本核心（事务）
│   │   │   ├─ pricing.py            模型单价 + JPY/USDC 汇率
│   │   │   ├─ provider/             AI Provider adapters
│   │   │   │   ├─ base.py
│   │   │   │   ├─ claude.py
│   │   │   │   ├─ gpt.py
│   │   │   │   ├─ grok.py
│   │   │   │   ├─ gemini.py
│   │   │   │   └─ router.py         按 model 名分流
│   │   │   ├─ auth.py               API Key + HMAC 校验
│   │   │   ├─ rate_limit.py         Redis token bucket
│   │   │   ├─ pii_crypto.py         AES-256-GCM envelope encryption
│   │   │   ├─ sso.py                OIDC 集成
│   │   │   └─ x402_client.py        调 X402 创建订单
│   │   ├─ middleware/
│   │   └─ ulid.py
│   ├─ tests/
│   ├─ Dockerfile
│   └─ pyproject.toml
│
├─ worker/                    Python 后台任务
│   ├─ src/token_worker/
│   │   ├─ main.py                   按 WORKER_MODE 启用
│   │   ├─ jobs/
│   │   │   ├─ invoice_generator.py  月初 cron
│   │   │   ├─ reconciler.py         每小时
│   │   │   ├─ anomaly_detector.py   每 5min
│   │   │   ├─ usage_aggregator.py   每 5min → usage_daily
│   │   │   ├─ balance_alert.py      实时（消费事件触发）
│   │   │   └─ partition_manager.py  月初创建下个月 partition
│   │   └─ scheduler.py              apscheduler
│   ├─ Dockerfile
│   └─ pyproject.toml
│
├─ console/                   Next.js 15 (App Router)
│   ├─ src/
│   │   ├─ app/
│   │   │   ├─ [locale]/
│   │   │   │   ├─ (auth)/login/
│   │   │   │   ├─ dashboard/page.tsx
│   │   │   │   ├─ usage/page.tsx
│   │   │   │   ├─ tokens/page.tsx
│   │   │   │   ├─ api-keys/page.tsx
│   │   │   │   ├─ models/page.tsx
│   │   │   │   ├─ invoices/page.tsx
│   │   │   │   ├─ settings/page.tsx
│   │   │   │   └─ audit/page.tsx
│   │   │   ├─ api/
│   │   │   │   ├─ auth/[...nextauth]/  OIDC via next-auth
│   │   │   │   └─ health/route.ts
│   │   ├─ components/                shadcn/ui base + custom
│   │   ├─ lib/
│   │   │   ├─ api-client.ts          fetch wrapper (server-side, BFF)
│   │   │   ├─ i18n.ts                next-intl
│   │   │   └─ format.ts              date / currency / number
│   │   ├─ messages/
│   │   │   ├─ ja.json
│   │   │   └─ en.json
│   │   └─ styles/                    Tailwind + design tokens (matches UX-SPEC)
│   ├─ Dockerfile
│   └─ package.json
│
└─ db/                        共享 schema + migrations
```

---

## 2. 账本（Ledger）核心算法

**核心要求**：余额是单源（ledger 累加），cache 表（balances）仅做 read 加速；
任何 credit / debit 通过同一个事务函数，杜绝直接 UPDATE balances。

```python
# src/token_api/services/ledger.py
from decimal import Decimal
from sqlalchemy import select, insert, update, text
from .errors import InsufficientBalanceError

class LedgerService:
    async def credit(
        self, conn, *,
        merchant_id: str,
        amount_token: Decimal,
        source: str,                    # 'x402_payment' | 'refund' | 'admin_adjust' | 'promo'
        source_ref: str,
        project_id: str | None = None,
        agent_key_id: str | None = None,
        description: str | None = None,
        trace_id: str | None = None,
    ) -> int:
        """
        Atomically:
          1. SELECT balance ... FOR UPDATE on `balances`
          2. INSERT INTO token_ledger_entries (type='credit', balance_after=new)
          3. UPDATE balances SET balance_token=new, last_ledger_entry_id=...
        Returns: ledger entry id.
        Caller must wrap in begin().
        """
        assert amount_token > 0, "credit amount must be positive"

        row = (await conn.execute(
            select(balances.c.balance_token)
              .where(balances.c.merchant_id == merchant_id)
              .with_for_update()
        )).one_or_none()

        if not row:
            # First-ever entry for merchant — create balance row
            await conn.execute(insert(balances).values(
                merchant_id=merchant_id, balance_token=0, on_hold_token=0,
            ))
            current = Decimal(0)
        else:
            current = row.balance_token

        new_balance = current + amount_token

        result = await conn.execute(insert(token_ledger_entries).values(
            merchant_id=merchant_id,
            project_id=project_id,
            agent_key_id=agent_key_id,
            type='credit',
            amount_token=amount_token,
            balance_after=new_balance,
            source=source,
            source_ref=source_ref,
            description=description,
            trace_id=trace_id,
        ))
        entry_id = result.inserted_primary_key[0]

        await conn.execute(
            update(balances)
              .where(balances.c.merchant_id == merchant_id)
              .values(balance_token=new_balance, last_ledger_entry_id=entry_id)
        )
        return entry_id

    async def debit(
        self, conn, *,
        merchant_id: str,
        amount_token: Decimal,
        source: str,                    # 'ai_call' | 'admin_adjust'
        source_ref: str,
        request_id: str | None = None,
        trace_id: str | None = None,
        **kw,
    ) -> int:
        """Similar to credit but reduces balance; raises if insufficient."""
        assert amount_token > 0

        row = (await conn.execute(
            select(balances.c.balance_token)
              .where(balances.c.merchant_id == merchant_id)
              .with_for_update()
        )).one_or_none()

        current = row.balance_token if row else Decimal(0)
        new_balance = current - amount_token
        if new_balance < 0:
            raise InsufficientBalanceError(
                f"need {amount_token}, have {current}",
                metadata={'balance': str(current), 'required': str(amount_token)},
            )

        result = await conn.execute(insert(token_ledger_entries).values(
            merchant_id=merchant_id,
            type='debit',
            amount_token=amount_token,
            balance_after=new_balance,
            source=source,
            source_ref=source_ref,
            request_id=request_id,
            trace_id=trace_id,
            **kw,
        ))
        entry_id = result.inserted_primary_key[0]
        await conn.execute(
            update(balances)
              .where(balances.c.merchant_id == merchant_id)
              .values(balance_token=new_balance, last_ledger_entry_id=entry_id)
        )
        return entry_id
```

**强制约束**：
- `chk_ledger_amount` CHECK (amount > 0)
- `chk_balances_nonneg` CHECK (balance_token >= 0)
- 应用层 REVOKE UPDATE/DELETE on `token_ledger_entries`

---

## 3. AI 调用核心 · 完整流程（含计费）

```python
# src/token_api/routers/chat.py
@router.post("/v1/messages", response_model=ChatResponse)
async def messages(
    body: ChatRequest,
    auth: AgentKeyContext = Depends(require_agent_key),
    settings: Settings = Depends(get_settings),
    db: AsyncEngine = Depends(get_db),
    redis: Redis = Depends(get_redis),
    trace_id: str = Depends(extract_trace_id),
):
    # ── 1. Rate limit ───────────────────────────────────────────────────
    await rate_limiter.check(auth.agent_key_id, redis)

    # ── 2. Model check ──────────────────────────────────────────────────
    if not auth.is_model_allowed(body.model):
        raise ModelNotAllowedError(body.model)

    # ── 3. Balance pre-check (cheap) ────────────────────────────────────
    balance = await ledger_service.read_balance(auth.merchant_id, db)
    if balance < MIN_BALANCE_THRESHOLD:
        # Trigger X402 challenge: instruct client to top up
        intent = await x402_client.create_payment_intent(
            merchant_id=auth.merchant_id,
            api_key_id=auth.agent_key_id,
            amount_usdc=PURCHASE_HINT_USDC,
        )
        raise PaymentRequiredError(intent=intent)

    # ── 4. Provider call (the expensive part) ───────────────────────────
    provider = provider_router.select(body.model)
    start = time.monotonic()
    request_id = "req_" + new_ulid()
    try:
        provider_resp = await provider.chat(body, timeout=settings.provider_timeout_seconds)
    except ProviderError as e:
        await _record_failed_request(db, request_id, auth, body, e, trace_id)
        raise

    latency_ms = int((time.monotonic() - start) * 1000)

    # ── 5. Compute cost ─────────────────────────────────────────────────
    cost_token = pricing_service.compute_cost(
        model=body.model,
        prompt_tokens=provider_resp.usage.prompt_tokens,
        completion_tokens=provider_resp.usage.completion_tokens,
        cached_input_tokens=provider_resp.usage.cached_input_tokens,
    )

    # ── 6. Debit + record request in single transaction ─────────────────
    async with db.begin() as conn:
        # Debit
        try:
            ledger_entry_id = await ledger_service.debit(
                conn,
                merchant_id=auth.merchant_id,
                amount_token=cost_token,
                source='ai_call',
                source_ref=request_id,
                request_id=request_id,
                trace_id=trace_id,
            )
        except InsufficientBalanceError:
            # Edge case: balance changed between pre-check and debit (high concurrency)
            # → Charge what we can or fail loudly; v1 fail loudly
            await _record_failed_request(db, request_id, auth, body, 'balance_race', trace_id)
            raise

        # Record request
        await conn.execute(insert(requests).values(
            id=request_id,
            agent_key_id=auth.agent_key_id,
            merchant_id=auth.merchant_id,
            project_id=auth.project_id,
            model=body.model,
            provider=provider.name,
            prompt_tokens=provider_resp.usage.prompt_tokens,
            completion_tokens=provider_resp.usage.completion_tokens,
            cached_input_tokens=provider_resp.usage.cached_input_tokens or 0,
            cost_token=cost_token,
            cost_usdc_equiv_micro=cost_token * USDC_MICRO_PER_TOKEN,
            status='succeeded',
            latency_ms=latency_ms,
            trace_id=trace_id,
            request_hash=sha256(body.canonical_json().encode()).hexdigest(),
            metadata={'finish_reason': provider_resp.finish_reason},
        ))

    # ── 7. Return ───────────────────────────────────────────────────────
    return ChatResponse(
        id=request_id,
        content=provider_resp.content,
        usage=Usage(
            prompt_tokens=provider_resp.usage.prompt_tokens,
            completion_tokens=provider_resp.usage.completion_tokens,
            tokens_consumed=int(cost_token),
            balance_after=int(balance - cost_token),
            cost_usdc_equiv=float(cost_token) / USDC_MICRO_PER_TOKEN,
        ),
        trace_id=trace_id,
    )
```

**关键设计**：
- **post-pay**（不预扣 hold）：失败 = 0 扣，与 OpenAI/Anthropic 一致
- 单次最大暴露：`max_tokens × max_rate` 受 model 单价限制
- 余额竞态保护：debit 内部 `FOR UPDATE` lock + CHECK constraint

---

## 4. Provider Router + Adapter

```python
# src/token_api/services/provider/router.py
class ProviderRouter:
    def __init__(self, adapters: dict[str, ProviderAdapter]):
        self._adapters = adapters

    def select(self, model: str) -> ProviderAdapter:
        # Match by prefix
        if model.startswith("claude-"):    return self._adapters["anthropic"]
        if model.startswith("gpt-"):       return self._adapters["openai"]
        if model.startswith("grok-"):      return self._adapters["xai"]
        if model.startswith("gemini-"):    return self._adapters["google"]
        raise UnknownModelError(model)

# src/token_api/services/provider/claude.py
class ClaudeAdapter:
    name = "anthropic"

    def __init__(self, api_key: str, base_url: str, http: httpx.AsyncClient):
        self._api_key = api_key
        self._base_url = base_url
        self._http = http

    async def chat(self, req: ChatRequest, timeout: float) -> ProviderResponse:
        body = {
            "model": req.model,
            "messages": req.messages,
            "max_tokens": req.max_tokens or 4096,
            "temperature": req.temperature,
            # Pass-through provider-specific options
            **(req.provider_options or {}),
        }
        try:
            resp = await self._http.post(
                f"{self._base_url}/v1/messages",
                json=body,
                headers={
                    "x-api-key": self._api_key,
                    "anthropic-version": "2023-06-01",
                },
                timeout=timeout,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise ProviderError(provider=self.name, status=e.response.status_code,
                                body=e.response.text[:1024]) from e

        data = resp.json()
        return ProviderResponse(
            content=data["content"][0]["text"],
            finish_reason=data.get("stop_reason", "stop"),
            usage=ProviderUsage(
                prompt_tokens=data["usage"]["input_tokens"],
                completion_tokens=data["usage"]["output_tokens"],
                cached_input_tokens=data["usage"].get("cache_read_input_tokens"),
            ),
        )
```

---

## 5. 鉴权 + Rate Limit

```python
# src/token_api/services/auth.py
class AgentKeyAuth:
    async def authenticate(
        self, request: Request, redis: Redis, db: AsyncEngine,
    ) -> AgentKeyContext:
        # 1. Parse Authorization header → agent_key_id (ak_xxx...)
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            raise AuthenticationError("missing_bearer")
        key_public = auth_header.removeprefix("Bearer ")

        # 2. Verify timestamp + nonce (anti-replay)
        ts = int(request.headers.get("X-Netstars-Timestamp", "0"))
        if abs(time.time() - ts) > 300:
            raise AuthenticationError("timestamp_skew")
        nonce = request.headers.get("X-Netstars-Nonce", "")
        if not nonce or not await redis.set(f"nonce:{key_public}:{nonce}", 1, nx=True, ex=600):
            raise AuthenticationError("replay_detected")

        # 3. Lookup agent_key (cache 5 min)
        cache_key = f"agk:{key_public}"
        cached = await redis.get(cache_key)
        if cached:
            agk = AgentKeyContext.model_validate_json(cached)
        else:
            agk = await self._load_from_db(key_public, db)
            await redis.set(cache_key, agk.model_dump_json(), ex=300)

        if agk.status != "active":
            raise AuthorizationError(f"agent_key_{agk.status}")

        # 4. Verify HMAC signature
        sig = request.headers.get("X-Netstars-Signature", "")
        body = await request.body()
        expected = compute_hmac(
            secret=agk.secret_for_signing,        # decrypted from DB
            method=request.method, path=request.url.path,
            timestamp=str(ts), nonce=nonce, body=body,
        )
        if not hmac.compare_digest(expected, sig):
            raise AuthenticationError("invalid_signature")

        return agk

# src/token_api/services/rate_limit.py
class RateLimiter:
    """Redis sliding-window token bucket."""

    async def check(self, agent_key_id: str, redis: Redis):
        # RPM bucket
        rpm_key = f"rl:rpm:{agent_key_id}:{int(time.time() // 60)}"
        rpm = await redis.incr(rpm_key)
        if rpm == 1:
            await redis.expire(rpm_key, 90)
        ctx = await load_agent_key_limits(agent_key_id)
        if rpm > ctx.rate_limit_rpm:
            raise RateLimitError(retry_after=60)
        # TPM, daily USDC, etc.
        ...
```

---

## 6. PII Field-Level Encryption

```python
# src/token_api/services/pii_crypto.py
# Envelope encryption: KMS data key encrypts plaintext at app level

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import base64, os

class PIICrypto:
    def __init__(self, kms_data_key_b64: str):
        # data key obtained from KMS at startup; rotated daily by worker
        self._key = base64.b64decode(kms_data_key_b64)

    def encrypt(self, plaintext: str) -> bytes:
        nonce = os.urandom(12)
        aesgcm = AESGCM(self._key)
        ct = aesgcm.encrypt(nonce, plaintext.encode(), associated_data=None)
        return nonce + ct                          # store nonce || ciphertext

    def decrypt(self, ciphertext: bytes) -> str:
        nonce = ciphertext[:12]
        ct = ciphertext[12:]
        aesgcm = AESGCM(self._key)
        return aesgcm.decrypt(nonce, ct, associated_data=None).decode()
```

DB 字段类型用 `VARBINARY(N)`；存的就是 `nonce || ciphertext`。

---

## 7. 关键 Worker 实现

### 7.1 Invoice Generator（月初）

```python
# src/token_worker/jobs/invoice_generator.py
class InvoiceGenerator:
    """
    Runs on cron '0 0 1 * *' (1st of month 00:00 UTC).
    Generates invoice for the PREVIOUS month for each active merchant.
    """
    async def run(self):
        period = previous_month_yyyymm()             # e.g. "202604"
        merchants = await self._list_active_merchants()
        for m in merchants:
            try:
                await self._generate_for_merchant(m, period)
            except Exception as e:
                logger.exception("invoice_failed", merchant_id=m.id, period=period)
                metrics.counter("token_invoice_generation_failed").inc()

    async def _generate_for_merchant(self, merchant, period):
        # 1. Compute totals from ledger + payment_orders_mirror
        async with self._db.begin() as conn:
            usage_rows = (await conn.execute(text("""
                SELECT model, SUM(prompt_tokens) p, SUM(completion_tokens) c,
                       SUM(cost_token) t, SUM(cost_usdc_equiv_micro) u
                FROM requests
                WHERE merchant_id = :m AND status='succeeded'
                  AND DATE_FORMAT(created_at, '%Y%m') = :period
                GROUP BY model
            """), {"m": merchant.id, "period": period})).all()

            tx_hashes = (await conn.execute(text("""
                SELECT tx_hash FROM payment_orders_mirror
                WHERE merchant_id = :m AND DATE_FORMAT(created_at, '%Y%m') = :period
                  AND tx_hash IS NOT NULL
            """), {"m": merchant.id, "period": period})).scalars().all()

            subtotal_usdc = sum(r.u for r in usage_rows)
            fx_rate = await pricing_service.get_fx_usdc_to_jpy()
            subtotal_jpy = int(subtotal_usdc / 1_000_000 * fx_rate)
            tax_jpy = int(subtotal_jpy * 0.10)               # 消費税 10%
            total_jpy = subtotal_jpy + tax_jpy

            # 2. Insert invoice header
            seq = await self._next_seq(period)
            invoice_id = f"inv_{period}_{seq:05d}"
            await conn.execute(insert(invoices).values(
                id=invoice_id,
                merchant_id=merchant.id,
                period_yyyymm=period,
                subtotal_jpy=subtotal_jpy,
                tax_jpy=tax_jpy,
                total_jpy=total_jpy,
                fx_rate_usdc_to_jpy=fx_rate,
                status='draft',
            ))

            # 3. Items per model
            for r in usage_rows:
                await conn.execute(insert(invoice_items).values(
                    invoice_id=invoice_id,
                    item_type='token_consumption',
                    description=f"AI Token consumption · {r.model}",
                    quantity=Decimal(r.t),
                    amount_jpy=int(r.u / 1_000_000 * fx_rate),
                    metadata={"prompt_tokens": int(r.p), "completion_tokens": int(r.c)},
                ))

            # 4. Push tx_hashes as audit metadata to last item
            await conn.execute(insert(invoice_items).values(
                invoice_id=invoice_id,
                item_type='audit',
                description='On-chain settlement evidence',
                amount_jpy=0,
                metadata={"tx_hashes": tx_hashes},
            ))

        # 5. Send to legacy invoice system for PDF rendering + 税务报送
        try:
            legacy_resp = await legacy_invoice_client.create({
                "external_invoice_id": invoice_id,
                "merchant": serialize_merchant_for_legacy(merchant),
                "items": [...],
                "total_jpy": total_jpy,
            })
            async with self._db.begin() as conn:
                await conn.execute(
                    update(invoices)
                      .where(invoices.c.id == invoice_id)
                      .values(
                          legacy_invoice_id=legacy_resp["id"],
                          pdf_url=legacy_resp["pdf_url"],
                          csv_url=legacy_resp["csv_url"],
                          status='issued',
                          issued_at=utcnow(),
                      )
                )
        except LegacyInvoiceError as e:
            # Invoice remains 'draft'; manual retry via admin
            logger.error("legacy_invoice_failed", invoice_id=invoice_id, error=str(e))
```

### 7.2 Reconciler（每小时）

```python
class TokenReconciler:
    """
    Compare token credits vs x402 confirmed orders.
    Discrepancies > 0 → P1 alert.
    """
    async def run_hourly(self):
        window_start = utcnow() - timedelta(hours=2)
        # Pull from token_ledger (credits with source=x402_payment)
        async with self._db.begin() as conn:
            token_credits = (await conn.execute(text("""
                SELECT source_ref AS payment_order_id, SUM(amount_token) AS total
                FROM token_ledger_entries
                WHERE type='credit' AND source='x402_payment'
                  AND created_at >= :since
                GROUP BY source_ref
            """), {"since": window_start})).all()
        # Pull from x402 API
        x402_orders = await x402_client.list_orders(
            status="token_credited", since=window_start,
        )

        # Symmetric diff
        token_set = {c.payment_order_id for c in token_credits}
        x402_set  = {o.id for o in x402_orders}

        missing_in_token = x402_set - token_set
        missing_in_x402  = token_set - x402_set

        if missing_in_token:
            logger.warning("reconcile: x402 confirmed but token not credited",
                           ids=list(missing_in_token))
            metrics.counter("token_reconcile_missing_credits").inc(len(missing_in_token))
            for oid in missing_in_token:
                await self._attempt_recovery_credit(oid)

        if missing_in_x402:
            logger.error("reconcile: token credited but no x402 record",
                         ids=list(missing_in_x402))
            metrics.counter("token_reconcile_orphan_credits").inc(len(missing_in_x402))
            # alert; never auto-reverse
```

### 7.3 Usage Aggregator（每 5min）

```python
class UsageAggregator:
    async def run(self):
        # Compute yesterday + today rolling aggregates
        async with self._db.begin() as conn:
            await conn.execute(text("""
                REPLACE INTO usage_daily
                  (merchant_id, day, model,
                   request_count, prompt_tokens, completion_tokens,
                   total_cost_token, total_cost_usdc_micro)
                SELECT
                  merchant_id,
                  DATE(created_at) AS day,
                  model,
                  COUNT(*),
                  SUM(prompt_tokens),
                  SUM(completion_tokens),
                  SUM(cost_token),
                  SUM(cost_usdc_equiv_micro)
                FROM requests
                WHERE created_at >= CURDATE() - INTERVAL 1 DAY
                  AND status = 'succeeded'
                GROUP BY merchant_id, DATE(created_at), model
            """))
```

REPLACE INTO 是 MySQL 特有，等效于"删除冲突行 + 插入新行"。

### 7.4 Partition Manager（每月 25 日）

```python
class PartitionManager:
    async def run(self):
        next_month = first_day_of_next_month()       # e.g. 2026-07-01
        next_next  = first_day_of_month_after(next_month)
        partition_name = f"p{next_month:%Y_%m}"

        # Split p_future to create next month
        for table in ["payment_orders_mirror", "token_ledger_entries", "requests", "audit_log"]:
            # Skip if already exists
            existing = (await self._db.execute(text(f"""
                SELECT PARTITION_NAME FROM INFORMATION_SCHEMA.PARTITIONS
                WHERE TABLE_SCHEMA='token_qa' AND TABLE_NAME='{table}'
                  AND PARTITION_NAME='{partition_name}'
            """))).first()
            if existing: continue

            await self._db.execute(text(f"""
                ALTER TABLE {table} REORGANIZE PARTITION p_future INTO (
                  PARTITION {partition_name} VALUES LESS THAN ('{next_next}'),
                  PARTITION p_future VALUES LESS THAN (MAXVALUE)
                )
            """))
            logger.info("created_partition", table=table, partition=partition_name)
```

---

## 8. Console BFF（Next.js Server Actions / Route Handlers）

```typescript
// console/src/app/[locale]/dashboard/page.tsx
import { getServerSession } from "next-auth";
import { fetchDashboard } from "@/lib/api-client";

export default async function DashboardPage({ params: { locale } }: { params: { locale: string }}) {
  const session = await getServerSession();
  if (!session) redirect(`/${locale}/login`);

  // Server-side fetch with session token, never expose token-api directly to browser
  const data = await fetchDashboard({
    merchantId: session.merchantId,
    accessToken: session.accessToken,
  });

  return <DashboardView data={data} locale={locale} />;
}

// console/src/lib/api-client.ts
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://qa.api.netstars.jp";

export async function fetchDashboard({ merchantId, accessToken }: ...) {
  const res = await fetch(`${BASE}/console/dashboard`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "X-Merchant-Id": merchantId,
    },
    next: { revalidate: 30 },                  // ISR cache 30s
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json() as Promise<DashboardData>;
}
```

---

## 9. 关键 SQL 模式（MySQL 特有注意点）

| 操作 | MySQL 实现 |
|------|-----------|
| Insert + return id | `result.inserted_primary_key[0]`（SQLAlchemy）；不能用 RETURNING |
| 抢任务 | `SELECT ... FOR UPDATE SKIP LOCKED` (MySQL 8.0+) |
| Upsert | `INSERT ... ON DUPLICATE KEY UPDATE` 或 `REPLACE INTO` |
| 全文搜索 | `FULLTEXT INDEX` + `MATCH() AGAINST()` |
| 分区维护 | `ALTER TABLE ... REORGANIZE PARTITION` (而非 PG 的 CREATE PARTITION OF) |
| JSON 路径查询 | `JSON_EXTRACT(col, '$.field')` 或简写 `col->>'$.field'` |
| 生成列索引 JSON | `ALTER TABLE t ADD COLUMN field_ext VARCHAR(64) GENERATED ALWAYS AS (col->>'$.field') STORED, ADD INDEX (field_ext)` |
| 隔离级别 | session 级 `SET TRANSACTION ISOLATION LEVEL READ COMMITTED`（已在 parameter group 设默认） |
| 锁等待超时 | `innodb_lock_wait_timeout=30`（避免 worker 跑死） |

---

## 10. 性能与扩展

- API: HPA on CPU 60%，单 Pod ~ 200 RPS
- 慢查询保护：`SET SESSION max_execution_time=10000`（10s 超时）
- N+1 防御：Pydantic Response 内不做 lazy join；所有数据预先 SELECT
- Provider 调用走 httpx.AsyncClient 全局复用 connection pool
- Aurora reader endpoint 用于：报表 / Console dashboard / 物化视图刷新

---

## 11. 测试关注点

- **账本一致性**：random 并发 credit/debit + 最终用 SUM(ledger) 校验等于 balances.balance_token
- **PII 加解密**：roundtrip + 不同 nonce 同明文产出不同 ciphertext
- **Provider failover**：mock provider 5xx，检查 error mapping
- **Idempotency**：同 idempotency_key 重发 → 同 response，且 ledger 只一条
- **Rate limit**：burst 1000 → 第 N 个 429
- **Console E2E**：Playwright + axe-core（无障碍）+ Lighthouse perf

---

## 12. 本地开发

```yaml
# netstars/token/docker-compose.yml (api + worker + console + mysql + redis)
services:
  mysql: ...                # 同 x402，不同 db_name=token_qa
  redis: ...
  token-api:
    build: ./api
    ports: ["8080:8080"]
    environment:
      DATABASE_URL: mysql+aiomysql://...
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-test}
      ...
  token-worker:
    build: ./worker
    environment: { ...same as api... }
  token-console:
    build: ./console
    ports: ["3000:3000"]
    environment:
      NEXT_PUBLIC_API_BASE: http://localhost:8080
      NEXTAUTH_URL: http://localhost:3000
      ...
```
