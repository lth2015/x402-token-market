# X402 Gateway — Module PRD

> **模块**：`netstars/x402/`
> **层级**：Layer 2 · PAYMENT（支付层）
> **属于 Master PRD**：[../../prd.md](../../prd.md)
> **版本**：v1.0  ·  **日期**：2026-05-26  ·  **状态**：Draft

---

## 1. 目的与定位

实现 **X402 协议**的服务端，作为商户 / Agent 与链上支付之间的协议适配层与订单管理中枢：

- 接收受保护资源访问请求，返回机器可读的 `402 Payment Required`
- 创建并管理支付订单（idempotency / 状态机 / 过期）
- 校验客户端签名的支付证明
- 协调 [wea](../../wea/PRD.md) 完成链上结算
- 链上确认后通知 [token](../token/PRD.md) credit 账本
- 向客户端推送 webhook 回调

**关键定位**：本模块是**协议执行引擎**，不持有 Token 余额、不直接调用链 — 这两件事分别在 Token 系统和 Wea 中完成。

---

## 2. 范围（Scope）

### In Scope
- X402 协议服务端实现（HTTP 402 协议 + 支付证明 schema + webhook）
- 支付订单的全生命周期管理（created / pending / confirmed / failed / expired / refunded）
- Idempotency 保障（同一 idempotency_key 24h 内重复返回原结果）
- 支付证明的签名验证
- 调用 Wea 执行链上结算
- 接收 Wea 链上确认回调
- 通知 Token 系统 credit
- 向客户端发送 webhook（支付成功 / 失败 / 过期）
- 提供查询接口（订单状态查询）

### Out of Scope
- 不实现 Token 余额管理（在 token 模块）
- 不直接调用 Solana RPC（通过 wea 模块）
- 不实现商户 / Agent 注册（在 token 模块）
- 不实现 API Key 鉴权基础设施（共享 token 模块的 Auth Service）

---

## 3. 用户故事（User Stories）

### US-X402-1（Agent 请求受保护资源）
> **作为**Agent，**我希望**访问受保护资源时收到机器可读的 402 应答，包含支付金额、币种、接收地址、过期时间，**这样**我能不依赖人工自动完成支付。

**验收**：
- 402 响应符合 X402 spec：`{ amount, asset, network, recipient, nonce, expires_at, order_id }`
- 响应 Header `WWW-Authenticate: X402` 标识协议
- 响应体可被任何符合 X402 客户端解析（兼容 Coinbase SDK 测试）

### US-X402-2（创建支付订单）
> **作为**SDK，**我希望**创建支付订单时支持 idempotency_key，**这样**网络重试不会产生重复扣款。

**验收**：
- POST `/v1/payments` 接受 `Idempotency-Key` 请求头
- 同一 key + 同一 body 24h 内重复请求返回原结果（status 200，不创建新订单）
- 同一 key + 不同 body 返回 409 Conflict

### US-X402-3（提交支付证明）
> **作为**SDK，**我希望**用客户端签名的 USDC transfer 作为支付证明，**这样**Netstars 不接触我的私钥就能确认我已支付。

**验收**：
- POST `/v1/payments/{order_id}/proof` 接受 `{ signed_tx_base64, tx_hash }`
- 服务端校验签名（解析交易，验证 from / to / amount / asset 与订单匹配）
- 验证通过后交给 Wea 广播
- 验证失败返回 422 + 具体原因（amount_mismatch / wrong_recipient / invalid_signature 等）

### US-X402-4（接收链上确认）
> **作为**X402 Gateway，**我希望**Wea 在链上确认后回调我，**这样**我能及时通知 Token 系统 credit + 通知客户端。

**验收**：
- Wea 通过 webhook POST 到 `/internal/wea/callback`
- 校验 mTLS + HMAC 双重身份
- 幂等处理（同一 tx_hash 重复回调不重复 credit）
- 收到后 100ms 内通知 token 模块；600ms 内向客户端推 webhook

### US-X402-5（查询订单状态）
> **作为**客户端 / Agent，**我希望**主动查询订单状态，**这样**在没收到 webhook 时也能确认结果。

**验收**：
- GET `/v1/payments/{order_id}` 返回完整订单 + 当前状态 + tx_hash（如有）
- 鉴权：仅订单 owner 或 admin 可查
- 响应 ≤ 100ms p99

### US-X402-6（订单过期）
> **作为**X402 Gateway，**我希望**未支付的订单 30 分钟后自动过期，**这样**客户端不会拿着过期的支付要求去链上提交导致资金死账。

**验收**：
- 订单创建时计算 `expires_at = now + 30min`（可配置）
- 后台 worker 每分钟扫描过期订单，状态置为 `expired`
- 过期订单收到支付证明返回 410 Gone

### US-X402-7（失败处理与对账）
> **作为**运维，**我希望**所有 status=failed 或 stuck 的订单有列表查询接口，**这样**我能批量人工对账。

**验收**：
- Admin API: GET `/admin/payments?status=failed&from=...&to=...`
- 提供"重试""标记为已对账""退款"三种动作
- 所有动作记录审计日志

---

## 4. 公开接口（API · 概念级）

### 4.1 客户端 API（SDK 调用）

```
POST   /v1/payments                    创建支付订单
POST   /v1/payments/{id}/proof         提交支付证明
GET    /v1/payments/{id}               查询订单状态
GET    /v1/payments?...                列表查询（带 filter）
DELETE /v1/payments/{id}               取消订单（仅 status=created）
```

### 4.2 受保护资源访问入口（X402 协议本体）

```
ANY    /v1/protected/*                 任何访问，未付费返回 402
```

实际业务上，受保护资源是 token 模块的 AI 调用接口，但 X402 协议层提供"通用 402 应答机制"以兼容未来扩展（多 SaaS 厂商接入）。

### 4.3 内部 API（模块间）

```
POST   /internal/wea/callback          Wea 链上结果回调（mTLS）
POST   /internal/token/credit-ack      Token 系统 ack（mTLS）
```

### 4.4 客户端 Webhook（推送）

```
POST   {client_webhook_url}            事件：payment.confirmed / payment.failed / payment.expired
  Header: X-Netstars-Signature: HMAC-SHA256(...)
  Body: { event, payment_order_id, status, tx_hash, ... }
```

### 4.5 Admin API（内部运营）

```
GET    /admin/payments                 全量查询
POST   /admin/payments/{id}/retry      手动重试
POST   /admin/payments/{id}/refund     退款（异步）
GET    /admin/reconciliation/daily     当日三方对账报告
```

---

## 5. 关键状态机

```
                                          ┌─────────────┐
                            ┌────────────►│  expired     │
                            │             └─────────────┘
                            │ timeout
   POST /payments    submit proof    Wea confirm        notify token
created ─────────► pending ─────────► broadcasting ───► confirmed ───► token_credited
   │                                       │
   │ DELETE                                │ chain fail / proof reject
   ▼                                       ▼
canceled                                failed
                                            │ admin refund
                                            ▼
                                        refunded
```

| 状态 | 含义 | 客户端可见 |
|------|------|-----------|
| `created` | 订单已创建，未收到支付证明 | ✓ |
| `pending` | 已收到证明，等待 Wea 广播 + 链上确认 | ✓ |
| `broadcasting` | Wea 已广播，等待确认 | （内部） |
| `confirmed` | 链上确认成功 | ✓ |
| `token_credited` | Token 系统已入账 | ✓（终态） |
| `failed` | 链上失败 / 证明校验失败 | ✓（终态） |
| `expired` | 超时未支付 | ✓（终态） |
| `canceled` | 客户取消 | ✓（终态） |
| `refunded` | 已退款 | ✓（终态） |

---

## 6. 非功能性需求（本模块特定）

| 类别 | 要求 |
|------|------|
| **延迟** | API p99 < 500ms（Phase 1），< 200ms（Phase 3） |
| **吞吐** | 单实例 50 TPS（Phase 1），集群 500+ TPS（Phase 3） |
| **可用性** | 99.5%（Phase 1），99.9%（Phase 3） |
| **状态一致性** | 订单状态变更通过数据库事务保证；webhook 推送至少一次（At-least-once） |
| **幂等性** | 所有写操作支持 Idempotency-Key |
| **审计** | 状态机所有变更记录 audit log（unchangeable, append-only） |

---

## 7. 与其他模块的依赖

### 7.1 上游（被谁调用）
- [sdk/](../../sdk/PRD.md) — 客户端
- 外部客户端（不通过 SDK 直接 HTTP 调用）

### 7.2 下游（依赖谁）
| 模块 | 调用 | 时序 |
|------|------|------|
| [wea/](../../wea/PRD.md) | 提交支付证明执行链上结算 | 异步（payment_id） |
| [token/](../token/PRD.md) | 链上确认后通知 credit；查询 merchant/agent_key 有效性 | 同步 |
| 共享 Auth Service | API Key 与 HMAC 校验 | 同步 |

---

## 8. 部署形态

- **运行时**：无状态 HTTP 服务 + 后台 worker（订单过期扫描、webhook 重试队列）
- **数据库**：独立 PostgreSQL（订单、idempotency、webhook log）
- **缓存**：Redis（idempotency key 短期缓存、API Key 校验缓存）
- **水平扩展**：API server 任意水平扩展；worker 单实例（或 leader election）
- **依赖**：内部 mTLS 到 wea / token；外部 HTTPS 出站到客户 webhook

### 8.1 CI/CD 独立性
- 独立的 `.github/workflows/`：lint / unit / integration / deploy
- 独立版本号（SemVer）
- 数据库迁移独立管理（不与其他模块共享 schema）

---

## 9. 失败模式与降级

| 失败 | Gateway 行为 |
|------|------|
| Wea 不可达 | 订单状态保持 `pending`；后台 worker 持续重试；超 30 分钟标记 failed + 告警 |
| Token 系统不可达 | 链上已确认但 credit 失败 → 后台 reconciliation 任务持续重试 + 告警 |
| 客户 webhook 不可达 | 至少一次推送策略：指数退避重试（5min / 15min / 1h / 6h / 24h）共 5 次 |
| 数据库主库故障 | 切换从库 → 短暂只读窗口 → 客户收到 503 + Retry-After |
| Redis 故障 | 退化到数据库幂等（牺牲性能保正确性） |
| 签名校验 CPU 飙高 | 队列 + 限流；非关键路径降级 |

---

## 10. 安全要求

- **签名校验严格**：拒绝任何不匹配的支付证明（amount / recipient / asset）
- **防重放**：每个订单的 nonce 仅可使用一次；过期订单证明立即拒绝
- **mTLS 内部**：与 wea / token 通信全部 mTLS + 服务身份
- **Webhook 签名**：所有出站 webhook 用商户私有 secret 签名（HMAC-SHA256）
- **审计日志**：所有状态变更、admin 操作、webhook 推送均不可篡改记录
- **PII 隔离**：本模块只持有 merchant_id / agent_key_id（hash），不持有姓名邮箱等 PII

---

## 11. 与未来 X402↔Token 合并的预备

按 Master PRD §10.3，Phase 3 计划合并 X402 与 Token。本模块为此预备：

- 订单数据模型与 Token 系统的 PaymentOrder 字段对齐（命名、类型、ID 格式）
- 内部事件通过 message broker（不直接调用 token API），未来 token 可订阅同样的事件流
- 数据库 schema 设计预留 `consolidated_at` 字段，便于迁移追溯

---

## 12. 开放问题

| # | 问题 | 默认假设 | 待决策方 |
|---|------|---------|---------|
| X402-Q1 | 订单过期时长 30 分钟是否合理？Agent 场景下可能需要更短 | 30 分钟，可商户级别配置 | 产品 + 商务 |
| X402-Q2 | Webhook 重试次数与节奏 | 5 次（5m/15m/1h/6h/24h） | 工程 + 产品 |
| X402-Q3 | 是否在 Phase 1 引入消息队列（如 NATS/Kafka） | 不引入（直接 HTTP） | 架构师 |
| X402-Q4 | 支付证明校验是否要支持多种链 / 多种 token v1？ | 仅 Solana + USDC | 产品（已在 Master 排除多链 v1） |
| X402-Q5 | 是否支持"预授权"模式（Pre-auth + Capture）？ | v1 仅 immediate 模式；预授权放 Phase 3 | 产品 |

---

## 13. 参考资料

- [Master PRD](../../prd.md)
- [Coinbase x402 spec](https://github.com/coinbase/x402)
- [sdk/PRD.md](../../sdk/PRD.md) — 客户端集成方式
- [wea/PRD.md](../../wea/PRD.md) — 链上执行对接
- [token/PRD.md](../token/PRD.md) — Token 系统对接
