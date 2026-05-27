# X402 Token Market — Product Requirements Document (Master PRD)

> **项目代号**：X402 Token Market
> **战略定位**：把 X402 协议 + USDC 稳定币 + AI Token 销售打包成"商户可购买的 Agent Commerce 支付与 Token 运营服务包"
> **所有方**：Netstars Co., Ltd.（東証 5590） · Wea Japan 合作执行
> **文档版本**：v1.0  ·  **日期**：2026-05-26  ·  **状态**：Draft（待经营层与各模块负责人 review）
> **作者**：本 PRD 由 Claude（基于 [proposal.md](proposal.md) 与 [claude/presentation.html](claude/presentation.html) 中的经营层简报）生成
> **下一文档**：基于本 PRD 的架构设计 ARCHITECTURE.md（待编写）

---

## 0. 如何阅读本文档

本文档是项目的**单一真相来源（Single Source of Truth）**，按"上层抽象→下层细节"的顺序组织：

```
Master PRD（本文档）── 业务、需求、模块划分、概要设计
   ├─ sdk/PRD.md ─────────── 客户端接入层
   ├─ netstars/x402/PRD.md ── X402 网关
   ├─ netstars/token/PRD.md ─ Token 系统（账户/计费/控制台）
   └─ wea/PRD.md ──────────── 链上结算执行
```

- **经营层 / PM**：精读 §1–§5、§11–§13
- **架构师**：精读 §6–§10 + 各子模块 PRD
- **各模块开发负责人**：先读本文档 §6–§9，再读自己模块的 PRD

---

## 1. 愿景与战略目标

### 1.1 一句话定位
> Netstars 把 X402 + USDC + AI Token 三张牌打包成商户可签约购买的 **Agent Commerce 支付与运营服务**，
> 在 12–24 个月窗口期内成为日本及亚太 Agent 时代的支付基础设施入口。

### 1.2 战略目标（按优先级）

| # | 目标 | 衡量 |
|---|------|------|
| G1 | 形成 4 层服务包（接入 / 支付 / 运营 / 结算）的端到端可演示能力 | Demo 跑通完整业务闭环 |
| G2 | 验证商户接入门槛：3 行代码完成首次 Token 购买与 AI 调用 | 试点商户 onboarding ≤ 1 工作日 |
| G3 | 形成可对外发布的灯塔客户案例 | 3–6 个月内 ≥ 3 个 |
| G4 | 沉淀可独立销售的商业模块（Token 销售、网关费、SaaS、结算增值） | 4 个收入流均有真实计费记录 |
| G5 | 保留未来"X402 → Token 系统"合并演进路径 | 接口/数据模型解耦达标 |

### 1.3 非目标（v1 不追求）

- ❌ 自建公链或私链
- ❌ 自营钱包托管（私钥永远不离开客户端）
- ❌ 加密资产投资 / 理财产品
- ❌ 面向 C 端散户的支付产品（仅 B2B / Agent-to-Service）
- ❌ 多链并发支持（v1 仅 Solana，多链放 Phase 4）

---

## 2. 业务背景

### 2.1 触发因素（Why Now）
节选自 [claude/presentation.html](claude/presentation.html) Slide 04：

1. **协议层收敛**：Coinbase 主导发布 x402，Anthropic Claude Agent SDK 推荐采用，Google AP2 spec 兼容
2. **AI 供给已就位**：Anthropic / OpenAI / xAI / Google 已授权 Netstars 在日本销售 AI Token
3. **链上通路验证完成**：Netstars × Wea Japan 已联合完成 USDC 商户结算 PoC（端到端通路成熟）
4. **需求端拉力**：日本大企业生成式 AI 采用率 1 年内从 ~24% → ~50%（METI 2024）

→ 四个条件同时具备的窗口期预估 **12–24 个月**。

### 2.2 我们独占的竞争位置
"链上结算能力 × 日本合规与 AI 商务能力"四象限的右上角（详见 PPT Slide 07）：

- vs Coinbase Commerce / Crossmint：缺日本合规与 AI 商务授权
- vs Stripe / PayPay：缺链上稳定币原生能力
- vs 企业自建：三栈合一需 18–24 个月，错过窗口

护城河 = 日本金融牌照 + 大型 AI 公司授权 + 链上 PoC 实绩，三者叠加形成。

### 2.3 来源资产清单（已有）

| 资产 | 状态 | 模块归属 |
|------|------|---------|
| Netstars Web2 聚合支付能力（持牌） | ✅ 已有 | （平台基础设施，不在 v1 重写） |
| Netstars Token 系统（计费/账本） | 🆕 **全量重写**（v1.1 决策；不复用既有代码） | netstars/token |
| Wea Japan Solana 链上执行能力 | ✅ PoC 完成 | wea |
| Anthropic/OpenAI/xAI/Google 销售授权 | ✅ 商务合同已签 | netstars/token |
| X402 协议规范（Coinbase 开源） | ✅ 公开标准 | netstars/x402 |

---

## 3. 目标用户与场景（Personas & Scenarios）

### 3.1 三个核心 Persona

#### P1 · 商户经营决策者（IT 部门负责人 / CTO / CFO）
- **痛点**：分散购买 AI 服务（4–6 个账号）、对账困难、找不到日元发票、对加密支付有合规顾虑
- **决策因素**：合规背书、统一对账、可审计、上市公司信任感
- **接触点**：销售签约、商务沟通、Console 报表、月度发票

#### P2 · 商户技术接入方（应用开发者 / Agent 工程师）
- **痛点**：现有 AI SDK 各家不同，自建计费系统成本高，钱包/签名/链上调用是新世界
- **决策因素**：SDK 易用性、文档质量、错误信息可读、3 行代码能跑
- **接触点**：开发者门户、SDK / API / MCP、Slack 支持

#### P3 · 终端 AI Agent（机器用户）
- **痛点**：传统支付需要人工确认无法自治；多次小额调用累积成本不可控
- **"决策因素"**：HTTP 原生、可机器解析的 402 响应、即时余额查询、可程序化设置阈值
- **接触点**：MCP 工具、X402 协议响应、SDK 同步/异步 API

### 3.2 黄金路径场景：跨境电商运营 Agent
（与 PPT Slide 08 对齐，**通用化场景，不点名任何特定客户**）

> 某跨境电商公司的运营 Agent 接到任务：「今晚 23 点前为新上架的 50 个 SKU 生成中/英/日三语商品描述，结合昨日竞品价格给出明日定价建议，并自动同步至 EC 平台。」
>
> 1. Agent 自检 Token 余额不足（50 SKU × 3 语言 × N 次润色 ≈ 8000+ Token）
> 2. Agent 调用 SDK 发起购买 → X402 Gateway 返回 402 + 支付要求
> 3. Agent 签名 → Wea 在 Solana 上执行 USDC 转账（<1 秒确认）
> 4. Token 系统更新余额 → 通知 Agent 继续
> 5. Agent 调用 Claude / GPT 完成任务，每次实时扣减 + 写流水
> 6. 商户在 Console 看到：支付成功 / 余额 / 任务结果 / 账单 / 链上凭证

### 3.3 反向场景（必须覆盖）

| 反向场景 | 预期行为 |
|---------|---------|
| 支付超时 / 链上失败 | 订单标记 failed，余额不变，自动重试（可配置），通知 Agent |
| Token 在调用过程中耗尽 | 调用前预检 + 调用中断点恢复，避免"半付费"消耗 |
| Agent API Key 泄露 | Console 一键吊销 + 异常消耗模式自动冻结 |
| USDC 脱锚 / 链拥堵 | 自动暂停新支付 + 告警通知 + 切换 RPC 节点 |
| 商户主动停用 | 余额可结算回链上钱包 + 数据按合规要求保留 |

---

## 4. 核心服务包定义（What We Sell）

商户购买的是**完整服务包**，不是协议本身。四层结构：

```
┌──────────────────────────────────────────────────────────┐
│  Layer 4: SETTLEMENT  · 结算层                             │
│    日元/USDC 双账本 · 对账 · 发票 · 合规报表                │
├──────────────────────────────────────────────────────────┤
│  Layer 3: OPERATIONS · 运营层                              │
│    Token 余额/消耗 · 套餐 · 告警 · 子账户 · Console         │
├──────────────────────────────────────────────────────────┤
│  Layer 2: PAYMENT    · 支付层                              │
│    X402 Gateway · USDC 结算 · Wea 链上执行                 │
├──────────────────────────────────────────────────────────┤
│  Layer 1: ACCESS     · 接入层                              │
│    SDK (Python/Node) · REST API · MCP 接口                │
└──────────────────────────────────────────────────────────┘
```

### 4.1 与四个收入流的映射

| 服务层 | 对应收入流 | 计费方式 |
|--------|-----------|---------|
| Layer 1 接入 | （包含在套餐内，引流） | 免费 |
| Layer 2 支付 | **网关服务费** | 每笔支付按比例或固定费率 |
| Layer 3 运营 | **Token 销售毛利** + **SaaS / 管理费** | Token 转售差价 + 月度套餐 |
| Layer 4 结算 | **结算与对账增值服务** | 大客户按需购买（高客单价） |

---

## 5. 功能性需求（Functional Requirements）

### 5.1 顶层用户故事（按 Persona 分组）

#### 商户经营层（P1）
- **FR-P1.1** 作为 CFO，我希望每月收到一张包含所有 AI 用量的日元发票，并能下载明细
- **FR-P1.2** 作为 CFO，我希望每笔支付都有链上凭证可供审计抽查
- **FR-P1.3** 作为经营者，我希望能为每个团队/项目设置消耗上限，避免失控
- **FR-P1.4** 作为合规负责人，我希望能导出 90 天内的所有操作日志

#### 商户技术接入（P2）
- **FR-P2.1** 作为开发者，我希望 5 分钟内完成 SDK 安装 + API Key 配置 + 首次充值
- **FR-P2.2** 作为开发者，我希望用同一个 SDK 调用 Claude / GPT / Grok / Gemini，统一接口
- **FR-P2.3** 作为开发者，我希望 SDK 自动处理 401/402/429/网络错误，业务代码不用关心
- **FR-P2.4** 作为开发者，我希望本地 dev 环境可以用测试网 USDC 反复试错（不花真钱）
- **FR-P2.5** 作为开发者，我希望能在 Console 看到 API 调用日志，便于排查

#### 终端 Agent（P3）
- **FR-P3.1** 作为 Agent，我希望通过 MCP 接口能"自我发现"可用 Token 类型、价格、余额
- **FR-P3.2** 作为 Agent，我希望调用收到 402 时能自动支付重试，无需人工
- **FR-P3.3** 作为 Agent，我希望能查询自己单位时间消耗，主动控制速率
- **FR-P3.4** 作为 Agent，我希望支付状态变化能通过 webhook 推送，不必轮询

### 5.2 平台运营（Netstars 内部 P4）
- **FR-P4.1** 内部运营能查看所有商户/Agent 的实时消耗与异常告警
- **FR-P4.2** 内部能配置 Token 套餐、定价、折扣、灰度
- **FR-P4.3** 内部能查询任意订单/支付的全链路追踪（从 API 请求到链上 TX 到 Token 入账）
- **FR-P4.4** 内部能一键冻结/解冻商户账号、Agent Key

### 5.3 需求优先级（MoSCoW）

| 优先级 | 范围 | 交付阶段 |
|--------|------|---------|
| **Must Have** | FR-P2.1–P2.4, FR-P3.1–P3.2, FR-P4.3, Token 余额/扣减/查询/发票基础, X402 支付闭环, 链上结算与回调 | Phase 1 (Demo) |
| **Should Have** | FR-P1.1–P1.4, FR-P2.5, FR-P3.3–P3.4, FR-P4.1–P4.2, FR-P4.4, 多模型路由, Console 管理界面 | Phase 2 (试点) |
| **Could Have** | 子账户多租户, 自动充值阈值, 自定义报表导出, 跨语言 SDK（Java/Go） | Phase 3 (产品化) |
| **Won't Have (v1)** | 跨链支持, 多稳定币, 法币入金通道, 自营钱包 | Phase 4+ |

---

## 6. 非功能性需求（Non-Functional Requirements）

### 6.1 安全
- **NFR-SEC-1** 所有外部通信强制 TLS 1.3
- **NFR-SEC-2** API 鉴权：API Key + HMAC-SHA256 签名（请求体 + 时间戳 + nonce）；时间戳偏移 > 5 分钟拒绝
- **NFR-SEC-3** 私钥**绝不**存储于 Netstars / Wea 任何服务端；签名一律在客户端完成
- **NFR-SEC-4** 支付订单具备幂等性（idempotency key），同一 key 重复提交不重复扣款
- **NFR-SEC-5** 所有写操作记录审计日志（actor / action / resource / before / after / timestamp），日志不可篡改（append-only）

### 6.2 合规
- **NFR-COMP-1** 数据存储默认 region: 日本国内（東京 / 大阪 双 AZ）
- **NFR-COMP-2** 个人信息按日本个人情報保護法处理，可应用户请求导出与删除
- **NFR-COMP-3** 加密资产相关行为由 Wea Japan 作为执行主体承担，Netstars 保持 Web2 PSP 边界（**合规分层关键设计**）
- **NFR-COMP-4** 所有支付/结算记录保留 7 年（金融业法要求）

### 6.3 性能（SLO 目标）

| 指标 | Phase 1 | Phase 3 |
|------|---------|---------|
| X402 API p99 延迟 | < 500ms | < 200ms |
| Token 余额查询 p99 | < 100ms | < 50ms |
| 支付端到端（从 API 调用到 Token 入账） p95 | < 5s | < 3s |
| 单网关并发支付吞吐 | 50 TPS | 500 TPS |
| Token API 月可用性 | 99.5% | 99.9% |
| 链上 TX 确认（Solana 决定） | <1s | <1s |

### 6.4 可观测性
- **NFR-OBS-1** 全链路 trace ID 贯穿：客户端 → SDK → X402 Gateway → Token 系统 → Wea → 链上
- **NFR-OBS-2** 关键业务指标实时上报 metrics（订单数 / 成功率 / 平均延迟 / Token 消耗速率）
- **NFR-OBS-3** 异常自动告警到 Slack / PagerDuty（Sev 1/2 区分）
- **NFR-OBS-4** 客户侧可查询自己请求的 trace（透明度 + 排障）

### 6.5 可扩展性
- **NFR-SCALE-1** 各模块独立部署、独立水平扩展；模块间通过 well-defined API 通信，不共享数据库
- **NFR-SCALE-2** Token 账本设计需考虑未来分库分表（按 merchant_id 哈希）
- **NFR-SCALE-3** X402 Gateway 设计为无状态，可任意水平扩展

### 6.6 容灾与韧性
- **NFR-DR-1** RPO ≤ 5 分钟（支付/账本数据） · RTO ≤ 30 分钟
- **NFR-DR-2** 多 Solana RPC 节点冗余，主节点失败自动切换
- **NFR-DR-3** USDC 脱锚监测，超阈值自动暂停新支付并告警
- **NFR-DR-4** 关键依赖（Wea / AI Provider）失败时降级策略明确（在各子模块 PRD 中具体定义）

### 6.7 国际化与本地化
- **NFR-I18N-1** Console UI v1 支持日 / 英两种语言（中文 Phase 3 加）
- **NFR-I18N-2** 错误信息支持 i18n（按 Accept-Language）
- **NFR-I18N-3** 文档（developer docs）v1 全英文（开发者通行语言）+ 日文版作为 Phase 2

---

## 7. 模块划分与边界（概要设计）

### 7.1 模块拓扑

```
                              ┌──────────────────────┐
                              │   Merchant / Agent    │
                              │   (Customer)          │
                              └──────┬───────────────┘
                                     │
                                     ▼  (Layer 1: ACCESS)
                       ┌───────────────────────────────┐
                       │  sdk/                         │
                       │  ─ Python SDK / Node SDK      │
                       │  ─ MCP Interface              │
                       │  ─ REST API client            │
                       └─────────┬─────────────────────┘
                                 │ HTTPS + HMAC
                                 ▼
        ┌────────────────────────┴─────────────────────────┐
        ▼  (Layer 2: PAYMENT)              (Layer 3: OPS)  ▼
┌─────────────────────┐   ┌──────────────────────────────────┐
│  netstars/x402/     │◄──┤  netstars/token/                  │
│  ─ 402 challenge    │   │  ─ Ledger (balance/credit/debit)  │
│  ─ Payment verify   │   │  ─ Pricing engine                 │
│  ─ Order/idempotency│   │  ─ Merchant Console (UI)          │
│  ─ Webhook delivery │   │  ─ Invoice & Billing              │
└─────────┬───────────┘   │  ─ AI Provider routing            │
          │               └────────────────┬─────────────────┘
          │ Settlement                     │ AI calls
          ▼  Request                       ▼
  ┌─────────────────┐         ┌──────────────────────────┐
  │  wea/           │         │  AI Providers (External) │
  │  ─ Solana RPC   │         │  ─ Claude / GPT          │
  │  ─ USDC transfer│         │  ─ Grok / Gemini         │
  │  ─ TX confirm   │         └──────────────────────────┘
  │  ─ Callback     │
  └────────┬────────┘   (Layer 4: SETTLEMENT)
           │
           ▼
  ┌─────────────────┐
  │  Solana Network │
  │  ─ USDC (SPL)   │
  └─────────────────┘
```

### 7.2 各模块职责矩阵

| 模块 | 拥有什么 | 不做什么 | 部署形态 |
|------|---------|---------|---------|
| **sdk/** | 客户端封装、签名、重试、错误处理、MCP 协议适配 | 不持有任何业务状态 / 不调用链 | Library: pip / npm 包 |
| **netstars/x402/** | X402 协议实现、402 应答、支付证明校验、订单幂等、Webhook | 不持有余额 / 不直接调用链 | Service: 独立服务 |
| **netstars/token/** | Token 账本、计费、套餐、发票、Console、AI Provider 路由 | 不实现 X402 协议细节 / 不直接调用链 | Service + Web App |
| **wea/** | Solana RPC、USDC 转账、TX 确认轮询、结果回调 | 不持有商户/Agent 信息（只认 payment_id + amount） | Service: 独立服务 |

### 7.3 关键边界设计原则

1. **数据库不共享**：每个模块拥有自己的数据库，通过 API 交互（避免数据库耦合）
2. **接口稳定**：模块间 API 一旦发布，向后兼容至少 12 个月
3. **可独立部署**：每个模块拥有自己的 `.github/workflows/`，独立 CI/CD，独立版本号
4. **可独立替换**：理论上 Wea 可被换成其他链上执行方而不影响其他模块
5. **未来合并路径**：X402 → Token 系统的合并通过保持二者数据模型兼容预先准备（详见 §10.3）

### 7.4 跨模块通信约定

| 通信方向 | 协议 | 鉴权 | 时序 |
|---------|------|------|------|
| Client → SDK | 进程内调用 | N/A | 同步 |
| SDK → X402 Gateway | HTTPS (REST) | API Key + HMAC | 同步 |
| SDK → Token API | HTTPS (REST) | API Key + HMAC | 同步 |
| X402 ↔ Token | 内部 HTTPS / gRPC | mTLS + 服务身份 | 同步 |
| X402 → Wea | HTTPS (REST) | mTLS + 共享密钥 | 异步（payment_id） |
| Wea → X402 | Webhook (HTTPS) | HMAC 回调签名 | 异步推送 |
| X402 → SDK 客户端 | Webhook | HMAC 回调签名 | 异步推送 |

---

## 8. 关键业务流程（时序图）

### 8.1 主流程：Agent 购买 Token 并消费

```
Agent     SDK      X402-GW    Token-Sys    Wea         Solana    AI-Provider
 │         │         │           │          │            │            │
 │ call    │         │           │          │            │            │
 ├────────►│         │           │          │            │            │
 │         │ check balance       │          │            │            │
 │         ├──────────────────► │          │            │            │
 │         │         │           │          │            │            │
 │         │ ◄────────────── (insufficient) │            │            │
 │         │                                │            │            │
 │         │ create payment_intent          │            │            │
 │         ├──────► │           │           │            │            │
 │         │        │ create order + idempotency         │            │
 │         │        ├──────────► (record)   │            │            │
 │         │        │           │           │            │            │
 │         │ ◄── 402 + payment_required     │            │            │
 │         │                                │            │            │
 │         │ sign tx locally   │           │            │            │
 │         ├──────► │           │           │            │            │
 │         │        │ verify signature      │            │            │
 │         │        │ forward to wea        │            │            │
 │         │        ├────────────────────► │            │            │
 │         │        │           │          │ submit USDC│            │
 │         │        │           │          ├──────────► │            │
 │         │        │           │          │            │ confirm    │
 │         │        │           │          │ ◄──────────┤            │
 │         │        │           │          │ callback   │            │
 │         │        │ ◄────────────────────┤            │            │
 │         │        │ verify TX │          │            │            │
 │         │        ├──────────► credit token            │            │
 │         │        │           ├── update ledger ─►    │            │
 │         │        │ ◄──────── │           │            │            │
 │         │ ◄── 200 + token_credited       │            │            │
 │         │ webhook │           │          │            │            │
 │ ◄───────┤         │           │          │            │            │
 │         │ now call AI       │           │            │            │
 │         ├──────────────────────────────────────────► │            │
 │         │         │           │          │            │ generate   │
 │         │ ◄───────────────────────── meter consume    │            │
 │         │         │ debit token         │            │            │
 │         │         ├──────────► update ledger          │            │
 │         │         │           ├── write usage record ─│            │
 │ ◄───────┤ result  │           │          │            │            │
```

### 8.2 异常路径
（详见 [netstars/x402/PRD.md](netstars/x402/PRD.md) §5 与 [wea/PRD.md](wea/PRD.md) §4）

- **链上失败**：Wea 检测 → 回调 X402（status=failed）→ X402 释放订单 → 通知 SDK
- **链上超时**：30s 未确认 → Wea 重新查询 → 仍未确认则后台 worker 持续追踪 + 标记 pending
- **Token 入账失败但链上成功**：人工对账接口 + 自动 reconciliation 任务（每小时）

### 8.3 对账流程（Settlement Reconciliation）

每日 00:00 JST 触发：
1. Wea 导出当日所有链上 USDC 收款 TX
2. X402 导出当日所有支付订单
3. Token 系统导出当日所有 credit 流水
4. 三方 join 比对，差异 > 0 触发告警并人工介入

---

## 9. 数据模型概念（核心实体关系）

完整字段见各子模块 PRD。这里只列**跨模块共享**的核心实体：

```
Merchant ─┬─< AgentKey ─< Request ─┬─< PaymentOrder ─< OnChainTx
          │                        │
          ├─< Project              └─< TokenLedgerEntry ─< Invoice
          │
          └─< SettlementAccount
```

### 9.1 跨模块 ID 约定

| ID | 由谁生成 | 格式 | 示例 |
|----|---------|------|------|
| `merchant_id` | Token 系统 | `mch_` + ULID | `mch_01HXY...` |
| `agent_key_id` | Token 系统 | `agk_` + ULID | `agk_01HXY...` |
| `payment_order_id` | X402 Gateway | `pmt_` + ULID | `pmt_01HXY...` |
| `tx_hash` | Solana | base58 | `5KJp...` |
| `ledger_entry_id` | Token 系统 | `led_` + ULID | `led_01HXY...` |
| `invoice_id` | Token 系统 | `inv_` + YYYYMM + seq | `inv_202605_00001` |
| `trace_id` | SDK 或 Gateway | W3C TraceContext | `00-...` |

**幂等键**：所有写操作支持客户端 idempotency_key（最长 64 字符），24 小时内重复返回原结果。

---

## 10. 分阶段交付（Roadmap）

### 10.1 Phase 1（0–3 个月）· Demo MVP
**目标**：完整跑通跨境电商运营 Agent 场景的端到端闭环

| 模块 | 交付 |
|------|------|
| sdk | Python SDK MVP（Token 余额/购买/AI 调用基础接口） |
| x402 | X402 Gateway 核心（402 应答、订单、幂等、Webhook） |
| token | 账本 + 余额查询 + 单 Provider（Claude） + 基础 Console（只读） |
| wea | Solana Devnet USDC 转账 + 确认 + 回调 |
| 整体 | Docker Compose 一键启动；演示视频；接入文档 |

**验收**：可在内部 demo 中完整复现 §3.2 场景，包含一次失败路径

### 10.2 Phase 2（3–6 个月）· 灯塔商户试点
| 模块 | 交付 |
|------|------|
| sdk | Node.js SDK + MCP 接口 v1 + 错误处理完善 |
| x402 | 主网切换 + 性能优化（达到 Phase 1 SLO） + 异常告警 |
| token | 多 Provider 路由（Claude/GPT/Grok/Gemini）+ 发票 v1 + 子账户 |
| wea | 多 RPC 冗余 + 失败重试 + 对账接口 |
| 整体 | 3–5 家灯塔商户接入；案例素材产出 |

### 10.3 Phase 3（6–12 个月）· 产品化与合并准备
- Console SaaS 套餐上线（运营层正式收费）
- MCP 接口公开发布到 Anthropic / OpenAI 工具市场
- **X402 → Token 系统的合并完成**（统一商户账本与订单流水）
- 企业级 SLA + 合规审计报告
- 国际化（英语文档 + 海外开发者门户）

### 10.4 Phase 4（12 个月+）· 生态扩张
- 多稳定币（USDT, JPYC）
- 跨链（Base, Ethereum L2）
- 跨产品计费复用（SaaS 订阅、云资源、数据 API）
- 亚太节点

### 10.5 阶段依赖图

```
sdk ─────────────► (Phase 1 阻塞所有其他模块的 Demo)
                          │
x402 ─────────► token ─► Phase 1 Demo ─► Phase 2 试点 ─► Phase 3 产品化
                ▲
wea ────────────┘
```

---

## 11. 成功指标（Success Metrics）

### 11.1 North Star Metric
**月度通过 X402 完成的 Agent 自主支付笔数（Monthly Agent-Initiated Payments）**

理由：这个指标同时反映 ① 商户接入数 ② Agent 自治程度 ③ 协议占用率，且与四个收入流均正相关。

### 11.2 阶段目标值

| 指标 | Phase 1 (M3) | Phase 2 (M6) | Phase 3 (M12) |
|------|-------------|--------------|---------------|
| 月度 Agent 支付笔数 | 100（Demo） | 10,000 | 1,000,000 |
| 付费商户数 | 0（试点免费） | 3–5（灯塔） | 100+ |
| 月度 Token 销售额 | ≤ ¥1M | ¥10M | ¥100M |
| API 可用性 | 99% | 99.5% | 99.9% |
| 首次接入耗时（onboarding） | ≤ 3 天 | ≤ 1 天 | ≤ 1 小时 |

---

## 12. 风险与依赖

### 12.1 外部依赖
| 依赖 | 影响 | 应对 |
|------|------|------|
| Solana 网络稳定性 | 链上结算延迟 | 多 RPC + Solana 主网历史 SLA 监控 |
| USDC 锚定 | 资金安全 | 实时锚定监控 + 自动暂停机制 |
| AI Provider API 可用性 | 业务调用失败 | 多 Provider 路由 + 失败降级 |
| 日本金融厅监管变化 | 合规风险 | 法务前置审阅 + 与监管保持沟通 |

### 12.2 内部依赖（团队 / 资源）
- Token 系统已有部分需评估改造工作量（→ 详见 [netstars/token/PRD.md](netstars/token/PRD.md) §9）
- Wea Japan 协作节奏（每周同步会）
- 日本本地法务对每个新功能的审阅周期（预估 2 周）

### 12.3 主要风险（已在 PPT Slide 15 阐述）
1. 合规与监管演进
2. 链上风险与客户损失
3. 商户教育成本

---

## 13. 关键决策与未决问题（DECISIONS）

### 13.1 ✅ 已决策（v1.1 · 2026-05-26）

| # | 决策项 | 最终选择 | 备注 |
|---|--------|---------|------|
| **D1** | SDK 语言交付顺序 | Phase 1 **仅 Python**；Phase 2 加 Node.js | 工作量 −30%，加快 Demo |
| **D2** | 商户 / Agent 鉴权方案 | **API Key + HMAC-SHA256**；DID 放 Phase 3+ | 与 Stripe / Anthropic 风格对齐 |
| **D6** | Console 部署归属 | **Token 子模块**（同代码库，独立部署） | 简化团队边界 |
| **D7** | Phase 1 MCP 接口 | **不交付**；Phase 1 仅 REST API；Console **仅只读** | 资源集中在后端闭环 |
| **TOK-Q1** | 既有 Token 系统处理 | **全量重写**为新 Token 系统 | 不与既有代码耦合，但需对接既有发票 / 财务系统 |

### 13.2 ✅ 已决策（v1.2 · 2026-05-26）

| # | 决策项 | 最终选择 |
|---|--------|---------|
| **D8** | 数据库选型 | **Aurora MySQL 8.0 兼容**（AWS RDS）；事件流 v1 不引入，Phase 2 评估 SQS/Kafka |
| **ENV** | 部署环境数 | **单一 QA 环境**（本地 dev 用 docker-compose；prod 等业务决定再开）|
| **IAC** | IaC 工具 | **不用 Terraform**；只手写 K8s YAML（团队未用过 Terraform，避免新增工具学习成本）|

### 13.3 ⏳ 待决策

| # | 决策项 | 默认假设 | 影响 | 待决策方 |
|---|--------|---------|------|---------|
| **D3** | Token 定价模型 | 套餐（Trial / Growth / Enterprise）+ 按量；模型间统一汇率换算 | Token 计费引擎复杂度 | 商务 + 财务 |
| **D4** | Wea 服务的部署位置 | Netstars 内部网络（同 region）+ mTLS | 数据传输延迟与合规审计 | Wea Japan + Netstars 安全 |
| **D5** | 失败支付的 Token 处理 | 严格"先支付确认、再 credit"，永不"乐观 credit" | 用户体验（多 1 个网络 RT） | 产品 + 安全 |

---

## 14. 显式排除（Explicit Out of Scope）

为避免 scope creep，明确**本 PRD 不包含**：

- 客户侧 Agent 实现（仅在 Demo 中模拟）
- 客户钱包托管 / KYC 流程
- 法币（日元）入金通道（v1 商户用既有银行 → Netstars 已有 Web2 PSP 通道）
- 跨境合规（仅日本 v1）
- 自研区块链或 Layer 2
- AI 模型本身的能力与定价谈判（由商务团队负责，仅在 Token 系统内反映结果）

---

## 15. 文档版本与协作约定

- 本 PRD 与各子模块 PRD 使用 Markdown，存放于 Git 仓库
- 每次变更需通过 PR review；重大变更（影响接口或交付时间）需经营层 sign-off
- 各模块 PRD 引用本文档（Master）作为权威，本文档若与子模块 PRD 冲突，以本文档为准
- 后续衍生文档：
  - `ARCHITECTURE.md`（技术架构设计）
  - `<module>/DESIGN.md`（模块详细设计）
  - `<module>/API.md`（接口契约）
  - `<module>/RUNBOOK.md`（运维手册）

---

## 16. 参考资料

- [proposal.md](proposal.md) — 项目原始提案（业务背景与边界）
- [claude/presentation.html](claude/presentation.html) — 经营层简报（市场分析、商业逻辑、GTM）
- [Coinbase x402 Protocol](https://github.com/coinbase/x402) — 协议规范
- [Anthropic Claude Agent SDK 文档](https://docs.anthropic.com) — Agent 支付集成参考
- Google AP2 Agent Payments Protocol — 兼容性参考

---

> **下一步**：经营层 review § 1–5、§13 后即可启动各模块的 Architecture Spec 设计。
> 建议优先评审 § 13 的 8 项决策；它们的最终选择会显著影响下一阶段的工作量与时间表。
