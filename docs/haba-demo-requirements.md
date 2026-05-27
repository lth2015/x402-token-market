# HABA × Netstars AI Commerce Demo · 需求文档

> 文档作用：定义"为什么改造、改成什么、谁是观众、什么算完成"。
> 不写"怎么实现"——这部分见 [haba-technical-plan.md](./haba-technical-plan.md)。
>
> 三份姐妹文档的阅读顺序：
> 1. **haba-demo-requirements.md**（本篇）— 产品定位与边界
> 2. [haba-agent-design.md](./haba-agent-design.md) — Agent 行为与对话
> 3. [haba-technical-plan.md](./haba-technical-plan.md) — 数据结构、页面改造、实现步骤

最后更新：2026-05-27 · v0.8（**M1–M6 — HABA 站点真打 backend、Console 同步看到流水；端到端全程能跑**）

---

## 0. 4-actor 拓扑（本 demo 的根锚点）

整条 demo 链路只有 4 个相关方，所有故事和场景都从这里展开：

| 角色 | 在 demo 里的位置 | 部署形态 |
|------|----------------|---------|
| **HABA / ハーバー研究所** | 商户。**实际业务方**——经营 MARVIE 健康食品电商，购买并消耗 AI Token | **独立部署的 HABA 站点**（本次新增） |
| **Netstars** | x402 网关 + Token 网关。给 HABA 卖 Token、做 x402 协议封装 + 计费 | 仓库现有 `netstars/x402/` + `netstars/token/` |
| **WEA Japan** | x402 支付的链上执行方。从 Netstars 接受结算请求 → 在 Solana 上提交 USDC | 仓库现有 `wea/` |
| **Solana** | x402 链上执行所用公链（USDC SPL） | 外部公网（demo 用 mock RPC） |

**核心阅读规则**：本文/姐妹文档中所有提到"demo"，没有特别声明的，默认指的是**新建的 HABA 站点**——HABA 是商户，所以 demo 故事必须**从 HABA 视角讲完整商业闭环**，把另外 3 方在合适时机引入。

```
[ HABA AI Commerce ]  ──购买 AI Token──▶  [ Netstars Token Gateway ]
       (消费者 + B2B          x402 USDC                │
        分销入口)                                       │ 委托
       │                                                ▼
       │                                       [ WEA Japan Settlement ]
       │                                                │
       │                                                │ submit
       │                                                ▼
       │                                       [ Solana — USDC SPL ]
       │                                                │
       │  消耗 Token 调用 AI                            │ confirmed
       ▼                                                │
   Claude / GPT (Netstars 转售)  ◀── Token 入账 ───────┘
```

---

## 1. 当前 demo 现状分析

### 1.1 demo 的物理载体（修订版）

改造前仓库里"对外可演示"的载体只有两处，并且**都是 Netstars 视角**——没有任何代表 HABA 商户本身的页面：

| 载体 | 路径 | 形态 | 视角 | 本次怎么处理 |
|------|------|------|-----|------------|
| **经营层简报 deck** | `claude/presentation.html` | 1299 行静态 HTML，约 20 张幻灯片 | Netstars 经营层 | 沿用，把 §08 DEMO STORY 换成"HABA AI Advisor"叙事 + 加 4-actor 拓扑图 |
| **Token Console** | `netstars/token/console/` (Next.js 15) | 8 个 admin 页面 | Netstars 的商户（即 HABA） | 沿用，只改身份文案（subtitle / audit 操作人 / API Key 标签 = HABA 视角） |
| ➕ **HABA AI Commerce 站点** | `haba/` ← **本次新增** | 独立 Next.js 项目，独立 Dockerfile + compose service | HABA 商户视角（C 端消费者 + B2B 分销入口） | **新建** |

后端服务（`netstars/x402`、`netstars/token/api`、`wea`、`sdk/`）跑业务逻辑，**本次完全不动**。HABA 站点通过 SDK / HTTP 调用 Netstars 后端。

### 1.2 三个表面的职责边界

| 表面 | 谁来看 | 看到什么 | 不该看到 |
|------|------|---------|---------|
| **HABA 站点** | HABA 的消费者（C 端）+ B2B 合作方（药局/医院/营养师/合作电商）+ HABA 自身运营人员 | HABA 品牌 / MARVIE 商品 / AI Advisor 对话 / 购物车结账（含 x402 演示）/ B2B 调用入口 / Token Resale 套餐 | Netstars 内部 metrics、其他商户数据 |
| **Netstars Console** | HABA 的运营人员（HABA = Netstars 的商户） | Token 余额 / Usage / API Keys / 发票 / 审计——**HABA 作为 Netstars 商户**的后台视图 | C 端消费者操作页 |
| **presentation.html deck** | Netstars 经营层 + 潜在投资人 | "Netstars 怎么把 x402 + Token 打包成商户服务"的论证；HABA 是其中一个**已落地客户**举例 | demo 实际操作 UI（这些在 HABA 站点 / Console 里看） |

> Console 仍然是 Netstars 的产品；它的"商户"租户身份在本次 demo 里被绑定为 HABA，所以 subtitle / mock 操作人邮箱要换成 HABA。但 Console 自身不属于 HABA 站点。

### 1.3 当前 demo 的"商户场景"分布

抓出现存的所有"商户参考身份"，确认本次要替换的范围（**仅指 Netstars Console + deck 中现存的占位身份**，HABA 站点是全新建立）：

| 文件 | 行 | 现在写的 | 含义 |
|------|----|---------|------|
| `claude/presentation.html:761` | h2 | "跨境电商运营 Agent" | 整段 §08 DEMO STORY 的主线场景 |
| `claude/presentation.html:766–767` | lead | "不依赖任何特定客户、不涉及对外 PR" | 当前刻意做泛化的注释，本次要打破 |
| `claude/presentation.html:775` | step 1 | "为新上架的 50 个 SKU 生成中/英/日三语商品描述" | EC 任务示例 |
| `claude/presentation.html:851–855` | tx-ticker | "Claude Opus inference (SKU description, ja)" 等 | 实时 ticker 的业务描述 |
| `netstars/token/console/src/app/(console)/dashboard/page.tsx:33` | subtitle | `"Acme Co. · Production"` | 商户名占位 |
| `netstars/token/console/src/lib/mock.ts:143` | label | `"EC scrape worker"` | API key 名称 |
| `netstars/token/console/src/lib/mock.ts:254–258` | actor | `"yamada@acme.co.jp"`, `"finance@acme.co.jp"` | 审计日志里的操作人 |
| `sdk/examples/quickstart.py` | merchant_id | `mch_demo` | SDK 闭环 demo 的虚拟商户 ID |
| `proposal.md:8` | 段落 | 提到"羽田機場" + "明示不在后续体现" | 历史背景，保留 |

> **note**：仓库 memory `feedback-no-pr-exposure` 记录了"对外材料避免点名需 PR 审批的合作伙伴"。HABA 是本次的**客户委托方**，不是"对外讲故事时点名的合作伙伴"，定位不同——但本 demo 一旦被复用为 Netstars 销售材料给其他客户，HABA 元素必须再换回泛化形态，见 §7。

### 1.4 产品角色 vs 系统角色

§0 给的是**系统角色**（HABA / Netstars / WEA / Solana 4 个相关方）。HABA 站点内部还会出现**产品角色**——他们都是"HABA 商户的相关人"，不要和系统角色混：

- **HABA 的最终消费者 (consumer)** — 控糖人群等，跟 HABA AI Advisor 对话买 MARVIE 商品
- **HABA 的 B2B 合作方 (partner)** — 药局/医院/营养师/电商，付费**调用 HABA AI Advisor**（这是 HABA 自己的转售业务，**与 Netstars 的 Token 转售是上下游关系**）
- **HABA 运营人员** — 在 Netstars Console 看 Token 余额、调用量、发票

**关键认知**：HABA 也在做"转售"——HABA 用 Netstars 卖的 Token 组装出"HABA AI Advisor"，再把这个 Advisor 按调用次数卖给药局/医院。Token 在这条链上被消费两次：**Netstars → HABA → 药局/医院**。这是 demo 第二个核心叙事（第一个是 x402 支付本身）。

---

## 2. 目标 demo：HABA AI 健康食品电商

### 2.1 一句话定位

> HABA 在 Netstars 平台上用 x402 + USDC 买 AI Token，把自家的 AI 健康食品顾问 (HABA AI Advisor) 部署成 C 端商城 + B2B 转售接口，整条链路一个 demo 讲完。

### 2.2 商户信息（mock，本次新增）

| 字段 | 值 |
|------|---|
| 商户名 | HABA / ハーバー研究所 |
| 主营 | AI 化健康食品电商 |
| 主力商品线 | **MARVIE** Medical Foods 系列 |
| 商品大类 | 低卡甜味料（液体 / 粉末）、低卡果酱、低卡糖果、料理用替糖、营养补充 |
| 主目标用户（C 端） | 糖尿病/糖耐量异常人群、减脂人群、老年慢病护理家庭、孕产期需要控糖的人群 |
| 主目标用户（B 端） | 药局、医院营养指导科、独立营养师、健康食品垂直电商、企业团购 |
| 商户 ID（mock） | `mch_haba_001` |
| API Key 标签示例 | `Production AI Advisor`、`Pharmacy B2B Channel`、`Hospital Dietitian Bot`、`EC Partner — DRG Online` |

### 2.3 demo 必须呈现的 6 件事

| # | 主张 | 在 demo 里怎么看到 |
|---|------|-------------------|
| ① | HABA 用 AI 帮消费者**理解**健康食品 | C 端 Hero + 5 个真实需求 → Agent 推荐的对话流 |
| ② | Agent 推荐**有依据**，不只是话术 | 推荐结果带"为什么推荐"——卡路里、甜度、适用场景、医嘱兼容 |
| ③ | 消费者下单流程使用 **x402 + USDC** 支付 | 购物车 → 结算时显示"x402 微支付正在进行" → 8 步可视化 |
| ④ | HABA 的 AI 能力可以**转售**给 B2B 合作方 | 独立的 Token AI Resale 模块，4 个合作方画像 + 套餐定价 |
| ⑤ | 合作方使用的是**同一套 API**，按调用量计费 | B2B Partner 区块展示 API 嵌入示意 + Token 计费 |
| ⑥ | 整条流水在 Console 看得见 | Dashboard / Usage / Audit 数据切换为 HABA 视角 |

### 2.4 用户旅程概览（详细对话脚本见 [haba-agent-design.md](./haba-agent-design.md)）

**C 端旅程（消费者）**
1. 落地 HABA AI Commerce Hero → 看到"我有 5 种健康需求，AI 替你选商品"的入口
2. 选一个需求场景（或自由输入）→ Agent 给推荐 + 理由
3. 加入购物车 → 结算页显示 x402 支付步骤
4. 支付完成 → 订单详情 + Console 同步看到流水

**B 端旅程（药局 / 医院 / 营养师 / 合作电商）**
1. 从 Token AI Resale 区进入合作伙伴页
2. 选套餐（每月 N 万 Token）+ 查看 API/SDK 嵌入示例
3. 模拟一次"药局窗口顾问"调用 HABA AI Advisor 的对话
4. 看到自己的调用计入 HABA 的 Console（HABA 视角的子账户/项目）

**HABA 自身旅程（合作运营方）**
1. 在 Console 看到余额、消耗、按 SKU/按合作渠道的拆分
2. 看到 B2B 调用占比 vs C 端调用占比
3. Token 余额低时由 SDK 自发起 USDC 充值（演示链上）

---

## 3. x402 支付在 demo 里的位置

**核心原则**：x402 不是单独"看协议跑得动"的孤立 demo，而是**嵌入两个真实使用场景**。两个场景**都发生在 HABA 站点内**，但 4-actor 的角色分配不同：

### 3.1 场景 A — HABA 给自己的 AI Advisor 充 Token（**主线**）

**这是 x402 的标准用法，也是 4-actor 模型完整展开的场景。**

| 步骤 | HABA | Netstars | WEA | Solana |
|------|------|---------|-----|--------|
| ① | AI Advisor 调用余额低于阈值（剩 1,234 Token） | — | — | — |
| ② | SDK 自动发起 `purchase 10,000 AI Token` | 收到请求，返回 402 + 支付要求 | — | — |
| ③ | 用 HABA 钱包对 USDC tx 签名 | — | — | — |
| ④ | 把 signed tx 提交回 Netstars | 校验 + 转发 `/v1/settlements` | 接到结算请求 | — |
| ⑤ | — | — | submit USDC tx | 确认（<1s） |
| ⑥ | 看到 Token 入账 | 更新余额 + webhook | callback HABA + Netstars | — |

- 真实背后逻辑：调用 `sdk/quickstart.py` 的 DEV 模式，UI 上做 8 步动画
- demo 展示：HABA 站点内的"AI Token 管理"小部件 + 一个"自动充值动画"

### 3.2 场景 B — HABA 消费者购买 MARVIE 商品时支付（可选演示）

> **要点**：这条**不是 x402 标准用法**——消费者付的是商品款（日元 / 信用卡 / 也可以是 USDC），不是给 Netstars 买 Token。HABA 是收款方。

如果 demo 要演示"消费者也可以用 USDC 付 MARVIE 商品款"：
- 仍走 x402 协议、仍走 Netstars 网关、仍走 WEA → Solana
- 但 4-actor 里的"商户"是 HABA、"消费者"是终端用户、x402 收款方是 HABA 的钱包
- 这个场景**展示给"想做稳定币支付收款"的传统电商看**

**先做场景 A（必做），场景 B 标 P1**，避免观众一开始就把"Token 支付"和"商品支付"混在一起。

### 3.3 demo 必须强调的认知

- x402 / USDC / WEA / Solana 在 HABA 站点上**不是孤立的功能页**，而是**藏在 AI Token 充值流程背后**——消费者/B2B 调用方可以完全感知不到
- HABA 站点和 Netstars Console 都看得到这次充值（HABA 站点："Token 已到账"；Netstars Console："发票 + 流水"）
- 这正是 Netstars 在 deck §07 主张的"商户低理解成本接入"

---

## 4. Token AI 转售业务逻辑

### 4.1 商业故事

HABA 在 Netstars 平台买 AI Token、训练并组装出"HABA AI Advisor"，这个 Advisor 不只是给 HABA 自家电商用，**还可以打包成 API 卖给上游/同行**：

- **药局**：药局窗口接顾客咨询"我父亲糖尿病，想买代糖产品"，前台调用 HABA AI Advisor 推荐 MARVIE 系列商品，本店现货可售或代下单
- **医院**：营养指导科给慢病患者出"控糖饮食建议"时，调用 HABA AI Advisor 自动生成推荐方案 + 商品清单
- **营养师**：独立营养师 / 健身教练用 HABA AI Advisor 给客户出餐食建议
- **合作电商**：日用品垂直电商首页嵌入"AI 健康助手"小组件，技术后端就是 HABA AI Advisor

### 4.2 计费模式

HABA 把"AI Advisor 调用一次"打包成可计费单位（Token），按月套餐 + 按量超额：

| 套餐 | 月度 Token | 单 Token 价格 | 适用画像 | demo 文案 |
|------|----------|--------------|---------|-----------|
| **Starter** | 10,000 | ¥3.0 | 单店药局 / 独立营养师 | "够日均 200 次顾客咨询" |
| **Growth** | 100,000 | ¥2.4 | 中型药局连锁 / 私立医院 / 工作室级营养师团队 | "够 5–10 家门店共用" |
| **Enterprise** | 1,000,000+ | 议价 | 大型药局连锁 / 公立医院 / 合作电商首页嵌入 | "API + SLA + 数据回流报表" |

> 这些数字是 demo 假设，不是销售承诺；技术 plan 会把它放进 `tokenResalePlans` mock。

### 4.3 转售链路示意

```
Anthropic / OpenAI ──→ Netstars (AI Token 销售)
                            │
                            │  x402 + USDC 充值
                            ▼
                          HABA (买方 → 包装方)
                            │
                            │  HABA AI Advisor (API + SDK)
                            ▼
        ┌──────┬────────────┬──────────────┬──────────┐
       药局   医院         营养师          合作电商      ……
        │      │             │               │
        └──────┴──── 按调用量付费给 HABA ─────┘
```

Netstars 的角色：**底层 Token 供应 + x402 支付通道 + 计费/账单/对账系统**。HABA 的角色：**Domain know-how + AI Prompt 与商品库 + 转售关系**。

### 4.4 demo 必须让观众看出来的

- HABA 不是终端消费者，HABA 是个**二次组装者**——把 Netstars 的通用 AI Token 二次组装成"健康食品顾问"这一垂直能力
- 转售方（药局等）不需要自己跟 Anthropic/OpenAI 打交道，也不需要懂 x402
- Netstars 的真正卖点是：让"AI 能力转售"这种新业务形态可以**像加 Stripe 一样接入**

---

## 5. 页面改造目标（按 3 个部署表面拆分）

### 5.1 HABA 站点（新增，独立部署 — 本次主体工作）

新顶层目录 `haba/`，独立 Next.js 项目 + 独立 Dockerfile + 在 docker-compose 加 service。

| 区块 / 页面 | 内容 | 优先级 |
|-------------|------|-------|
| `/` HABA AI Commerce Hero | 品牌 + 5 个一键场景入口 + 简介 | P0 |
| Agent 对话演示区 | C 端 5 个旅程脚本可点开 | P0 |
| MARVIE 商品网格 | 5–8 个 SKU 卡片 + 推荐理由 | P0 |
| `/topup` 或 Hero 内嵌：AI Token 充值演示（**x402 场景 A**） | 8 步动画 + "HABA 自动充 10,000 Token"叙事 | P0 |
| `/resale` Token AI Resale | 3 套餐卡 + Token 转售链路示意（强调 HABA 转售给 B2B） | P0 |
| `/b2b` B2B Partner 区 | 4 个画像（药局/医院/营养师/合作电商）+ 各 1 段调用示例 | P0 |
| `/shop/cart` Mini Cart（**x402 场景 B**） | USDC 结账演示，可选 | P1 |
| 全局 Footer | "演示用途，非销售承诺" + 链接 Netstars Console | P0 |

### 5.2 Netstars Console（现有，仅身份文案微调）

`netstars/token/console/`——表明"这家商户租户=HABA"——但 Console 仍然是 Netstars 的产品。

| 改动 | 优先级 |
|------|-------|
| 所有页面 subtitle: "Acme Co. · Production" → "HABA · Production" | P1 |
| `mock.ts` audit 操作人 `yamada@acme.co.jp` → `ops@haba-rd.jp` 等 | P1 |
| `mock.ts` API Key label 换成 HABA 业务命名（Production AI Advisor / Pharmacy B2B Channel 等） | P1 |
| Sidebar 顶部品牌区可加"by Netstars"或保留原样 | P2 |

**特别注意**：Console 的 `/dashboard` 等不重塑成 C 端 commerce 页——那是 HABA 站点的事。

### 5.3 presentation.html（现有，叙事段落改写）

| 段落 | 改造 | 优先级 |
|------|------|-------|
| 加新段：4-actor 拓扑图 | §0 / §07 之前插入"HABA - Netstars - WEA - Solana"链路图 | P0 |
| §08 DEMO STORY | "跨境电商运营 Agent" → "HABA AI Advisor 自动充 Token + 服务消费者 + 转售 B2B" | P0 |
| §09 X402 IN MOTION ticker 文案 | EC 商品描述生成 → MARVIE 商品推荐 / B2B 嵌入 / HABA Token 充值 | P0 |
| 新增段："AI Token Resale 业务模式" | 套餐卡 + 转售链路图（与 HABA 站点 `/resale` 同源数据） | P1 |
| §11 Architecture 截图说明 | "Acme Co." → "HABA · Production" | P2 |

### 5.4 i18n / 文案规则

| 改动 | 优先级 |
|------|-------|
| HABA 站点：zh-CN 为主，UI label 上必要时双语（日文 / 英文） | P0 |
| Netstars Console：沿用现有 en/ja；不为本次专门加 zh-CN | P2 |
| presentation.html：保持中文 + 英文术语 | P0 |

> 详细文件 / 组件 / 路由 / 数据结构在 [haba-technical-plan.md](./haba-technical-plan.md) §1 给出。

---

## 6. 验收标准（demo 完成的定义）

观众（Netstars 经营层 / HABA 业务方 / 潜在投资人）打开 demo 页面，**不需要任何额外解释**，就能在 5 分钟内做到下面 7 件事的全部：

| # | 验收点 | 怎么算通过 |
|---|--------|----------|
| 1 | "这是谁的 demo" 一眼可读 | Hero 区有 HABA / ハーバー研究所 + MARVIE 品牌可视区域，无任何"跨境电商""Acme"等旧文案 |
| 2 | "AI 帮买什么" 立刻理解 | 5 个一键场景（控糖家人 / 替代砂糖 / 早餐果酱 / 药局推荐 / 营养师建议）至少 3 个能完整跑出推荐结果 |
| 3 | 推荐结果**有依据** | 每个推荐 SKU 卡显示"为什么推这款"——至少 3 个维度（卡路里、甜度、适用场景） |
| 4 | x402 不是说明，是看得到的流程 | 结算或充值场景至少 1 处展示 8 步动画或文字流；与现有 §09 风格一致 |
| 5 | Token AI Resale **是一个独立的产品板块**，不是脚注 | demo 上有一个明显标题段（"AI 能力转售 / Token Resale"），含套餐卡 + 转售链路示意 |
| 6 | B2B Partner 场景**至少 4 个画像** | 药局 / 医院 / 营养师 / 合作电商 4 张卡片，每张含一句话价值主张 + 一条对话示例 |
| 7 | demo 可正常运行 | `npm run dev` / `npm run build` 通过，TypeScript 无新增错误；`make up` 启动栈未被改造影响；presentation.html 在浏览器打开布局不破 |

### 6.1 同时要满足的非功能验收

- 文档（本文 + agent-design + technical-plan）与代码一致；任一处改了，三处都同步
- 商户身份只有"HABA"一个地方定义（`habaMerchant` mock，在 `haba/src/lib/haba/`），不允许散落硬编码
- mock 数据集中在 `haba/src/lib/haba/*`，HABA 站点的组件**完全在 `haba/` 项目内**，不污染 Netstars Console 代码
- HABA 站点和 Netstars Console **是两个独立可启动的 Next.js 应用**——port、Dockerfile、build 流程互不影响
- 文案中文为主；术语保留英文（x402 / stablecoin / AI Agent / Token Resale / USDC / Solana / API）
- UI 维持 [proposal.md §4.11](../proposal.md) 的"白底浅亮 + 不要赛博朋克"基调

---

## 7. 范围外（本次显式不做）

- 真链：仍走 mock RPC / DEV admin-confirm；Solana validator 在 Apple Silicon 跑不动的问题不在本次解决
- 后端协议改造：x402-api / token-api / wea-api 业务代码不动；只换 console 显示数据
- 真实 HABA 商品图：用 emoji / 占位图 + 文案；不引入图片资产
- 真实订单履约：下单是 mock，不会真的发货 / 出库
- 商品库 / 用户库存：MARVIE 商品列表硬编码 5–8 个 SKU，不接 PIM
- HABA 法务/品牌审批：若 demo 用作对外销售材料，要走 PR 流程换回泛化版（见 §1.2 note）。本 demo 默认按"对 HABA 内部 / 对 Netstars 内部"用途交付

---

## 8. 风险与对外披露注意事项

| 风险 | 应对 |
|------|------|
| 把"客户 demo" 当成"对外营销材料" | demo 页面底部加"本页面用于 HABA × Netstars 联合项目内部演示，对外披露需双方书面确认"小字提示 |
| MARVIE 商品价格 / 卡路里数字写错被截图 | 全部 mock 数据加 `// MOCK · NOT FOR PRICING REFERENCE` 注释 + UI 角落加"演示数据"水印 |
| 医疗暗示（"治糖尿病"） | Agent 对话脚本严格规避治疗 / 疗效话术；只说"低卡""适合控糖人群""请咨询医生" |
| Token Resale 套餐数字被误读为承诺价 | demo 上加"以上为演示套餐，正式价目以合同为准" |

---

## 9. 文档同步与版本

文档先行版（v0.1）落地后，编码每完成一个里程碑（参考 technical-plan §8 的实现步骤）都要更新本文的 §5 / §6 状态。文档→代码→文档构成闭环；任何 §6 验收项失败必须先改文档再补码，不允许文档与代码漂移。

下次更新：编码 milestone 1 完成后，回写 §5 改造目标的实际进度 + §6 验收项的实测结果。
