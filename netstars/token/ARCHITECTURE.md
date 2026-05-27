# Token System — Architecture

> **属于**：[../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> **基于**：[PRD.md](PRD.md)（v1.1 决策：**全量重写**；与既有发票/SSO/CRM 系统通过 API 对接）
> **版本**：v1.0 · **日期**：2026-05-26

---

## 1. 模块内部组件（Component View）

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       netstars/token Service                              │
│                                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  token-api (FastAPI, stateless)                                     │  │
│  │                                                                       │  │
│  │  Public API:                          Internal API:                   │  │
│  │   /v1/balance                           /internal/credit              │  │
│  │   /v1/usage                             /internal/agent-key-validate │  │
│  │   /v1/models                            /internal/merchant-config    │  │
│  │   /v1/chat/completions  (OpenAI fmt)                                 │  │
│  │   /v1/messages          (Anthropic fmt)                              │  │
│  │   /v1/token-purchase                                                 │  │
│  │   /v1/orders                                                         │  │
│  │   /v1/invoices                                                       │  │
│  │                                                                       │  │
│  │  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐                │  │
│  │  │ Auth         │  │ Rate Limit   │  │ Idempotency  │                │  │
│  │  │ (API Key+    │  │ (Redis token │  │ Layer        │                │  │
│  │  │  HMAC)       │  │  bucket)     │  │              │                │  │
│  │  └──────────────┘  └─────────────┘  └──────────────┘                │  │
│  │                                                                       │  │
│  │  Core Services:                                                       │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │  │
│  │  │ Account Service  │  │ Ledger Service   │  │ Pricing Engine   │   │  │
│  │  │ - merchant       │  │ - balance        │  │ - model rates    │   │  │
│  │  │ - project        │  │ - credit/debit   │  │ - packages       │   │  │
│  │  │ - agent_key      │  │ - hold/release   │  │ - JPY/USDC fx    │   │  │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘   │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │  │
│  │  │ AI Provider      │  │ Metering Service │  │ Invoice Service  │   │  │
│  │  │ Router           │  │ (per-request     │  │ (data only;      │   │  │
│  │  │ - Claude         │  │  cost calc)      │  │  既有系统渲染PDF) │   │  │
│  │  │ - GPT            │  │                  │  │                  │   │  │
│  │  │ - Grok / Gemini  │  │                  │  │                  │   │  │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  token-console (Next.js 15 + shadcn/ui; SSR via Vercel-style or BFF) │  │
│  │  - Dashboard / Usage / Tokens / Invoices / API Keys / Audit         │  │
│  │  - Phase 1: read-only                                                │  │
│  │  - Phase 2: 完整写操作 + Webhook + Auto top-up                       │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  token-worker (long-running)                                         │  │
│  │  - invoice-generator        (月初 cron 跑前月发票)                   │  │
│  │  - reconciliation-worker    (每小时三方对账)                          │  │
│  │  - anomaly-detector         (异常消耗模式)                            │  │
│  │  - usage-aggregator         (实时 → 5min 物化视图)                    │  │
│  │  - balance-low-alert        (余额告警 + 自动 top-up trigger, Phase2) │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  Data Stores:                                                              │
│   - RDS PostgreSQL (token-prod)                                            │
│   - ElastiCache Redis (cache / rate-limit / idempotency / pricing-cache)   │
│   - S3 (invoice CSV exports / debug payloads)                              │
│                                                                            │
│  Outbound Integrations:                                                   │
│   - AI Providers (Anthropic / OpenAI / xAI / Google) via httpx             │
│   - X402 Gateway (internal mTLS)                                           │
│   - Wea (透传 X402；不直接调)                                              │
│   - 既有发票系统 (REST)                                                    │
│   - 既有 SSO (OIDC)                                                        │
│   - 既有 CRM (Webhook 接收 merchant 同步)                                  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 关键设计

### 2.1 账本（Ledger）— 系统命根
**原则**：账本是**单源（single source of truth）**，余额永远从流水加总计算（或物化视图加速）。

```
token_ledger_entries 表（append-only）
  - id, merchant_id, type (credit/debit/refund/adjustment)
  - amount_token (正负皆可？答：仅正，由 type 控制方向)
  - balance_after  (该 merchant 当前余额；非真相，仅缓存便于读)
  - source (x402_payment / ai_call / refund / admin_adjust)
  - source_ref
  - created_at, trace_id

balances 表（物化缓存）
  - merchant_id PRIMARY KEY
  - balance_token  (= SUM of credits - SUM of debits)
  - on_hold_token
  - last_updated_at
```

**事务模式**（关键 SQL）：
```sql
BEGIN;
  -- 1. 读取 + 锁定 balance
  SELECT balance_token FROM balances WHERE merchant_id = $1 FOR UPDATE;
  -- 2. 校验充足
  -- 3. 插入流水
  INSERT INTO token_ledger_entries (..., balance_after = $new_balance);
  -- 4. 更新 cache
  UPDATE balances SET balance_token = $new_balance, last_updated_at = NOW();
COMMIT;
```

**为什么用 cache + ledger 而非只用 ledger**：
- 读余额走 cache：< 5ms p99（单行索引扫）
- 写余额走 ledger：保证 audit trail + 一致性
- 余额对账：定期校验 `cache.balance == SUM(ledger by type)`，不一致告警

### 2.2 AI 调用扣费时机
**采用 post-paid 模式**（与 OpenAI / Anthropic 一致）：
```
1. 预检查 (cheap): 余额 > min_threshold (例：1000 token)，否则直接 402
2. 调用 Provider（透传请求）
3. Provider 返回 → 计量 (input_tokens + output_tokens) × model_rate = cost_token
4. 一个事务：扣 token + 写流水 + 记录 request
5. 返回客户（在 usage.balance_after 标注新余额）
```

**为何不 pre-pay**：
- 复杂（需要 hold → release / refund，Provider 失败处理麻烦）
- AI 调用本身可能 stream，token 数到结束才知
- 客户体验：失败不扣费更清晰

**风险**：客户可能在调用中途余额"超扣" → 风险有界（单次最大 ~ max_tokens × max_rate）；通过预检阈值控制

### 2.3 AI Provider 路由
```
ProviderRouter:
  - by model name → 选 Provider（默认）
  - by 显式 provider 参数 → override
  - failover（Phase 2）：原 Provider 5xx → 等价模型自动切换
  - 健康度跟踪：连续失败 → 短路 5min

Provider Adapter:
  - ClaudeAdapter / GPTAdapter / GrokAdapter / GeminiAdapter
  - 共享接口：async chat(model, messages, **kw) → ChatResponse
  - 统一 cost 计算：取 Provider 返回的 usage，乘 model_rate
```

### 2.4 鉴权 + 多租户 + RBAC
```
身份层级：
  Merchant (org) — root
    ├─ User (Console 用户) — 多角色：owner/admin/developer/finance/readonly
    └─ Project (子账户/环境)
        └─ AgentKey (API Key) — 每 Key 绑定限额、可用模型、速率
              └─ Request (使用记录)

Console 登录：既有 SSO (OIDC) → User
API 调用：API Key + HMAC → AgentKey → 间接关联 Merchant
```

### 2.5 速率限制（Rate Limiting）
- Redis token bucket，per AgentKey
- 多级：requests/min, tokens/min, USDC/day
- 越界返回 429 + `Retry-After`

### 2.6 异常消耗检测
worker 每 5min 运行：
- 同一 AgentKey 当前小时消耗 > 历史 95%分位 × 3 → 告警
- 同一 Merchant 当日消耗超日上限 90% → 告警
- 突发新模型调用模式（之前从未用过的 model） → 告警

---

## 3. API 路由设计（节选关键部分；完整见 PRD）

### 3.1 客户端 API 风格
保留两套兼容接口，降低客户迁移成本：
- **OpenAI 兼容**：`POST /v1/chat/completions`
- **Anthropic 兼容**：`POST /v1/messages`
- 内部归一化到 `UnifiedChatRequest` → ProviderAdapter

### 3.2 Console API（BFF）
Next.js App Router server actions + tRPC（type-safe）或 OpenAPI 生成 client。
默认 BFF 模式：前端不直接调 token-api，而是经 Console 内嵌 BFF（鉴权、缓存、聚合）。

---

## 4. 数据库 schema（详见 [db/SCHEMA.sql](db/SCHEMA.sql)）

核心表：
- `merchants`, `projects`, `agent_keys`, `users`
- `token_ledger_entries` (append-only, partitioned by month)
- `balances` (cache)
- `requests` (每次 AI 调用记录, partitioned)
- `payment_orders_mirror` (镜像 X402 订单，便于 join)
- `model_rates`, `packages`, `pricing_rules`
- `invoices`, `invoice_items`
- `audit_log`, `webhook_subscriptions`

---

## 5. 与外部系统对接细节

### 5.1 既有发票系统
```
Token: POST {legacy_invoice_url}/invoices
Body: { merchant_id, period, items[...], links[ tx_hash[] ] }
Legacy: 返回 invoice_pdf_url + tax_report_id
Token: 存 invoice_pdf_url 到 invoices 表，状态置 issued
```
对接 spec 在 `INTEGRATION-SPEC.md`（Tier 2）。

### 5.2 既有 SSO
Console 走 OIDC：authorization_code + PKCE；session via JWT (15min) + refresh (8h)；登出全局生效。

### 5.3 既有 CRM
CRM webhook → Token `/internal/crm/merchant-sync` → upsert merchant；状态机管理（待激活 / 激活 / 暂停 / 终止）。

---

## 6. 性能与扩展

### 6.1 关键路径性能预算
| 路径 | 目标 | 实现 |
|------|------|------|
| `GET /v1/balance` | < 50ms p99 | Redis cache + Postgres FOR UPDATE 仅在写时 |
| `POST /v1/messages` overhead | < 50ms p99 | Provider 调用前所有处理 |
| `GET /v1/usage?from=...` | < 200ms p99 | 物化视图按日聚合 |
| Console Dashboard | < 1s TTFB | BFF 预聚合 + cache |

### 6.2 写入扩展
- ledger 表分区（月）+ FK 通过 partitioning 兼容
- 高 TPS 商户可考虑 sharding by merchant_id（Phase 3）
- 物化视图刷新策略：5min 周期（balance 实时；usage 滞后 5min OK）

---

## 7. 安全实现

| 威胁 | 缓解 |
|------|------|
| API Key 泄露 | Console 一键吊销；操作幂等 |
| SQL 注入 | SQLAlchemy Core + 参数化；零字符串拼接 |
| Prompt injection | 不在本层处理（透传 Provider 责任）；但记录 input hash 便于追溯 |
| Provider Key 泄露 | Secrets Manager + 自动轮换 + IAM 限定调用源 IP |
| Console XSS | Next.js 默认转义；CSP 严格 |
| Console CSRF | SameSite cookie + CSRF token（API Routes） |
| PII 泄露 | 字段加密（pgcrypto + KMS data key）；查询自动脱敏 |

---

## 8. 可观测性

### 8.1 关键 metrics
- `token_balance_current{merchant_id}` (gauge)
- `token_consumed_total{merchant_id,model}` (counter)
- `token_provider_call_duration_seconds{provider}` (histogram)
- `token_provider_error_total{provider,error_class}` (counter)
- `token_invoice_generation_duration_seconds` (histogram)
- `token_ledger_inconsistency_detected_total` (counter, 应永远是 0)
- HTTP standard metrics

### 8.2 trace span
- `token.auth` / `token.rate_limit` / `token.pricing` / `token.provider_call` / `token.ledger_debit`

### 8.3 业务告警
- ledger inconsistency > 0 → P0
- 任一 Provider 失败率 > 5% / 5min → P1
- 单 Merchant 消耗 > 历史 P99 × 5 / 1h → P2（疑似异常）
- Invoice 生成失败 > 3 次 / 月 → P2

---

## 9. CI/CD（详见 [.github/workflows/](.github/workflows/) — Tier 1 完整样板放本模块）

阶段同 x402；额外特别：
- Console 部分：next build + lighthouse CI（性能基线）
- 数据库 migration：每 PR 跑 `alembic upgrade head` against dev DB；prod 部署前人工审批 migration
- E2E：每日 cron 跑全链路（含发起支付 → AI 调用 → 余额校验）

---

## 10. 部署 manifests（关键摘要）

```yaml
# infra/k8s/base/token/deployment.yaml （token-api 部分）
apiVersion: apps/v1
kind: Deployment
metadata: {name: token-api, namespace: token}
spec:
  replicas: 5
  selector: {matchLabels: {app: token-api}}
  template:
    metadata:
      labels: {app: token-api}
    spec:
      serviceAccountName: token-api-sa
      containers:
      - name: api
        image: <account>.dkr.ecr.ap-northeast-1.amazonaws.com/token-api:<TAG>
        env:
        - name: DATABASE_URL
          valueFrom: {secretKeyRef: {name: token-db-creds, key: url}}
        - name: REDIS_URL
          valueFrom: {secretKeyRef: {name: token-redis-url, key: url}}
        - name: ANTHROPIC_API_KEY
          valueFrom: {secretKeyRef: {name: token-provider-keys, key: anthropic}}
        # ... openai / xai / google ...
        resources:
          requests: {cpu: 1000m, memory: 1Gi}
          limits:   {cpu: 2000m, memory: 2Gi}
        readinessProbe: {httpGet: {path: /readyz, port: 8080}}
        livenessProbe:  {httpGet: {path: /healthz, port: 8080}}
---
# token-console (Next.js)
apiVersion: apps/v1
kind: Deployment
metadata: {name: token-console, namespace: token}
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: console
        image: <account>.dkr.ecr.ap-northeast-1.amazonaws.com/token-console:<TAG>
        ports: [{containerPort: 3000}]
        env:
        - name: NEXT_PUBLIC_API_BASE
          value: https://api.netstars.jp
        - name: NEXTAUTH_URL
          value: https://app.netstars.jp
        resources:
          requests: {cpu: 500m, memory: 512Mi}
          limits:   {cpu: 1000m, memory: 1Gi}
```

---

## 11. 与未来 X402↔Token 合并的准备

- `payment_orders_mirror` 表与 X402 `payment_orders` 字段命名一致（merchant_id, amount_usdc_micro, status, ...）
- 内部 `/internal/credit` API 设计为可逆（Phase 3 X402 调 Token 改为同进程函数调用，零改动）
- Ledger 表的 source_ref 已含 X402 order ID；合并时只需取消跨服务 RPC

---

## 12. 开放问题

| # | 问题 | 默认 |
|---|------|------|
| ARCH-TOK-1 | Console 用 SSR 还是 SPA？ | Next.js 15 App Router SSR + React Server Components |
| ARCH-TOK-2 | Provider 调用是否走 sidecar 代理？ | 否；直接调（v1）；Phase 3 评估出口代理 |
| ARCH-TOK-3 | 物化视图 vs 实时聚合？ | 物化视图（5min）+ 实时查询 fallback |
| ARCH-TOK-4 | 是否引入 OpenSearch 用于 audit/usage 查询？ | Phase 2 评估（v1 走 Postgres） |
| ARCH-TOK-5 | Provider Key 是 per-merchant 还是平台共享？ | 平台共享（v1）；企业级商户可选自带（Phase 3） |
