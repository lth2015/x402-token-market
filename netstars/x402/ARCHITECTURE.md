# X402 Gateway — Architecture

> **属于**：[../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> **基于**：[PRD.md](PRD.md)
> **版本**：v1.0 · **日期**：2026-05-26

---

## 1. 模块内部组件（Component View）

```
┌────────────────────────────────────────────────────────────────────────┐
│                  netstars/x402 Service                                  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │            x402-api (FastAPI, stateless)                          │   │
│  │  ┌──────────────────────────────────────────────────────────┐    │   │
│  │  │  Routers:                                                 │    │   │
│  │  │   - /v1/payments       (create / proof / query / cancel)  │    │   │
│  │  │   - /v1/protected/*    (X402 challenge entrypoint)        │    │   │
│  │  │   - /internal/wea/callback                                 │    │   │
│  │  │   - /admin/payments    (内部)                              │    │   │
│  │  └──────┬───────────────────────────────────────────────────┘    │   │
│  │         │                                                          │   │
│  │  ┌──────▼───────┐  ┌────────────────┐  ┌─────────────────┐       │   │
│  │  │ Auth         │  │ Idempotency    │  │ Order            │       │   │
│  │  │ Middleware   │  │ Layer          │  │ Service          │       │   │
│  │  │ (API Key +   │  │ (Redis +       │  │ (state machine)  │       │   │
│  │  │  HMAC verify)│  │  DB constraint)│  │                  │       │   │
│  │  └──────┬───────┘  └────────┬───────┘  └────┬────────────┘       │   │
│  │         │                    │                │                    │   │
│  │  ┌──────▼───────────────────▼───────────────▼─────────────────┐  │   │
│  │  │              Payment Verification Service                    │  │   │
│  │  │  - parse Solana transaction                                  │  │   │
│  │  │  - verify amount / recipient / asset (USDC mint)             │  │   │
│  │  │  - verify signature                                          │  │   │
│  │  └──────┬───────────────────────────────────────────────────────┘  │   │
│  │         │                                                            │   │
│  │  ┌──────▼──────────┐  ┌─────────────────┐  ┌─────────────────┐    │   │
│  │  │ Wea Client       │  │ Token Client     │  │ Webhook Sender  │    │   │
│  │  │ (mTLS HTTPS)     │  │ (mTLS HTTPS)     │  │ (HTTPS + HMAC)  │    │   │
│  │  └─────────────────┘  └─────────────────┘  └────────┬────────┘    │   │
│  │                                                       │              │   │
│  └──────────────────────────────────────────────────────┼──────────────┘   │
│                                                          │                   │
│  ┌──────────────────────────────────────────────────────▼──────────────┐   │
│  │            x402-worker (long-running)                                │   │
│  │  - expire-scanner     (每分钟扫过期订单)                              │   │
│  │  - webhook-retry      (失败 webhook 指数退避重投)                     │   │
│  │  - reconciler          (每小时三方对账)                                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Data Stores:                                                                │
│   - RDS PostgreSQL  (x402-prod / x402-staging / x402-dev)                    │
│   - ElastiCache Redis (idempotency / API Key cache / leader election)        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 关键设计决策

### 2.1 订单状态机（FSM）
```
                 created ──cancel──► canceled (terminal)
                    │
                    ├── proof submitted ────► pending
                    │                            │
                    └── timeout (30min) ──► expired (terminal)
                                                 │
                                                 ▼
                                          broadcasting
                                                 │
                                ┌────────────────┼────────────────┐
                                ▼                ▼                ▼
                          confirmed         failed            (timeout 30min)
                                │           (terminal)              │
                                ▼                                    └─► failed (terminal)
                       token_credited (terminal)
                                │
                                └── admin refund ──► refunded (terminal)
```

实现：
- 状态字段加 DB `CHECK` 约束
- 状态迁移通过 `OrderService.transition(order_id, from_state, to_state, ctx)`
- 非法迁移立刻 panic + 告警

### 2.2 幂等性双保险
```
1. Redis 锁（短期高频）：
   key = "idempotency:{api_key_id}:{idempotency_key}"
   set ex 86400 nx 锁定 + 返回 in-progress；释放在事务结束
2. DB 约束（持久兜底）：
   UNIQUE (api_key_id, idempotency_key) on payment_orders
   重复插入抛 UniqueViolation → 转 200 返回原结果
```

### 2.3 支付证明验证（关键安全路径）
```python
def verify_proof(order, signed_tx_b64):
    tx = solana.parse_transaction(base64.decode(signed_tx_b64))
    # 1. 验证签名（client 私钥签的）
    assert tx.verify_signatures(), "invalid signature"
    # 2. 验证交易结构
    transfer_ix = extract_spl_transfer(tx)
    assert transfer_ix is not None, "not a SPL transfer"
    # 3. 验证字段匹配订单
    assert transfer_ix.mint == USDC_MINT, "wrong token"
    assert transfer_ix.amount == order.amount_usdc_micro, "amount mismatch"
    assert transfer_ix.destination == order.recipient, "wrong recipient"
    # 4. 验证 nonce 未被使用
    assert not _nonce_used(tx.recent_blockhash, order.nonce), "nonce replay"
    return True
```

### 2.4 Worker Leader Election（避免重复处理）
```
expire-scanner / reconciler 单 leader 模式：
- 用 Redis Redlock（10s TTL；每 5s 续约）
- 失败时自动重选；从不并发
webhook-retry: 多 worker 抢任务（数据库 SKIP LOCKED）
```

### 2.5 Webhook 推送可靠性
```
状态机：
  pending → sent_ok (terminal)
  pending → sent_fail → retry_1 → retry_2 → ... → max_retries → dead_letter
重试间隔: 5min / 15min / 1h / 6h / 24h (共5次)
每次记录 attempt + response_status + response_body (前 1KB)
死信队列单独表：webhook_dead_letter，运营人工处理
```

---

## 3. API 详细路由设计

| Method | Path | Auth | Idempotent | Notes |
|--------|------|------|-----------|-------|
| POST | /v1/payments | API Key + HMAC | Yes (Idempotency-Key) | 创建订单 |
| POST | /v1/payments/{id}/proof | API Key + HMAC | Yes (自动按 order_id) | 提交证明 |
| GET | /v1/payments/{id} | API Key | Yes | 查询 |
| DELETE | /v1/payments/{id} | API Key + HMAC | Yes | 取消 |
| GET | /v1/payments | API Key | Yes | 列表 (paginated) |
| POST | /internal/wea/callback | mTLS + HMAC | Yes (按 tx_hash) | Wea 回调 |
| GET | /admin/payments | admin token | Yes | 运营查询 |
| POST | /admin/payments/{id}/refund | admin token + 2FA | No | 退款（异步） |
| GET | /healthz | none | Yes | liveness |
| GET | /readyz | none | Yes | readiness（含 DB / Redis / Wea 健康） |
| GET | /metrics | internal | Yes | Prometheus |

---

## 4. 数据库 schema（详见 [db/SCHEMA.sql](db/SCHEMA.sql)）

核心表：
- `payment_orders` (主表，含状态机)
- `payment_proofs` (支付证明历史)
- `webhook_deliveries` (出站 webhook log)
- `idempotency_records` (DB 兜底层)
- `audit_log` (append-only)

---

## 5. 失败模式与降级（运行时）

| 失败 | 表现 | 处理 |
|------|------|------|
| Wea API 5xx | settlements POST 失败 | 重试 3 次 → 订单挂 pending → worker 后台 retry |
| Wea API down 持续 30min | 大量 pending | 告警 P1；运营介入；客户侧 graceful 报错 |
| Token credit 失败 | 链上成功但账本未更新 | reconciler 检测 → 重试 → 5 次后 P1 告警 |
| Redis down | idempotency 锁失效 | 降级到 DB unique 约束（仍正确，但慢） |
| DB 主库 down | 写失败 | RDS 自动故障转移；服务 503 ~ 30s |
| Webhook 客户端 down | 客户收不到通知 | 重试 5 次；失败进死信表；客户可主动 GET 查询 |
| Solana RPC 拥堵 | confirm 慢 | 透传现象；客户可加大 timeout |

---

## 6. 性能与扩展

### 6.1 关键路径性能预算
| 路径 | 目标 | 实现 |
|------|------|------|
| `POST /v1/payments` | < 100ms p95 | 仅写 DB + Redis；无外部 IO |
| `POST /proof` 验证 | < 200ms p95 | CPU 边界（签名验证）；HPA on CPU |
| `GET /payments/{id}` | < 50ms p95 | DB + Redis cache |
| Wea callback → SDK webhook | < 600ms p95 | 链路：mTLS verify → DB update → HTTP push |

### 6.2 水平扩展
- API Pod 完全无状态，按 CPU HPA（50 TPS Phase 1 → 500+ Phase 3）
- worker leader 1 + workers N；数据库 SKIP LOCKED 抢任务
- DB read replica（Phase 2 引入读写分离）

---

## 7. 安全实现

### 7.1 API Key + HMAC 验证流程
```
1. 客户端组装签名：
   string_to_sign = METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + NONCE + "\n" + sha256(BODY)
   signature = hmac_sha256(api_key_secret, string_to_sign)
   Headers:
     Authorization: Bearer <api_key_id>
     X-Netstars-Timestamp: <epoch_seconds>
     X-Netstars-Nonce: <random_32_bytes_hex>
     X-Netstars-Signature: <signature_hex>

2. 服务端验证：
   - 解析 api_key_id → 查 Redis cache（miss 回 DB） → 拿 api_key_secret_hash
   - 重组 string_to_sign + 验证 HMAC
   - 时间戳偏移 > 5min 拒绝
   - nonce 在 Redis 缓存 10min 防重放
```

### 7.2 mTLS（模块间）
- 每个模块的 ServiceAccount 关联 IAM Role + cert（cert-manager + AWS PCA）
- 内部 service 用 internal LB；非内部源直接拒绝（NetworkPolicy）

---

## 8. 可观测性

### 8.1 指标（Prometheus）
- `x402_payments_created_total{merchant_id,status}` (counter)
- `x402_payment_duration_seconds{phase}` (histogram: create / proof / confirm / credit)
- `x402_webhook_delivery_total{status,attempt}` (counter)
- `x402_idempotency_hits_total` (counter)
- `x402_wea_callback_latency_seconds` (histogram)
- HTTP standard: `http_requests_total`, `http_request_duration_seconds`

### 8.2 日志（结构化）
关键事件：
- `payment.created` / `payment.proof_submitted` / `payment.confirmed` / `payment.failed` / `payment.expired`
- `webhook.attempted` / `webhook.delivered` / `webhook.failed`
- `auth.failure` (per IP / per API Key)

### 8.3 trace（OTel）
spans 命名：
- `x402.create_payment`
- `x402.verify_proof`
- `x402.call_wea`
- `x402.wea_callback`
- `x402.credit_token`
- `x402.send_webhook`

---

## 9. CI/CD（详见 [.github/workflows/](.github/workflows/)）

> CI/CD 完整样板在 [token/.github/workflows/](../token/.github/workflows/)；本模块的 workflow 是其复制 + 微调。

阶段：
- PR：lint (ruff) + mypy + pytest + SAST (semgrep) + Trivy → 全绿允许 merge
- main merge：build docker → push ECR `:main-<sha>` → kubectl apply dev overlay
- tag `vX.Y.Z`：build → push `:vX.Y.Z` → 人工 approve → staging → 人工 approve → prod

---

## 10. 部署 manifests（关键片段，Tier 2 完整化）

```yaml
# infra/k8s/base/x402/deployment.yaml （摘要）
apiVersion: apps/v1
kind: Deployment
metadata:
  name: x402-api
  namespace: x402
spec:
  replicas: 3
  selector:
    matchLabels: {app: x402-api}
  template:
    metadata:
      labels: {app: x402-api}
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8080"
    spec:
      serviceAccountName: x402-api-sa  # IRSA
      containers:
      - name: api
        image: <account>.dkr.ecr.ap-northeast-1.amazonaws.com/x402-api:<TAG>
        ports: [{containerPort: 8080}]
        env:
        - name: DATABASE_URL
          valueFrom: {secretKeyRef: {name: x402-db-creds, key: url}}
        - name: REDIS_URL
          valueFrom: {secretKeyRef: {name: x402-redis-url, key: url}}
        resources:
          requests: {cpu: 500m, memory: 512Mi}
          limits:   {cpu: 1000m, memory: 1Gi}
        readinessProbe: {httpGet: {path: /readyz, port: 8080}, initialDelaySeconds: 5}
        livenessProbe:  {httpGet: {path: /healthz, port: 8080}, periodSeconds: 10}
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: {name: x402-api, namespace: x402}
spec:
  scaleTargetRef: {apiVersion: apps/v1, kind: Deployment, name: x402-api}
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource: {name: cpu, target: {type: Utilization, averageUtilization: 60}}
```

---

## 11. 开放问题

| # | 问题 | 默认 |
|---|------|------|
| ARCH-X402-1 | FastAPI vs Starlette 直接？ | FastAPI（更多 batteries） |
| ARCH-X402-2 | DB ORM vs raw SQL？ | SQLAlchemy 2.0 Core（不上 ORM，避免 N+1） |
| ARCH-X402-3 | Phase 1 是否引入 Kafka？ | 不引入；HTTP + DB outbox pattern 足够 |
| ARCH-X402-4 | Refund 流程 v1 是否自动？ | 否；运营介入 + 人工 + 链上手动转账 |

---

## 12. 与 Token 系统未来合并的准备

- 数据模型字段命名与 Token 系统对齐（merchant_id / payment_order_id / amount_usdc_micro）
- 内部事件（payment.confirmed 等）通过事件 publisher 抽象层；Phase 2 后可切到 Kafka，Token 系统订阅
- 数据库 schema 预留 `merged_into_token_at TIMESTAMP NULL` 字段
