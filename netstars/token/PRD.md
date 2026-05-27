# Token System — Module PRD

> **模块**：`netstars/token/`
> **层级**：Layer 3 · OPERATIONS（运营层）+ Layer 4 部分（账务对账）
> **属于 Master PRD**：[../../prd.md](../../prd.md)
> **版本**：v1.0  ·  **日期**：2026-05-26  ·  **状态**：Draft
> **特别提示**：v1.1 决策为 **全量重写**（不复用既有 Token 系统代码）。原"复用"标注已全部改为 🆕。仅与既有**发票/财务系统**保持外部对接（详见 §9）。

---

## 1. 目的与定位

Token System 是 Netstars 的**商业核心模块**，负责将"链上支付"转化为"商户可管理、可使用、可对账的 AI Token 资产"。它承担：

1. 商户与 Agent 的身份与配额管理
2. Token 账本（余额、消耗、退款、入账）
3. AI Provider 路由与计费（统一接口接四大模型）
4. 发票、对账与结算
5. Merchant Console（Web UI，让 P1 经营层与 P2 开发者自助管理）

**关键定位**：本模块是商户**直接付费购买**的对象 — 其他三个模块（SDK / X402 / Wea）都是"管道"，本模块才是"产品"。

---

## 2. 范围（Scope）

### In Scope（全部 🆕，v1.1 决策为全量重写）
- 商户账户（merchant）、子账户（project）、API Key（agent_key）管理
- Token 账本（余额、credit / debit、流水）
- AI Provider 路由与代理调用（Anthropic / OpenAI / xAI / Google）
- 模型用量计量与定价
- 套餐与计费规则
- 发票数据生成（日元，含链上凭证）— **PDF 渲染与税务报送对接既有发票/财务系统**
- 对账（与 X402 + Wea 三方）
- Merchant Console Web UI（**Phase 1 仅只读**，v1.1 决策）
- Admin Console（Netstars 内部运营）
- 异常消耗模式检测

### Out of Scope
- 不实现 X402 协议（在 x402 模块）
- 不实现链上调用（在 wea 模块）
- 不实现支付通道接入（v1 仅 X402 + USDC；未来对接 Web2 PSP 后再扩展）
- 不实现 AI 模型本身（Provider 提供）

---

## 3. 用户故事（User Stories）

### 商户经营层（P1）

#### US-TOK-P1-1
> 作为 CFO，我希望每月自动收到日元发票（PDF + CSV 明细），并能在 Console 下载历史发票。

#### US-TOK-P1-2
> 作为 CFO，我希望每张发票包含对应的链上交易哈希列表，便于审计抽查。

#### US-TOK-P1-3
> 作为经营者，我希望为每个项目设置月度消耗上限，超出后自动停用或告警（可选）。

#### US-TOK-P1-4
> 作为合规负责人，我希望能导出 90 天内任意时段的操作日志、消耗明细、链上凭证。

#### US-TOK-P1-5
> 作为 CEO，我希望 Console 首屏一眼能看到：本月消耗、剩余余额、最近异常告警。

### 商户开发者（P2）

#### US-TOK-P2-1
> 作为开发者，我希望能在 Console 创建/吊销 Agent API Key，并为每个 Key 设置：可用模型、速率限制、消耗上限。

#### US-TOK-P2-2
> 作为开发者，我希望能查看每个 API Key 的实时消耗与最近 100 次调用记录（含 trace_id），便于排障。

#### US-TOK-P2-3
> 作为开发者，我希望 API 调用如果失败，能拿到清晰的错误码 + 修复建议链接。

#### US-TOK-P2-4
> 作为开发者，我希望能配置 Webhook 接收"余额低告警""充值成功""调用失败"等事件。

#### US-TOK-P2-5
> 作为开发者，我希望能用 API（不只是 Console）做所有上述操作，便于嵌入自有运维系统。

### Agent（P3）

#### US-TOK-P3-1
> 作为 Agent，我希望调用 `/v1/balance` 能拿到当前余额（≤ 100ms p99）。

#### US-TOK-P3-2
> 作为 Agent，我希望调用 AI 时收到的响应包含 `usage.tokens_consumed` 与 `usage.balance_after`，便于自我管理。

#### US-TOK-P3-3
> 作为 Agent，我希望能 GET `/v1/models` 拿到所有可用模型 + 单价 + 当前可用性，便于动态选模型。

### Netstars 内部运营（P4）

#### US-TOK-P4-1
> 作为运营，我希望能在 Admin Console 看到所有商户的消耗排行、异常告警、Provider 健康度。

#### US-TOK-P4-2
> 作为运营，我希望能配置 Token 套餐、定价规则、灰度策略，并设置预览/审批流程。

#### US-TOK-P4-3
> 作为运营，我希望能一键冻结某个 merchant / agent_key，立即生效（毫秒级）。

#### US-TOK-P4-4
> 作为运营，我希望全链路 trace 工具：输入 trace_id 看到 SDK→X402→Wea→Token 全部事件时间线。

---

## 4. 公开接口（API · 概念级）

### 4.1 SDK / Client API

```
账户与鉴权
GET    /v1/me                          当前账户信息
GET    /v1/balance                     当前余额（包含冻结额）
GET    /v1/usage?from=...&to=...       消耗统计

模型与调用
GET    /v1/models                      可用模型列表 + 当前单价
POST   /v1/chat/completions            调用 AI 模型（OpenAI 兼容格式 + Netstars 扩展）
POST   /v1/messages                    调用 AI 模型（Anthropic 兼容格式）

订单与支付
POST   /v1/token-purchase              手动触发购买（含 X402 流程）
GET    /v1/orders                      订单列表
GET    /v1/orders/{id}                 订单详情

发票与对账
GET    /v1/invoices                    发票列表
GET    /v1/invoices/{id}/pdf           下载 PDF
GET    /v1/invoices/{id}/items         发票明细 CSV
```

### 4.2 Merchant Console API（Web UI 后端）

```
账户管理
POST   /console/api-keys               创建 API Key
DELETE /console/api-keys/{id}          吊销
PATCH  /console/api-keys/{id}          修改配额/限制
GET    /console/projects               子账户/项目
POST   /console/projects               新建项目
GET    /console/webhooks               webhook 配置
POST   /console/webhooks               注册 webhook

可视化
GET    /console/dashboard              首屏汇总（余额 / 消耗 / 告警）
GET    /console/usage-timeseries       消耗时序数据
GET    /console/call-logs              最近调用日志（带 trace_id）
GET    /console/payments-timeseries    支付时序
```

### 4.3 Admin Console API（内部）

```
GET    /admin/merchants                所有商户
POST   /admin/merchants/{id}/freeze    冻结
GET    /admin/tracing/{trace_id}       全链路追踪
GET    /admin/reconciliation/daily     当日对账
POST   /admin/pricing/rules            定价规则
POST   /admin/packages                 套餐
```

### 4.4 模块间内部 API

```
POST   /internal/credit                由 x402 调用，credit Token
POST   /internal/agent-key-validate    由 x402 调用，校验 agent_key 状态
GET    /internal/merchant-config       由 x402 调用，拿商户配置
```

---

## 5. 数据模型（核心实体）

```
Merchant (商户)
  ├─ id, name, contact_email, status, created_at
  ├─ tax_id, billing_address, currency_pref
  └─ sub_account_settings

  Project (子账户/项目)
    ├─ id, merchant_id, name, status
    └─ monthly_limit_usdc

    AgentKey (API Key)
      ├─ id, project_id, key_hash, secret_hash_or_kms_ref
      ├─ allowed_models, rate_limit_rpm, daily_limit_usdc
      └─ status, last_used_at

      Request (调用记录)
        ├─ id, agent_key_id, trace_id
        ├─ model, prompt_tokens, completion_tokens
        ├─ cost_token, cost_usdc_equiv
        └─ status, latency_ms, created_at

TokenLedger (账本流水) — 双向账目
  ├─ id, merchant_id, type [credit|debit|refund|adjustment]
  ├─ amount_token, balance_after
  ├─ source [x402_payment | ai_call | admin_adjust | refund]
  ├─ source_ref (payment_order_id / request_id / ...)
  └─ created_at, trace_id

PaymentOrder (镜像 x402 订单，便于本地 join)
  ├─ x402_order_id, merchant_id, amount_usdc
  ├─ tokens_credited, tx_hash
  └─ status, confirmed_at

Invoice (发票)
  ├─ id, merchant_id, period_yyyymm
  ├─ subtotal_jpy, tax_jpy, total_jpy
  ├─ pdf_url, csv_url, status
  └─ included_orders, included_requests
```

---

## 6. 关键计费与定价规则

### 6.1 Token 与法币的换算关系

```
1 USDC ≈ 150 JPY（实时汇率，每分钟刷新；锁定汇率在订单时点）
1 USDC = 1,000,000 AI Token（基准单位，固定）
```

→ 实际 AI 调用按模型不同消耗不同数量 Token：

| 模型 | 输入 1K tokens 消耗 | 输出 1K tokens 消耗 |
|------|--------------------|--------------------|
| Claude Opus 4.7 | 15,000 Token | 75,000 Token |
| Claude Sonnet 4.6 | 3,000 Token | 15,000 Token |
| Claude Haiku 4.5 | 800 Token | 4,000 Token |
| GPT-4.1 | 10,000 Token | 30,000 Token |
| Grok-4 | TBD | TBD |
| Gemini-2.5-pro | TBD | TBD |

> 单价从 Provider 批发价 + Netstars markup 计算（markup% 为商务机密配置项）

### 6.2 套餐（Phase 2 上线）

| 套餐 | 月费（JPY） | 包含 Token | 超量单价 | 适用 |
|------|-----------|----------|---------|------|
| Trial | 0 | 1M | 标准价 + 20% | 评估用户 |
| Growth | 50,000 | 50M | 标准价 | 中小商户 |
| Enterprise | 商谈 | 500M+ | 折扣 | 大型客户 |

> **D3**（Master PRD 决策项）待确认。

### 6.3 计费时点
- AI 调用：调用**完成后**按实际 usage 扣减（不预扣，避免失败回滚复杂）
- 异常：Provider 返回失败 → 不扣费；超时但 Provider 实际处理 → 仍扣费（与 OpenAI / Anthropic 一致）

---

## 7. Merchant Console（Web UI）需求

> **设计 skill 调用**：本 Console 的 UI/UX 设计阶段将显式使用 `ui-ux-pro-max` skill 与 `frontend-design` skill。

### 7.1 信息架构（顶层导航）

```
┌─────────────────────────────────────┐
│ Dashboard    本月概览首屏              │
│ Usage        消耗分析（时序 / 拆分）   │
│ Tokens       账本 / 充值 / 套餐        │
│ API Keys     Key 管理 / 限额 / 日志    │
│ Models       可用模型 + 单价 + 调用文档 │
│ Invoices     发票下载                  │
│ Settings     账户 / 团队 / Webhook     │
│ Audit Log    操作日志（合规）          │
└─────────────────────────────────────┘
```

### 7.2 Phase 1 关键页面（**仅只读**，v1.1 决策 D6+D7）
1. **Dashboard 首屏**：余额 / 本月消耗 / 异常告警卡片 / 最近 7 日趋势
2. **Token 充值状态查询**（充值动作通过 SDK / API 完成，Console 只展示进度与结果）
3. **调用日志查询**（trace_id 检索）
4. **发票查看与下载**

> ⚠️ Phase 1 写操作（API Key 创建 / 配额修改 / Webhook 配置 / 项目管理）**仅通过 API 或 admin CLI**。Console 写功能放 Phase 2。

### 7.3 Phase 2 关键页面（增加写操作）
1. **API Key 创建与配额配置**（含速率限制、可用模型、消耗上限）
2. **Webhook 配置**
3. **项目 / 子账户管理**
4. **充值流程 UI**（输入金额 → 显示 USDC 等值 + 预计到账时间）

### 7.4 v2+ 增量（Phase 3）
- 子账户多租户管理
- 自定义报表导出
- 自动充值（余额低于阈值自动 topup）
- 多语言（日 / 英 → 中）

### 7.4 视觉与交互原则
- **像 Stripe Dashboard 一样**：信息密度高、表格为主、操作可发现
- **避免区块链感**：默认不显示"链上""USDC""哈希"等术语；放在"高级"或"审计"视图
- **日本企业适配**：日期 YYYY/MM/DD、金额用日元格式化
- **响应式**：v1 仅 desktop（≥ 1200px）；mobile 放 Phase 3

---

## 8. 非功能性需求（本模块）

| 类别 | 要求 |
|------|------|
| **API 延迟** | 余额查询 < 100ms p99；AI 调用透传 Provider 延迟 + Netstars overhead < 50ms |
| **吞吐** | 单 Token 服务 200 RPS（Phase 1） → 2000+ RPS（Phase 3） |
| **可用性** | Token API 99.5% Phase 1 → 99.9% Phase 3；Console 99% |
| **数据一致性** | 账本写入强一致（数据库事务）；与 X402 / Wea 最终一致 + reconciliation 兜底 |
| **数据保留** | 流水 7 年；操作日志 90 天热 + 7 年冷；PII 按用户请求删除 |
| **Console 首屏 TTFB** | < 1s（Tokyo region） |

---

## 9. 与既有系统的边界（v1.1 决策：Token 全量重写）

Token 系统本身**全量重写**，不复用既有 Token 代码。但仍需与公司其他既有系统对接（这些不在本模块范围内）：

| 既有系统 | 对接方式 | 边界说明 |
|---------|---------|---------|
| **发票/账单系统**（既有） | API 集成：Token 系统生成发票数据 → 既有系统渲染 PDF + 税务报送 | 避免重做日本税务合规逻辑 |
| **财务对账系统**（既有） | 每月导出对账文件 → 既有系统入账 | 财务部既有流程不动 |
| **企业 SSO / 身份系统**（既有） | Console 登录通过既有 SSO（OIDC） | 商户管理员复用公司账号 |
| **CRM**（既有） | 商户基础信息同步（单向：CRM → Token） | 销售签约信息源在 CRM |
| **Web2 支付 PSP 平台**（既有 Netstars 核心） | 未来 Phase 4 可能合并支付通道；v1 不集成 | 保持模块独立 |

### 9.1 全量重写的理由（v1.1 决策记录）
- 既有 Token 系统并非为 Agent / 高频小额场景设计
- AI Provider 路由、X402 集成、链上凭证关联是新需求，改造既有系统的成本接近重写
- 新系统采用现代技术栈，避免被既有遗留约束（数据库 schema、内部 API 风格）
- **代价**：需要前置完成与上述既有系统的对接 spec（项目启动 2 周内输出 `INTEGRATION-SPEC.md`）

---

## 10. 失败模式与降级

| 失败 | Token 系统行为 |
|------|------|
| 某 AI Provider 故障 | 模型路由层降级到其他 Provider（如果支持等价模型）；否则返回 503 + 建议替代模型 |
| 全部 Provider 故障 | API 返回 503；Console 显示运维状态页；不计费 |
| X402 回调延迟 | Token credit 延迟，但调用方可通过 webhook 获知；不影响余额查询 |
| 余额查询不一致（cache 与 DB） | 严格读 DB；cache 仅做加速；不一致以 DB 为准 |
| 发票生成失败 | 后台 worker 重试；告警；不影响主链路 |
| Console 故障 | API 不受影响；商户可仅靠 API 维持运营 |

---

## 11. 安全要求

- **API Key 存储**：仅存 hash（HMAC + salt），secret 永不可见
- **PII 加密**：商户联系人邮箱、电话加密存储（field-level encryption）
- **RBAC**：Console 多角色（owner / admin / developer / read-only / finance）
- **2FA**：Console 强制 owner / admin 启用 2FA（TOTP）
- **审计**：所有写操作记录 actor / action / before / after，append-only
- **数据脱敏**：API 响应、错误信息、日志中 API Key、secret 自动 mask

---

## 12. 部署与发布

- **服务拆分**：
  - `token-api`：对外 API（无状态）
  - `token-console`：Web UI（前端 SPA + BFF）
  - `token-worker`：后台任务（发票生成、对账、webhook 重试、异常检测）
- **数据库**：PostgreSQL 主从（读写分离）+ Redis（cache、rate-limit、idempotency）
- **CI/CD**：独立 `.github/workflows/`（与其他模块完全独立）
- **数据迁移**：使用版本化 migration（如 Alembic / Prisma migrate），与既有系统的迁移单独 plan

---

## 13. 开放问题

### 13.1 ✅ 已决策（v1.1）
| # | 问题 | 最终选择 |
|---|------|---------|
| TOK-Q1 | 既有 Token 系统改造工作量？是否需要新写 vs 适配既有？ | **全量重写**为新 Token 系统；与既有发票/财务/SSO/CRM 系统对接 |
| TOK-Q4 | Console 部署归属？ | **Token 子模块**（同代码库，独立部署）（= Master D6） |
| TOK-Q5 | 日元发票生成接既有 vs 新建？ | **接既有发票系统**（Token 生成数据，既有系统渲染 PDF + 税务报送） |

### 13.2 ⏳ 待决策
| # | 问题 | 默认假设 | 待决策方 |
|---|------|---------|---------|
| TOK-Q2 | 定价规则（D3）：纯包月套餐 / 按量 / 混合？ | 混合 | 商务 + 财务（Master D3） |
| TOK-Q3 | Provider 失败时是否允许"自动等价模型路由"？ | 否（v1 简单透传）；Phase 2 加 | 产品 |
| TOK-Q6 | 商户能否选择 Token 的"过期机制"？（如 365 天有效期） | v1 无过期；Phase 3 可选 | 产品 + 法务 |
| TOK-Q7 | AI Provider markup 是否公开？ | 不公开（仅显示终端价） | 商务 |

---

## 14. 参考资料

- [Master PRD](../../prd.md)
- [sdk/PRD.md](../../sdk/PRD.md) — Token API 的客户端
- [x402/PRD.md](../x402/PRD.md) — 支付层对接
- [wea/PRD.md](../../wea/PRD.md) — 结算事件来源
- OpenAI / Anthropic API 风格 — Token API 兼容性参考
- Stripe Dashboard — Console UX 参考
