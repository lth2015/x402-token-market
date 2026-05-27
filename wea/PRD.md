# Wea Settlement Connector — Module PRD

> **模块**：`wea/`
> **层级**：Layer 4 · SETTLEMENT（结算执行层）
> **属于 Master PRD**：[../prd.md](../prd.md)
> **版本**：v1.0  ·  **日期**：2026-05-26  ·  **状态**：Draft
> **执行主体**：Wea Japan（合作伙伴 / 合规执行方）
> **合规说明**：本模块是项目的**链上执行边界**。Netstars 不直接与链交互；所有 USDC / Solana 操作均由 Wea Japan 承担，以保持 Netstars 的 Web2 PSP 监管定位（详见 Master PRD §6.2 NFR-COMP-3）。

---

## 1. 目的与定位

为整个平台提供**单一的链上执行通道**：

- 接收 X402 Gateway 转发的支付证明
- 在 Solana 主网 / 测试网广播 USDC 转账
- 持续轮询交易确认状态
- 链上结果异步回调 X402
- 提供历史 TX 查询接口（对账用）

**关键定位**：本模块是**纯执行**，不持有商户身份、Token 余额、定价信息 — 它只认 `payment_id` + `amount` + `recipient` 这三个抽象字段，把链上世界与 Netstars 业务世界严格隔离。

---

## 2. 范围（Scope）

### In Scope
- Solana RPC 连接管理（多节点冗余、健康检查、自动切换）
- USDC（SPL Token）转账广播
- 交易确认轮询（finalized / confirmed 级别可选）
- 链上结果回调到 X402（HMAC + mTLS 双重签名）
- 失败重试（瞬时错误如 RPC 超时、blockhash 过期）
- 历史 TX 查询 API（按 payment_id 或 tx_hash）
- Wea 自身的余额监控（接收钱包余额异常告警）
- USDC 锚定监控（脱锚阈值告警 + 自动暂停接口）

### Out of Scope
- 不持有商户 / Agent 身份信息
- 不实现 Token 业务逻辑（余额、计费）
- 不实现 X402 协议
- 不持有客户私钥
- 不支持非 USDC 资产（v1）
- 不支持非 Solana 链（v1）

---

## 3. 用户故事（User Stories）

### US-WEA-1（接收并执行支付）
> 作为 X402 Gateway，**我希望**调用 wea API 提交客户已签名的支付证明后，wea 负责广播到 Solana 并确认，**这样**我不需要直接与链交互。

**验收**：
- POST `/v1/settlements` 接受 `{ payment_id, signed_tx, expected_amount, expected_recipient }`
- wea 校验签名结构后立即返回 202 Accepted + `settlement_id`
- 异步进行广播 + 确认 + 回调

### US-WEA-2（异步回调）
> 作为 X402 Gateway，**我希望**链上确认后能及时收到 wea 的 webhook，**这样**我能继续走 Token credit 流程。

**验收**：
- 链上 confirmed 级别（约 400ms）后立即回调 X402
- 回调失败重试：5min / 15min / 1h / 6h / 24h 共 5 次
- 回调 body 含 `settlement_id, payment_id, status, tx_hash, confirmed_at, slot`
- 签名：HMAC-SHA256 + mTLS

### US-WEA-3（处理 RPC 故障）
> 作为 wea，**我希望**主 RPC 节点故障时自动切换到备份节点，**这样**支付链路不会被链上层故障打断。

**验收**：
- 配置 ≥ 3 个 RPC 节点（不同 Provider，如 QuickNode / Helius / 自建）
- 健康检查每 10s 一次
- 主节点连续 3 次失败立即切换；恢复后回切（hysteresis 防抖）
- 切换事件告警

### US-WEA-4（USDC 脱锚监控）
> 作为 wea，**我希望**实时监控 USDC 价格，脱锚超阈值时暂停新的结算，**这样**避免在异常市场下接受可疑支付。

**验收**：
- 接入 ≥ 2 个价格源（CoinGecko + Chainlink on-chain oracle）
- 阈值：< $0.97 或 > $1.03 持续 5 分钟触发暂停
- 暂停时新的 `/v1/settlements` 请求返回 503 + `reason: usdc_depeg_protection`
- 已 in-flight 的支付继续完成

### US-WEA-5（对账接口）
> 作为 X402 / 运营，**我希望**能按时间范围或 payment_id 查询所有结算记录，**这样**每日对账能自动化。

**验收**：
- GET `/v1/settlements?from=...&to=...&status=...`
- GET `/v1/settlements/{id}`
- 返回字段完整：所有状态变更时间点、链上 TX 详情、回调历史

### US-WEA-6（确认级别可选）
> 作为 X402，**我希望**能按业务场景选择 `confirmed`（~400ms，速度优先）或 `finalized`（~13s，安全优先），**这样**小额支付可以更快返回。

**验收**：
- 创建 settlement 时支持 `confirmation_level: "confirmed" | "finalized"`
- 默认 `confirmed`（衡量速度与安全的平衡）

---

## 4. 关键状态机

```
                              ┌───────────┐
                       ┌─────►│  failed   │
                       │      └───────────┘
   POST /settlements   │ broadcast fail / proof invalid
   ──────────►  pending
                       │ broadcast ok
                       ▼
                  broadcasting
                       │
                       │ confirm
                       ▼
                  confirmed ────► callback_pending ────► done
                                         │
                                         │ callback fail (after 5 retries)
                                         ▼
                                  callback_failed (人工介入)
```

| 状态 | 含义 |
|------|------|
| `pending` | 已接收，等待广播 |
| `broadcasting` | 已向 Solana 广播，等待确认 |
| `confirmed` | 已达到目标确认级别 |
| `callback_pending` | 回调 X402 中（含重试） |
| `done` | 完整流程结束 |
| `failed` | 广播或链上失败 |
| `callback_failed` | 已确认但回调彻底失败（仍可通过对账接口同步） |

---

## 5. 公开接口（API · 概念级）

### 5.1 业务 API（仅 X402 调用，mTLS）

```
POST   /v1/settlements                 提交结算请求
GET    /v1/settlements/{id}            查询单个
GET    /v1/settlements                 列表查询（带 filter）
POST   /v1/settlements/{id}/retry      手动重试（admin token 鉴权）
```

### 5.2 健康与运维

```
GET    /healthz                        liveness
GET    /readyz                         readiness（含 RPC 节点健康）
GET    /v1/system/status               系统状态：RPC nodes / USDC peg / queue depth
GET    /v1/system/wallet-balance       接收钱包余额（监控用）
```

### 5.3 回调（推送到 X402）

```
POST   {x402_callback_url}             事件：settlement.confirmed / settlement.failed
  Header: X-Wea-Signature: HMAC-SHA256(...)
  Body: { settlement_id, payment_id, status, tx_hash, confirmed_at, slot }
```

---

## 6. 非功能性需求

| 类别 | 要求 |
|------|------|
| **吞吐** | 单实例 100 settlements/min（Phase 1） → 1000/min（Phase 3） |
| **广播延迟** | API 接收到 RPC 广播 < 200ms p95 |
| **端到端** | submit → confirmed 回调 < 3s p95（Solana confirmed level） |
| **可用性** | 99.5% Phase 1 → 99.9% Phase 3 |
| **RPC 冗余** | ≥ 3 节点，主节点故障 < 30s 自动切换 |
| **回调可靠性** | At-least-once；at-most-5-retries；失败可通过对账自愈 |

---

## 7. 与其他模块的依赖

### 7.1 上游
- [netstars/x402/](../netstars/x402/PRD.md) — 唯一调用方

### 7.2 下游
- Solana RPC nodes（≥ 3 个 Provider）
- USDC SPL Token 程序（链上）
- 价格 Oracle（CoinGecko + Chainlink）

### 7.3 严格隔离原则
- **不调用 token 模块**（避免业务耦合）
- **不与 sdk 通信**
- 仅通过 X402 间接为业务服务

---

## 8. 部署形态

- **执行主体**：Wea Japan（合作伙伴方运行）
- **网络位置**：建议部署在与 Netstars X402 同 region 同 VPC（或专线打通），mTLS 通信
- **运行时**：
  - `wea-api`：业务 API（无状态，可水平扩展）
  - `wea-worker`：广播与确认轮询（leader election）
  - `wea-callback`：回调发送（可水平扩展，状态在 DB）
- **数据库**：独立 PostgreSQL（结算记录、回调日志）
- **密钥管理**：发送钱包私钥（Ed25519 keypair）以 AWS KMS（ap-northeast-1 CMK）Encrypt 后存库；签名时 Decrypt 到进程内存、用完清零；明文绝不落盘
- **CI/CD**：Wea Japan 独立 `.github/workflows/`（与 Netstars 完全隔离的代码库 / 部署管道）

### 8.1 钱包架构（链上资金管理）
- **接收钱包**（hot）：接收客户支付，余额低阈值时自动从冷钱包补
- **运营钱包**（warm）：覆盖链上手续费支出
- **冷钱包**（cold）：长期资金存储，多签控制
- **每日清算**：接收钱包余额自动结算到冷钱包（保留 buffer）

---

## 9. 失败模式与降级

| 失败 | wea 行为 |
|------|------|
| RPC 节点不可达 | 自动切换 → 切换全部失败 → 告警 + 返回 503 |
| Blockhash 过期 | 自动重新获取 + 重签广播（如签名结构允许）；否则失败回调 |
| Solana 拥堵 | 提高 priority fee（可配置上限）；超时则失败 |
| 接收钱包余额异常 | 告警；不阻塞业务（仅监控） |
| USDC 脱锚 | 暂停新结算（503）；已 in-flight 继续 |
| 回调彻底失败 | 状态 `callback_failed`，对账接口可被动同步 |
| 数据库故障 | 业务停止接收（503）；in-flight 不丢（数据库事务） |

---

## 10. 安全要求

- **私钥管理**：Ed25519 keypair 以 AWS KMS（ap-northeast-1）Encrypt 后的密文存库；运行时 Decrypt 至进程内存即用即清零；明文绝不落盘；任何运维不可见明文
- **mTLS 强制**：所有与 X402 的通信
- **HMAC 签名**：回调使用与 X402 协商的独立 secret
- **请求审计**：所有 API 调用记录（不含敏感字段）
- **链上凭证不可篡改**：tx_hash 一旦确认，状态永久不可修改
- **资金安全**：每日清算 + 冷热钱包分离 + 多签
- **依赖审计**：Solana web3.js / spl-token 库版本严格锁定，CVE 监控

---

## 11. 监控与告警（必须配置）

| 告警 | 触发条件 | 严重度 |
|------|---------|--------|
| RPC 全部失败 | 主备节点同时不可用 | P0 |
| 接收钱包余额低 | < 配置阈值 | P1 |
| USDC 脱锚触发 | 已暂停 | P1 |
| 回调失败累积 | > 10/h | P2 |
| 端到端延迟 SLO 违反 | p95 > 5s 持续 5min | P2 |
| 单笔结算失败 | 1 次（用于排障） | P3 |

---

## 12. 与 Netstars 的协作约定

> 因 wea 由 Wea Japan 独立运营，需要明确协作 SLA：

| 项 | 约定 |
|----|------|
| 接口契约变更 | 至少 30 天前通知 Netstars |
| 版本兼容 | 主 API 至少向后兼容 12 个月 |
| 事故响应 | P0: 15min；P1: 1h；P2: 4h |
| 月度对账 | 每月 5 日前提供上月结算汇总报告 |
| 安全事件通报 | 24h 内通知 Netstars 安全负责人 |
| 合规审计配合 | 应 Netstars 要求提供日志、流水、操作记录 |

---

## 13. 开放问题

| # | 问题 | 默认假设 | 待决策方 |
|---|------|---------|---------|
| WEA-Q1 | 部署位置（与 Netstars 同 region / 公网 / 专线）？ | 同 region + mTLS（Master D4） | Wea + Netstars 安全 |
| WEA-Q2 | 确认级别默认值（confirmed vs finalized）？ | confirmed（速度优先） | 产品 + 安全 |
| WEA-Q3 | 接收钱包补给频率？ | 余额低于阈值自动补；日终结算到冷 | Wea 财务 |
| WEA-Q4 | Phase 1 是否上 USDC 脱锚保护？ | 上（简单监控版） | 产品 + 安全 |
| WEA-Q5 | 是否支持"延迟广播"（如批量优化 gas）？ | v1 不支持 | 工程 |
| WEA-Q6 | 链上失败如何"退款"给客户？ | v1 无需退款（签名失败客户根本没花钱） | 产品 |

---

## 14. 参考资料

- [Master PRD](../prd.md)
- [netstars/x402/PRD.md](../netstars/x402/PRD.md) — wea 的唯一调用方
- [Solana JSON RPC](https://docs.solana.com/api/http) — 链上交互参考
- [USDC SPL Token](https://www.circle.com/usdc) — 资产规范
- Netstars × Wea Japan 既有 USDC 商户结算 PoC 经验（内部资料）
