# HABA Demo · 技术实现方案

> 文档作用：把 [haba-demo-requirements.md](./haba-demo-requirements.md) 的产品诉求 + [haba-agent-design.md](./haba-agent-design.md) 的对话设计，落到具体的"改哪几个文件、加哪几个组件、按什么顺序做"。
>
> 前置阅读：先读 requirements 再读 agent-design。

最后更新：2026-05-27 · v0.8（**M1–M6 全部完成；HABA → Netstars 后端真接通，全程能跑**）

---

## 0. 改造前后总览（修订版 — HABA 是独立部署）

按 [requirements §0](./haba-demo-requirements.md#0-4-actor-拓扑本-demo-的根锚点) 的 4-actor 拓扑，HABA 是商户、Netstars 是网关——所以 HABA 站点必须是**独立顶层项目**，跟 `netstars/`、`wea/`、`sdk/` 平级，**绝不放进 `netstars/token/console/` 内部**。

```
改造前 (3 个顶层项目)                改造后 (4 个顶层项目)
─────────────────────                ─────────────────────
sdk/         (Netstars SDK)          sdk/                                ◄ 不动
netstars/    (x402 + token + console) netstars/                          ◄ 仅改 console 身份文案
wea/         (settlement)            wea/                                ◄ 不动
claude/      (presentation.html)     claude/                             ◄ presentation.html 叙事改写
                                     haba/        ◄ 新增：HABA 独立站点（Next.js + Docker + compose service）
```

### 0.1 HABA 站点目录树（顶层 `haba/` — 全新建）

```
haba/
├── package.json                      Next.js 15 + React 19（与 console 同栈，方便共享工具链）
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── Dockerfile                        多阶段 build → standalone output
├── README.md
├── messages/
│   ├── zh-CN.json                    主语言
│   ├── ja.json                       次（HABA 日本品牌方便切换）
│   └── en.json                       兜底
└── src/
    ├── app/
    │   ├── layout.tsx                根布局（含 i18n provider）
    │   ├── page.tsx                  ★ HABA AI Commerce Hero 主页
    │   ├── globals.css
    │   ├── topup/page.tsx            HABA 给自己充 AI Token（x402 场景 A）
    │   ├── resale/page.tsx           Token AI Resale 商业页
    │   ├── b2b/page.tsx              B2B Partner 区
    │   ├── shop/                     可选：商品深页 + 购物车
    │   │   ├── [productId]/page.tsx
    │   │   └── cart/page.tsx         x402 场景 B（消费者下单）
    │   └── api/
    │       └── netstars-proxy/       同源代理 Netstars Token API（避 CORS）
    │           └── route.ts
    ├── components/
    │   ├── layout/
    │   │   ├── HabaTopBar.tsx
    │   │   ├── HabaFooter.tsx
    │   │   └── FourActorRibbon.tsx   demo 顶部"HABA → Netstars → WEA → Solana"小条
    │   ├── hero/
    │   │   └── HabaHero.tsx
    │   ├── agent/
    │   │   ├── AgentChatDemo.tsx
    │   │   ├── ScenarioPickerCard.tsx
    │   │   └── RecommendationCard.tsx
    │   ├── product/
    │   │   ├── ProductCard.tsx
    │   │   └── ProductGrid.tsx
    │   ├── payment/
    │   │   ├── X402TopupSteps.tsx        场景 A 8 步动画
    │   │   ├── X402CheckoutSteps.tsx     场景 B 8 步动画（P1）
    │   │   └── ActorAvatar.tsx           HABA/Netstars/WEA/Solana 4 个小图标共用
    │   ├── resale/
    │   │   ├── TokenResaleSection.tsx
    │   │   ├── TokenResalePlanCard.tsx
    │   │   └── ResaleChainDiagram.tsx
    │   ├── b2b/
    │   │   ├── B2BPartnerCards.tsx
    │   │   └── B2BPartnerDialogue.tsx
    │   └── shared/
    │       ├── DemoBadge.tsx
    │       └── SectionTitle.tsx
    └── lib/
        ├── haba/
        │   ├── index.ts              统一出口
        │   ├── types.ts              全部 TS 类型（§2）
        │   ├── merchant.ts           habaMerchant
        │   ├── products.ts           marvieProducts + 推荐召回
        │   ├── scenarios.ts          habaAgentScenarios + bundleSuggestions
        │   ├── resale.ts             tokenResalePlans + resaleChainNarrative
        │   ├── partners.ts           habaB2BPartners
        │   └── payment.ts            x402TopupSteps / x402CheckoutSteps
        ├── netstars-client.ts        包装 SDK / Token API 调用（demo 用 mock 也行）
        └── utils.ts                  cn() / 格式化等通用工具
```

### 0.2 现有 Netstars Console 改动（很小）

```
netstars/token/console/src/
  app/page.tsx                       ◄ 不动（保持 redirect → /dashboard）
  app/(console)/dashboard/page.tsx   ◄ subtitle: "Acme Co." → "HABA · Production"
  app/(console)/*/page.tsx           ◄ 同步改 subtitle
  lib/mock.ts                        ◄ audit actor / api key label 全换 HABA
  components/Sidebar.tsx             ◄ footer 可加 "← HABA Demo Site (http://localhost:3001)" 链接
```

**不**在 console 里建 `lib/haba/` 或 `components/haba/`——这些只属于 HABA 站点。

### 0.3 presentation.html 改动

```
claude/presentation.html
  + 在 §07 之前插入新段：4-actor 拓扑图（与 requirements §0 一致的 ASCII / SVG）
  ~ §08 DEMO STORY            "跨境电商运营 Agent" → "HABA AI Advisor"
  ~ §09 X402 IN MOTION ticker 文案换 HABA / MARVIE
  + 新段 §13b "AI Token Resale 业务模式"（与 haba/resale 同源数据）
  ~ §11 Architecture screencap caption: "Acme Co." → "HABA · Production"
```

后端 (`netstars/x402`, `netstars/token/api`, `wea`, `sdk/`) 完全不动。

---

## 1. 改造前后文件清单

### 1.1 修改的现有文件（合计 ≤ 7 个文件，改动量小）

| 文件 | 改动 | 行数预估 |
|------|------|---------|
| `claude/presentation.html` | §07 之前加 4-actor 拓扑、§08 整段重写、§09 ticker 文案换 HABA、加 §13b "Token Resale"、Merchant Console 引用文案 | ≈ 220 行 net |
| `netstars/token/console/src/app/(console)/*/page.tsx` (9 个 admin 页) | subtitle 文案"Acme Co." → "HABA · Production"；零结构变化 | 各 ≈ 1 行 |
| `netstars/token/console/src/lib/mock.ts` | `getAuditMock` 的 actor 邮箱、`getApiKeysMock` 的 label 全换 HABA 业务命名；其余保留 | ≈ 30 行改动 |
| `netstars/token/console/src/components/Sidebar.tsx` | Footer 加一条外链指向 HABA 站点（http://localhost:3001） | ≈ 4 行新增 |
| `docker-compose.yml` | 加 `haba-site` service（port 3001，build context: `./haba`） | ≈ 20 行新增 |
| `Makefile` | 加 `haba-dev` / `haba-build` target | ≈ 6 行新增 |
| `LOCAL-DEV.md` | 加"启动 HABA 站点"段 | ≈ 30 行新增 |

### 1.2 新增的项目（顶层 `haba/`）— 见 [§0.1 目录树](#01-haba-站点目录树顶层-haba--全新建)

不再在 `netstars/token/console/` 内部新增任何 HABA 专属代码。HABA 站点的所有类型、mock、组件**都在 `haba/` 项目内**。

### 1.3 新增的文档

```
docs/
  haba-demo-requirements.md          (已建)
  haba-agent-design.md               (已建)
  haba-technical-plan.md             (本文)
```

> **复用规则修订**：HABA 站点是**独立项目**，不直接 import Netstars Console 的组件（KpiCard、DataTable 等）。需要时**复制等价实现**进 `haba/src/components/`，并在 `haba/README.md` 标注来源。理由：两边解耦升级，避免 console 一改样式影响 HABA 对外品牌。

---

## 2. 数据结构（TypeScript types）

所有类型集中在 `src/lib/haba/types.ts`，其他文件 `import type` 进来。下文给出**最终形态**的类型——实现时按这个 schema 写 mock，不允许偏移。

### 2.1 HabaMerchant

```ts
export type HabaMerchant = {
  id: string;                          // "mch_haba_001"
  legalName: string;                   // "HABA / ハーバー研究所"
  displayName: string;                 // "HABA"
  productLine: string;                 // "MARVIE Medical Foods"
  websiteUrl: string;                  // 演示用
  primaryColor: string;                // HABA 品牌色（hex）
  consumerSegments: string[];          // ["控糖人群", "减脂人群", ...]
  b2bSegments: string[];               // ["药局", "医院营养科", ...]
  defaultNetstarsProject: string;      // "prod" / 业务线
};

export const habaMerchant: HabaMerchant = { ... };
```

### 2.2 MarvieProduct + 推荐 tag 字典

```ts
export type ProductCategory =
  | "sweetener_liquid"
  | "sweetener_powder"
  | "jam"
  | "candy"
  | "cooking_aid";

export type ProductTag =
  // 用户场景
  | "drink" | "cooking" | "bakery" | "breakfast"
  | "for_diabetic_household" | "for_elderly"
  | "for_weight_loss" | "for_dietitian"
  // 健康宣称
  | "zero_calorie" | "low_calorie"
  | "no_added_sugar" | "keto_friendly"
  // 风格
  | "replace_sugar_1_to_1" | "bakery_heat_stable" | "cold_soluble";

export type MarvieProduct = {
  id: string;                          // "marvie_liquid_200ml"
  sku: string;                         // "MARVIE-LQ-200"
  name: string;                        // "MARVIE Liquid Sweetener · 200ml"
  category: ProductCategory;
  tags: ProductTag[];
  priceJpy: number;                    // MOCK
  caloriesPer100g?: number;
  caloriesPerServing?: { value: number; servingLabel: string };
  sweetnessRatioToSugar?: number;      // 200 = 200×砂糖
  ingredients: string[];               // ["赤藓糖醇", "甜菊糖苷"]
  imageEmoji: string;                  // 占位用 emoji（不引入图片）
  shortPitch: string;                  // 一句话卖点
  longDescription: string;             // 段落文案
  inventoryDemo?: { storeName: string; qty: number }[];  // B2B pharmacy 用
};

export const marvieProducts: MarvieProduct[] = [ /* 5–8 个 SKU */ ];
```

### 2.3 HabaAgentScenario + Recommendation

```ts
export type AgentPersona = "c_concierge" | "b2b_pharmacy" | "b2b_dietitian" | "b2b_hospital" | "b2b_ec_partner";

export type HabaAgentScenario = {
  id: string;                          // "control_sugar_family"
  persona: AgentPersona;
  title: string;                       // "给糖尿病家人买低卡甜味料"
  userPrompt: string;                  // 完整的用户提问
  recommendations: Recommendation[];
  closingCta: { label: string; kind: "add_to_cart" | "ask_more" | "copy_to_client" | "print" }[];
  showWarning?: boolean;               // §7.1 兜底 / §7.4 超额
  fallbackText?: string;
};

export type Recommendation = {
  productId: MarvieProduct["id"];
  reasons: string[];                   // ≥ 3 条，UI 渲染成 bullets
  badge?: "Best for Diabetic" | "Heat Stable" | "Editor's Pick";
  bundleSuggestionId?: string;         // 指向 BundleSuggestion
};

export type BundleSuggestion = {
  id: string;
  productIds: MarvieProduct["id"][];
  bundlePriceJpy: number;              // 折后
  originalTotalJpy: number;
  saveLabel: string;                   // "节约 ¥180"
};

export const habaAgentScenarios: HabaAgentScenario[] = [
  // 5 个 C 端 + 4 个 B2B = 至少 9 个，覆盖 agent-design §3 的全部
];
```

### 2.4 X402 支付步骤（共享结构 — 4-actor 视角）

actor 枚举跟 [requirements §0](./haba-demo-requirements.md#0-4-actor-拓扑本-demo-的根锚点) 严格一一对应：

```ts
export type PaymentActorKind =
  | "haba"          // 商户：发起 Token 充值 / 收消费者货款
  | "netstars"      // x402 + Token 网关
  | "wea"           // 链上结算执行
  | "solana"        // USDC SPL 公链
  | "consumer";     // 终端消费者（仅场景 B 出现）

export type X402PaymentStep = {
  n: number;                           // 1–8
  fromActor: PaymentActorKind;
  toActor: PaymentActorKind;
  label: string;                       // "POST /v1/payments"
  note: string;                        // "create order + idempotency"
  detailJa?: string;                   // demo 富文案，可选
  detailZh?: string;
};

// 场景 A · 主线 · HABA 给自己的 AI Advisor 充 Token
export const x402TopupSteps: X402PaymentStep[] = [ /* 8 步，actor: haba → netstars → wea → solana → wea → netstars → haba */ ];

// 场景 B · P1 · 终端消费者付 MARVIE 商品款（消费者付的对象是 HABA，不是 Netstars）
export const x402CheckoutSteps: X402PaymentStep[] = [ /* 8 步，actor: consumer → haba → netstars → wea → solana → wea → netstars → haba → consumer */ ];
```

### 2.5 Token AI Resale 套餐

```ts
export type TokenResalePlan = {
  id: "starter" | "growth" | "enterprise";
  displayName: string;                 // "Starter"
  monthlyTokenQuota: number;           // 10_000
  pricePerTokenJpy: number;            // 3.0
  monthlyBaseFeeJpy: number;
  targetPersona: string;               // "单店药局 / 独立营养师"
  marketingLine: string;               // "够日均 200 次顾客咨询"
  features: string[];                  // ["SDK 接入", "MCP 接口", "标准 SLA", ...]
  recommended?: boolean;
};

export const tokenResalePlans: TokenResalePlan[] = [ /* 3 档 */ ];
```

### 2.6 B2B Partner 画像

```ts
export type B2BPartnerCase = {
  id: "pharmacy" | "hospital_dietitian" | "freelance_dietitian" | "ec_partner";
  partnerKind: "药局" | "医院营养指导" | "独立营养师" | "合作电商";
  icon: string;                        // emoji 占位
  valueProp: string;                   // 一句话价值主张
  embedTechnique: "Web 嵌入" | "API 直调" | "SDK + 自有 SaaS" | "MCP 工具调用";
  sampleScenarioId: HabaAgentScenario["id"];  // 指向 §2.3 一段对话
  monthlyCallVolumeDemo: number;       // demo 显示用 mock 数字
  recommendedPlanId: TokenResalePlan["id"];
};

export const habaB2BPartners: B2BPartnerCase[] = [ /* 4 个 */ ];
```

### 2.7 类型一致性

- 所有 mock 文件 `export const` 都用 `as const satisfies SomeType[]` 模式锁紧字面量类型
- `index.ts` 用 `export type { ... }` re-export 所有类型，外部消费方只 `import { habaMerchant, type MarvieProduct } from "@/lib/haba"`
- 不允许在 `components/haba/*.tsx` 里写 `any` 或 inline 接口

---

## 3. Mock 数据集中布局

位置：`haba/src/lib/haba/`（**HABA 项目内**，不在 Netstars Console 内）

```
haba/src/lib/haba/
├── index.ts                ← 统一出口；其他文件不直接 import 子文件
├── types.ts                ← 所有类型集中（§2 内容）
├── merchant.ts             ← habaMerchant
├── products.ts             ← marvieProducts + 推荐召回函数 selectByScenario(scenarioKey)
├── scenarios.ts            ← habaAgentScenarios + bundleSuggestions
├── resale.ts               ← tokenResalePlans + resaleChainNarrative
├── partners.ts             ← habaB2BPartners + B2B 演示文案
└── payment.ts              ← x402TopupSteps（场景 A）/ x402CheckoutSteps（场景 B，可选）
```

### 3.1 mock 数据红线

- 所有价格 / 卡路里 / 调用量加 `// MOCK · NOT FOR PRICING REFERENCE` 注释
- 不写"治疗""疗效""适合糖尿病患者长期服用"等违规词（agent-design §4.3）
- 不出现真实 HABA 的内部价、内部 SKU 编号；只用 demo 命名规范

### 3.2 数据量 sanity check

| 集合 | 最少元素 | 最多元素 |
|------|---------|---------|
| `marvieProducts` | 5 | 8 |
| `habaAgentScenarios` | 9（5 C 端 + 4 B2B） | 12 |
| `tokenResalePlans` | 3 | 3 |
| `habaB2BPartners` | 4 | 4 |
| `x402ConsumerCheckoutSteps` / `HabaTopupSteps` | 8 each | 8 each |

---

## 4. 页面改造清单

### 4.1 presentation.html

| 段落 | 改造内容 | 关键文案 |
|------|---------|----------|
| §06 标题区 | 不动 | — |
| **§07 之前新增**：4-actor 拓扑图 | 一张幻灯片：HABA / Netstars / WEA / Solana 关系 + 各自职责一行 | 与 [requirements §0](./haba-demo-requirements.md#0-4-actor-拓扑本-demo-的根锚点) 同源 |
| §08 DEMO STORY | 整段重写：场景从"跨境电商运营"→"HABA AI Advisor 自动充 Token + 服务消费者 + 转售 B2B" | 见 agent-design §3 |
| §09 X402 IN MOTION | 4 actor 不动（Agent SDK / Netstars / Wea / Solana）；底部 tx-ticker 文案换"MARVIE 商品推荐 / B2B 嵌入 / HABA Token 充值" | 见 agent-design §3.6 |
| §10 BUSINESS PROCESS | "商户" 主语保留泛化（适用所有商户），但插一句"以本次 demo 的 HABA 为例" | 微调 |
| §11 Architecture / Merchant Console 截图 | Merchant Console 截图说明 "Acme Co." → "HABA · Production"；可加一张 HABA 站点截图作为"商户自有页面"举例 | 文案 + 截图 |
| §12 Revenue / §13 GTM | 不点名 HABA；保持 Netstars 视角 | 不改 |
| **§13b 新增**：AI Token Resale | 整张新幻灯片：左侧转售链路图（与 haba/src/lib/haba/resale.ts 同源）+ 右侧 3 个套餐卡 + 4 个 partner icon | 新增 ≈ 80 行 |
| §14 Roadmap / §15 Risks / §16 Closing | 不改 | — |

### 4.2 HABA 站点路由（新建 — 主体工作）

```
http://localhost:3001/  ◄ HABA AI Commerce 主页（顶层独立部署）
  ├─ Hero               (HabaHero)
  ├─ Agent 对话样例     (AgentChatDemo · 5 个 C 端旅程一键卡)
  ├─ MARVIE 商品网格    (ProductGrid · marvieProducts)
  ├─ Token AI Resale    (TokenResaleSection · 套餐卡 + 链路图)
  ├─ B2B Partner 区     (B2BPartnerCards · 4 个画像)
  └─ Footer             ("演示用途，非销售承诺" + 链接到 Netstars Console)

http://localhost:3001/topup    ◄ HABA 给自己充 AI Token（x402 场景 A，8 步动画 + 4-actor 视角）
http://localhost:3001/resale   ◄ Token AI Resale 单独详情页
http://localhost:3001/b2b/[id] ◄ 4 个 B2B 画像各自详情 + 调用示例
http://localhost:3001/shop/cart ◄ x402 场景 B 消费者下单（P1，可选）
```

### 4.3 Netstars Console 路由（**不**重塑成 commerce 页，只换身份文案）

```
http://localhost:3000/                ◄ 不动（仍 redirect → /dashboard）
http://localhost:3000/dashboard       ◄ subtitle: "Acme Co." → "HABA · Production"
http://localhost:3000/usage           ◄ 同上
http://localhost:3000/tokens          ◄ 同上
http://localhost:3000/api-keys        ◄ mock label 改 HABA 业务命名
http://localhost:3000/audit           ◄ mock actor 改 HABA 邮箱域
http://localhost:3000/{invoices,settings,models,protocol} ◄ 仅 subtitle 文案
Sidebar footer                        ◄ 加 "→ HABA Demo Site" 外链到 :3001
```

### 4.3 mock.ts 改造细节（最小化）

只动两处：

```ts
// 改 §1.2 表里出现的 4 行
const AUDIT_ACTIONS = [
  ["ops@haba-rd.jp",       "user",   "api_key.view",   "agent_key"],
  ["system",               "system", "token.credit",   "payment_order"],
  ["ops@haba-rd.jp",       "user",   "api_key.create", "agent_key"],
  ["system",               "system", "ledger.debit",   "request"],
  ["finance@haba-rd.jp",   "user",   "invoice.view",   "invoice"],
  ["system",               "system", "webhook.deliver","webhook"],
] as const;

// getApiKeysMock 的 label 换：
// "Production agent"   → "Production AI Advisor"
// "EC scrape worker"   → "Pharmacy B2B Channel"
// "QA bot"             → "Hospital Dietitian Bot"
// "Old key (revoked)"  → "Legacy EC Partner — DRG Online (revoked)"
```

域名 `haba-rd.jp` 是 demo 用的占位（HABA Research & Development 缩写），上线前确认换为正式邮箱后缀。

---

## 5. 组件设计（HABA 项目内独立实现）

### 5.1 跟 Netstars Console 的隔离原则

| 决定 | 理由 |
|------|------|
| HABA 项目**不** import `netstars/token/console/src/components/*` | 两个项目独立 build，避免 console 改样式影响 HABA 对外品牌 |
| HABA 项目自有 design tokens（`tailwind.config.ts` 单独配） | HABA 是 ハーバー研究所 品牌，色系/字体会偏自然/健康；Console 偏 Netstars 科技蓝 |
| 共同的小工具如 `cn()` / `formatJpy()` 各自实现一份 | 重复 < 50 行；换得解耦 |
| **唯一例外**：未来如果抽 design-system 公共包，HABA 和 Console 同时依赖——目前不做 | 留架构余地 |

### 5.2 HABA 站点组件清单（精炼接口）

```tsx
// HabaHero · 主视觉
<HabaHero
  merchant={habaMerchant}
  scenarioTeasers={firstFiveCConcierge}   // 5 个一键场景标题
/>

// AgentChatDemo · 单条场景对话渲染
<AgentChatDemo
  scenario={scenario}
  onAddToCart={(productId) => …}
/>

// ProductCard
<ProductCard
  product={marvie}
  showReasons={["低卡 0 kcal", "1:1 替砂糖", "适合控糖家庭"]}
  badge="Best for Diabetic"
/>

// X402PaymentSteps · 8 步可视化
<X402PaymentSteps
  steps={x402ConsumerCheckoutSteps}
  mode="checkout"   // | "topup"
  autoplay
/>

// TokenResaleSection · 套餐卡 + 链路图
<TokenResaleSection plans={tokenResalePlans} />

// B2BPartnerCards
<B2BPartnerCards partners={habaB2BPartners} />

// DemoBadge · 全局加在数字角落
<DemoBadge tone="muted">演示数据</DemoBadge>
```

每个组件**只读 props，不耦合后端**——demo 完全离线可跑。

### 5.3 样式约束

- 用 Tailwind + 现有 design tokens（`text-ink-*`, `bg-surface-*`, `border-border-*`）
- 主色用 `brand-primary`（沿用 console 现有蓝）；MARVIE 商品卡用淡色 highlight (`bg-emerald-50` 等)
- 不引入新色板；不引入 framer-motion / 重型动画库（如果需要 8 步动画，用 CSS `@keyframes` + 现有 motion css）

---

## 6. i18n 处理

### 6.1 HABA 站点（新项目，自己配 i18n）

- 默认语言 **zh-CN**（按用户要求"文案中文为主"）
- 同时建 `ja.json`（HABA 是日本品牌方便切）+ `en.json`（兜底）
- 用 `next-intl` 跟 console 同一栈，但配置**独立**
- 导航/标签类文案进 `messages/*.json`
- 业务数据（agent 对话脚本、商品描述、套餐文案）**留在 `lib/haba/*.ts`**——避免在 messages 中复制粘贴

### 6.2 Netstars Console（现有，不专门加 zh-CN）

- 沿用 `messages/en.json` + `messages/ja.json`
- 本次只改 subtitle 等少数硬编码字符串（拼接 `habaMerchant.displayName + " · Production"`）
- 如果未来 Console 自身要做中文，再单独开 PR 加 zh-CN

### 6.3 i18n 范围限定（两站通用）

只给"导航/标签类"短文案进 messages 文件；agent 对话脚本、商品描述等"业务数据"留在 mock 文件中。

---

## 7. 实现步骤（5 个 milestone — 按"先项目骨架再页面"顺序）

> 文档先行已完成（v0.2）。每个 milestone 完成后回写 requirements §5 表 + 本文 §0 总览。

### Milestone 1 · `haba/` 项目骨架 ✅ 已完成（2026-05-27）

- ✅ 顶层 `haba/` 目录 + 全部配置：[package.json](../haba/package.json) / [tsconfig.json](../haba/tsconfig.json) / [next.config.mjs](../haba/next.config.mjs) / [tailwind.config.ts](../haba/tailwind.config.ts) / [postcss.config.mjs](../haba/postcss.config.mjs) / [.gitignore](../haba/.gitignore) / [README.md](../haba/README.md)
- ✅ HABA 独立 design tokens（warm green + cream），跟 Console tech blue 解耦
- ✅ [Dockerfile](../haba/Dockerfile)：多阶段 + standalone output，port 3001
  - **关键修复**：`ENV HOSTNAME=0.0.0.0` —— Next standalone 默认绑容器 hostname，会让 in-container healthcheck 撞 127.0.0.1 失败
- ✅ i18n 三文件 [zh-CN.json](../haba/messages/zh-CN.json) / [ja.json](../haba/messages/ja.json) / [en.json](../haba/messages/en.json)，默认 zh-CN；[request.ts](../haba/src/lib/i18n/request.ts) 协商策略 cookie > Accept-Language > 默认
- ✅ 最小 app：[layout.tsx](../haba/src/app/layout.tsx) + [globals.css](../haba/src/app/globals.css) + [page.tsx](../haba/src/app/page.tsx) 占位 Hero + 4-actor 卡片
- ✅ [docker-compose.yml](../docker-compose.yml) 新增 `haba-site` service（:3001，独立 healthcheck，**不在** token-api 的 depends_on 链上）
- ✅ [Makefile](../Makefile) 新增 `haba-install` / `haba-dev` / `haba-build` / `haba-typecheck` / `haba-up`
- ✅ **验收实测**：
  - `tsc --noEmit` 通过；`npm run build` 3 个路由 100 kB First Load JS
  - `docker compose ps haba-site` 显示 `running (healthy)`
  - 同时和 console / mysql / redis / token-api / wea-api 并行健康
  - 浏览器 :3001 看到中文 zh-CN 内容 + 4-actor 卡片
- **遗留**（不阻塞 M1，后面统一处理）：
  - Next 15.0.3 安全告警 / `node:20-alpine` 镜像漏洞 → 与 Console 同源，M5 收尾时联动升级
  - Solana validator 仍因 ARM/AVX 退出 134（pre-existing，不影响 HABA）

### Milestone 2 · Mock + 类型骨架 ✅ 已完成（2026-05-27）

- ✅ 建 `haba/src/lib/haba/` 8 个文件（含 index.ts）
  - [types.ts](../haba/src/lib/haba/types.ts) — §2 全部 TS 类型
  - [merchant.ts](../haba/src/lib/haba/merchant.ts) — `habaMerchant` 单例
  - [products.ts](../haba/src/lib/haba/products.ts) — **7** MARVIE SKU + `selectByTags()` 推荐召回
  - [scenarios.ts](../haba/src/lib/haba/scenarios.ts) — **9** scenario（5 C 端 + 4 B2B）+ **4** bundle suggestion + getter 工具函数
  - [resale.ts](../haba/src/lib/haba/resale.ts) — **3** tokenResalePlan + resaleChainNarrative（含链路图节点/边数据）
  - [partners.ts](../haba/src/lib/haba/partners.ts) — **4** B2B partner case
  - [payment.ts](../haba/src/lib/haba/payment.ts) — **8 + 8** x402 步骤（场景 A topup + 场景 B checkout）
  - [index.ts](../haba/src/lib/haba/index.ts) — 统一出口
- ✅ 临时 [/debug](../haba/src/app/debug/page.tsx) 页面 dump 全部 mock，M3 完成后删除
- ✅ **验收**：
  - `tsc --noEmit` 0 error
  - `npm run build` 通过，产生 `/` + `/debug` + `/_not-found` 三个路由
  - Docker rebuild → :3001 healthy → `curl /debug` 实测 7 个集合数量符合 §3.2：marvieProducts (7) / habaAgentScenarios (9) / bundleSuggestions (4) / tokenResalePlans (3) / habaB2BPartners (4) / x402TopupSteps (8) / x402CheckoutSteps (8)
- **附带交付**：[agent-design.md](./haba-agent-design.md) §3.5b / §3.5c 补齐医院 + 合作电商 2 个 B2B 对话脚本，与 scenarios.ts 4 个 B2B scenario 1:1 对齐
- **本轮踩到 + 修了 1 个小坑**：products.ts 把 `"jam"` `"candy"` 同时放进了 tags 数组——它们是 `ProductCategory` 不是 `ProductTag`。已剔除（`category` 字段足够）。teach: **union types 一旦区分了 category vs tag，就不允许互相串场**

### Milestone 3 · C 端 Hero + Agent + ProductGrid ✅ 已完成（2026-05-27）

实装组件（11 个新文件，集中在 `haba/src/components/`）：

| 文件 | 角色 |
|------|------|
| [lib/utils.ts](../haba/src/lib/utils.ts) | `cn()` + `formatJpy()` + `formatTokenCount()` |
| [shared/DemoBadge.tsx](../haba/src/components/shared/DemoBadge.tsx) | "演示数据"角标 — 每个数字角落都挂 |
| [shared/SectionTitle.tsx](../haba/src/components/shared/SectionTitle.tsx) | eyebrow + title + description + right slot |
| [layout/HabaTopBar.tsx](../haba/src/components/layout/HabaTopBar.tsx) | 顶部品牌条 |
| [layout/HabaFooter.tsx](../haba/src/components/layout/HabaFooter.tsx) | 免责 + Console 跳链 |
| [layout/FourActorRibbon.tsx](../haba/src/components/layout/FourActorRibbon.tsx) | 4-actor 拓扑提示条（每屏都看得到） |
| [hero/HabaHero.tsx](../haba/src/components/hero/HabaHero.tsx) | Hero + 4 个消费者画像 chip |
| [agent/ScenarioPickerCard.tsx](../haba/src/components/agent/ScenarioPickerCard.tsx) | 单个场景 teaser 卡（client） |
| [agent/RecommendationCard.tsx](../haba/src/components/agent/RecommendationCard.tsx) | Agent 推荐 SKU 卡（含 ≥3 reasons + bundle） |
| [agent/AgentChatDemo.tsx](../haba/src/components/agent/AgentChatDemo.tsx) | User/Agent 对话气泡 + CTA |
| [agent/ConsumerScenarioSection.tsx](../haba/src/components/agent/ConsumerScenarioSection.tsx) | client 容器，`useState` 切换场景 |
| [product/ProductCard.tsx](../haba/src/components/product/ProductCard.tsx) | 商品目录卡（与 RecommendationCard 区分） |
| [product/ProductGrid.tsx](../haba/src/components/product/ProductGrid.tsx) | 7 SKU 三列网格 |

- `app/page.tsx` 重写：TopBar → FourActorRibbon → Hero → ConsumerScenarioSection → ProductGrid → Footer
- i18n 三文件补 `agent.*` + `products.*` 命名空间
- **验收实测**（2026-05-27 07:34，via Playwright 浏览器）：
  - ✅ `tsc --noEmit` 0 error；`npm run build` 通过（`/` 30.5 kB JS）
  - ✅ Docker rebuild → :3001 healthy
  - ✅ 默认进入 C 端控糖场景，Agent 显示 3 个推荐 SKU + 每条 ≥ 3 reasons + ¥2,560→¥2,380 bundle
  - ✅ 5 个 C 端 teaser 全部在 DOM；**点击第 3 个 "早餐果酱" → Agent 实测切到 🫐 🍓 🍊 三款 jam + 新 bundle "3 瓶尝鲜装"** — 客户端 `useState` 状态机正常
  - ✅ 7 个 MARVIE 商品全部在 ProductGrid（液体/粉末/大袋/3 果酱/糖果）
  - ✅ 4-actor ribbon 4 个角色 (HABA → Netstars → WEA → Solana) 全显示
  - ✅ Footer 有免责 + Console 跳链；console 唯一 error 是 favicon 404（M5 加品牌图标解决）
- **本轮交付提醒**：
  - `/debug` 路由仍在，M4 后删
  - CTA 按钮（加入购物车 / 我想再看）目前只 `console.info()`，真实 x402 结账在 M4 接入

### Milestone 4 · x402 充值 + Token Resale + B2B Partner ✅ 已完成（2026-05-27）

新增 11 个组件 + 3 个路由 + 1 个布局重构：

| 模块 | 文件 |
|------|------|
| Payment | [payment/ActorAvatar.tsx](../haba/src/components/payment/ActorAvatar.tsx) · [payment/X402TopupSteps.tsx](../haba/src/components/payment/X402TopupSteps.tsx)（client，1.6s autoplay + 点击暂停 + 重播 + 当前 detail 面板）|
| Resale | [resale/TokenResalePlanCard.tsx](../haba/src/components/resale/TokenResalePlanCard.tsx) · [resale/ResaleChainDiagram.tsx](../haba/src/components/resale/ResaleChainDiagram.tsx)（vertical + inline 两个变体）· [resale/TokenResaleSection.tsx](../haba/src/components/resale/TokenResaleSection.tsx)（narrative + 链路图 + 3 套餐 + KPI 条）|
| B2B | [b2b/B2BPartnerCards.tsx](../haba/src/components/b2b/B2BPartnerCards.tsx)（4 卡）· [b2b/B2BPartnerSection.tsx](../haba/src/components/b2b/B2BPartnerSection.tsx)（client `useState` 切换 partner，**复用** AgentChatDemo 渲染对话）|
| Layout | [layout/HabaNav.tsx](../haba/src/components/layout/HabaNav.tsx)（client，`usePathname` 高亮 active）· TopBar 加 brand Link + nav |
| Home | [home/SubpageTeaserGrid.tsx](../haba/src/components/home/SubpageTeaserGrid.tsx)（3 张 teaser 卡 → /topup /resale /b2b）|
| Routes | [app/topup/page.tsx](../haba/src/app/topup/page.tsx) · [app/resale/page.tsx](../haba/src/app/resale/page.tsx) · [app/b2b/page.tsx](../haba/src/app/b2b/page.tsx) |
| 重构 | [app/layout.tsx](../haba/src/app/layout.tsx) 把 TopBar / FourActorRibbon / Footer 提到 root，所有路由共享；[app/page.tsx](../haba/src/app/page.tsx) 因此只保留 main 内容 |
| i18n | zh-CN / ja / en 三文件补 `nav.*` / `home.teaser.*` / `topup.*` / `resale.*` / `b2b.*` 命名空间 |

- **验收实测**（2026-05-27 07:49，via Playwright）：
  - ✅ `tsc --noEmit` 0 error
  - ✅ `npm run build`：6 routes — `/` 141 kB · `/topup` 118 kB · `/resale` 109 kB · `/b2b` 142 kB · `/debug` · `/_not-found`
  - ✅ Docker rebuild → healthy
  - ✅ /topup：4-actor 列头 (HABA → Netstars → WEA → Solana) 全显示；8 步全部按 from→to 渲染（actor 颜色 pill + 编号 + 行内点击暂停）；当前激活步骤 detail 面板显示对应 step3 的 `detailZh`
  - ✅ /resale：narrative 3 段 + 链路图（Anthropic / Netstars / HABA / 4 partner）+ 3 张套餐卡（Starter ¥3 / Growth 推荐 ¥2.4 / Enterprise 议价）+ 本月 KPI 条
  - ✅ /b2b：4 卡片全显示（药局 / 医院 / 营养师 / 合作电商，含 icon + valueProp + embedTechnique + 月度调用数 + 推荐套餐）；**点击合作电商 → AgentChatDemo 实测切到 "B2B · ec partner" persona + 减脂早餐 jam 推荐 + 3 瓶尝鲜装 bundle + "复制嵌入代码" CTA + B2B 计费提示**
  - ✅ 主页 4 个 nav link 全可点（首页 / AI Token 充值 / Resale 业务 / B2B 合作方），active 路由背景高亮
  - ✅ 主页加 3 张 teaser 卡 + 内嵌 inline 链路图 + CTA 链到子页

### Milestone 5 · Console 身份文案 + presentation.html + 收尾 ✅ 已完成（2026-05-27）

**Console（5 个文件 + 1 个 i18n 占位）**
- [console/src/lib/mock.ts](../netstars/token/console/src/lib/mock.ts)：4 个 API Key label 改 HABA 业务命名（Production AI Advisor / Pharmacy B2B Channel / Hospital Dietitian Bot / Legacy EC Partner — DRG Online）；audit actor 域名 `yamada@acme.co.jp` → `ops@haba-rd.jp` `finance@haba-rd.jp`
- [console/src/app/(console)/dashboard/page.tsx](../netstars/token/console/src/app/(console)/dashboard/page.tsx)：subtitle → "HABA / ハーバー研究所 · Production"
- [console/src/app/(console)/settings/page.tsx](../netstars/token/console/src/app/(console)/settings/page.tsx)：Organization name / Legal name / Billing email / Merchant ID + Team 3 成员邮箱全换 haba-rd.jp
- [console/src/components/TopBar.tsx](../netstars/token/console/src/components/TopBar.tsx)：org switcher "Acme Co., Ltd." → "HABA / ハーバー研究所"，avatar "山田" → "HABA"
- [console/src/components/Sidebar.tsx](../netstars/token/console/src/components/Sidebar.tsx)：Footer 顶部新增 "HABA AI Commerce →" 外链跳 :3001

**HABA 站点**
- 删 [haba/src/app/debug](../haba/src/app/debug)（M2 临时 dump 页面已使命完成）
- 新增 [haba/src/app/icon.svg](../haba/src/app/icon.svg) — emerald 方块 + 白 "H" 字母 favicon，解决 M3 实测的 404

**presentation.html — 实际位置调整**
- **新增 §07b 4-ACTOR 幻灯**：放在 §07 COMPETITION 之后、§08 DEMO STORY 之前（**比技术方案 §4.1 写的"§07 之前"更靠后**）。理由：narrative 流"竞争象限 → 4-actor 框架 → demo 故事"比"FIT MATRIX → 4-actor → COMPETITION → demo"更顺。这是 M5 对 spec 的一次小幅偏离，已就地记录。
- §08 DEMO STORY 整段重写：从"跨境电商运营 Agent"→"HABA AI Advisor — 商户买 Token、卖 Token，全在 demo 里看得到"。5 个 timeline step 都改成 HABA 视角（Advisor 接调用 → SDK 自动充值 → 4-actor x402 → Token 入账继续接 B2B+C 端 → Console 看流水）
- §09 X402 IN MOTION tx-ticker 5 行文案换 HABA / MARVIE 场景（控糖推荐 / 药局咨询 / 营养师方案 / HABA Token topup / 医院控糖出院）
- **新增 §13b TOKEN AI RESALE 幻灯**：放在 §13 GTM 和 §14 ECOSYSTEM FLYWHEEL 之间，含转售链路图（Anthropic → Netstars → HABA → 4 partner）+ 3 套餐 mini-card + 与 §14 飞轮逻辑的衔接 kicker
- §13 GTM 灯塔商户描述："跨境电商、SaaS、跨境物流、AI 初创" → "健康食品 / 医药垂直、SaaS、AI 初创"
- §16 Roadmap Phase 1："跨境电商 Agent 场景" → "HABA AI Advisor 场景（健康食品垂直 demo）"
- §17 Closing："跨境电商运营 Agent → HABA AI Advisor"，加 PR 审批 disclaimer

**验收实测**
- ✅ `grep "Acme\|@acme\.co\|yamada" {console,haba,claude}` → 0 命中
- ✅ `grep "跨境电商" presentation.html` → 0 命中
- ✅ console: `tsc --noEmit` 0 error，`npm run build` 12 routes 全过
- ✅ haba: 清 .next 缓存重 build，5 routes（/, /b2b, /resale, /topup, /icon.svg），`tsc --noEmit` 0 error
- ✅ Docker：`/`, `/topup`, `/resale`, `/b2b` 都 200；`/debug` 404（已删）
- ✅ Console `/dashboard` 看到 "HABA / ハーバー研究所"；`/settings` 看到 haba-rd.jp 邮箱 + mch_haba_001 + ハーバー
- ✅ **后端未动**：`make wea-smoke` ✓ end-to-end loop 通过；`make sdk-example` ✓ DEV 模式 8 步通过

**已知限制**：
- 仓库根 `prd.md`、`sdk/ARCHITECTURE.md`、`outputs/`、`netstars/token/ui/UX-SPEC.md` 仍含"跨境电商""@acme.co.jp"等历史文本——这些是**架构 / PRD 原始文档**，不在 demo 物理表面（requirements §1.1 三个载体）内，按规则保留。如未来要对外发布这些文档，需另起一轮清理。

### Milestone 6 · HABA → Netstars 后端真实接通 ✅ 已完成（2026-05-27）

**M6 是 spec 范围外的加单**——用户要求"先有个全程能跑的东西"，意思不是再 demo 几张静态截图，而是 HABA 站点真打 backend、Console 看到同一笔流水。

**HABA 站点新增（5 个文件 + TopBar 接入 + /topup 接入）**
| 文件 | 作用 |
|------|------|
| [lib/netstars/sign.ts](../haba/src/lib/netstars/sign.ts) | TypeScript 版 HMAC-SHA256 签名，对齐 [sdk/src/netstars/transport.py](../sdk/src/netstars/transport.py) 的 `sign_request`。`server-only` |
| [lib/netstars/client.ts](../haba/src/lib/netstars/client.ts) | server-only HTTP 客户端，4 个方法：fetchBalance / fetchRecentActivity / createTokenPurchase / adminConfirm。URL 解析按 INTERNAL → NEXT_PUBLIC → localhost fallback |
| [app/api/netstars/balance/route.ts](../haba/src/app/api/netstars/balance/route.ts) | GET 代理到 token-api `/v1/balance` |
| [app/api/netstars/topup/route.ts](../haba/src/app/api/netstars/topup/route.ts) | POST 代理：先打 `/v1/token-purchase` 再打 x402 `/v1/admin/payments/{id}/confirm`，DEV 完整闭环 |
| [components/payment/TokenBalancePill.tsx](../haba/src/components/payment/TokenBalancePill.tsx) | 真实 Token 余额 pill，挂 [HabaTopBar](../haba/src/components/layout/HabaTopBar.tsx)；10s 轮询 + 监听 `haba:balance-refresh` 自定义事件即时刷新 |
| [components/payment/RealTopupButton.tsx](../haba/src/components/payment/RealTopupButton.tsx) | /topup 页"🚀 真打一笔"按钮，触发真 backend；成功后弹 SuccessPanel 显示 payment_order_id / tx_hash / ledger_entry_id + 跳 Console 验证的外链 |

**Netstars Console 顺手修（pre-existing 问题）**
- [console/src/lib/sign.ts](../netstars/token/console/src/lib/sign.ts) — HMAC 移植（与 haba 一份）
- [console/src/lib/api.ts](../netstars/token/console/src/lib/api.ts) — 每个请求加 HMAC 头；URL 解析加 `NETSTARS_API_BASE_INTERNAL`
- Console pre-M6 状态：在 docker 内 SSR 调用 token-api 时既没 HMAC 也用 `localhost:8080`，Dashboard 显示 "Backend unreachable"。M6 一起修好了。

**docker-compose 增量**
- `haba-site` env：`NETSTARS_TOKEN_API_INTERNAL=http://token-api:8080` + `NETSTARS_X402_API_INTERNAL=http://x402-api:8080` + `NETSTARS_API_KEY` / `_SECRET`
- `token-console` env：`NETSTARS_API_BASE_INTERNAL=http://token-api:8080` + 同样的 HMAC 凭证

**端到端实测**（2026-05-27 17:00 前后）

| 步骤 | 验证 |
|------|------|
| `curl /api/netstars/balance` | 39.99M Token / 39.9997 USDC — 真后端读取 |
| `curl /api/netstars/topup` 第 1 次 | payment_order_id=`pmt_01KSM9DH...`, ledger_entry_id=8, balance after=49.99M |
| Playwright 点 RealTopupButton（第 2 次） | SuccessPanel 显示 `pmt_01KSMA...` + 余额 +10M = 59.99M |
| `curl /api/netstars/topup` 第 3 次 | payment_order_id=`pmt_01KSMATC...`, ledger_entry_id=10, balance after=69.99M |
| HABA TopBar TokenBalancePill | 实时显示 "50.0M Token · 49.9997 USDC" → 自动 +10M → 60M |
| Console `/dashboard` Live Activity Ticker | **看到全部 3 笔 HABA topup**：`Token purchased via x402 (DEV_HABA_19e…) +10.00M` × 3，最近一次 "12 秒前" |
| Console `/dashboard` KPI "Token 残高" | 69.9997 USDC — 与 HABA TopBar pill **同步且数值完全一致** |

**关键意义**
- HABA → Netstars Token API（HMAC 签名 + 内部 DNS）：通
- Netstars Token API → x402-api（admin/confirm DEV 路径）：通
- x402-api 写流水 → Netstars Token API ledger：通
- Console 通过同一个 token-api API 把流水拉回来展示给"HABA 商户运营"：通

这是 "Demo 全程能跑" 的实质——4-actor 拓扑里 HABA → Netstars 这条边、Console → token-api 这条边都从 mock 升级到了 **真后端**。WEA / Solana 这两条边在 docker 跑不动 Solana 的限制下仍走 DEV admin/confirm 替身（这是 sdk/quickstart.py 的既定 DEV 路径）。

**遗留**
- WEA / Solana 的真链路径已经是 sdk/quickstart.py REAL CHAIN 模式可用，但需要 host 安装 solana-cli 跑 native validator（[LOCAL-DEV.md](../LOCAL-DEV.md) "Apple Silicon" 段）。M6 不打开这条路径。
- HABA Hero 上的 CTA（"加入购物车"等）仍是 `console.info()` placeholder；要把消费者下单也接到真 backend（x402 场景 B），需要另开 M7。

---

## 8. 验收 checklist（与 [requirements §6](./haba-demo-requirements.md#6-验收标准demo-完成的定义) 对应）

| # | 验收点 | 检验动作 | 期望结果 |
|---|--------|---------|---------|
| 1 | "这是谁的 demo" 一眼可读 | 打开 :3001 / | Hero 含 "HABA / ハーバー研究所" + "MARVIE Medical Foods" |
| 2 | 5 个 C 端场景至少 3 个可演示 | 点 Hero 下方的 5 个 teaser | 至少 3 个能展开推荐 + 理由 |
| 3 | 推荐有依据 | 任意推荐 SKU 卡 | 每张 ≥ 3 条 reasons bullet，含卡路里 / 甜度 / 场景 |
| 4 | x402 看得到 + **4-actor 标识清晰** | 打开 :3001/topup（或主页对应 section） | 8 步动画/流可见且连贯；每步标出 HABA / Netstars / WEA / Solana 谁在干什么 |
| 5 | Token Resale 独立板块 | 找到 "AI 能力转售 / Token Resale" 区 | 有标题、3 套餐卡、转售链路示意 |
| 6 | B2B 4 个画像 | B2B Partner 区 | 4 张卡，含 1 句价值主张 + 1 段对话演示 |
| 7 | 两站可同时启动 | `docker compose up -d` | :3000 Netstars Console + :3001 HABA 站点都健康 |
| 8 | TypeScript 干净 | `cd haba && npm run build` && `cd netstars/token/console && npm run build` | 两边 0 error |
| N1 | 商户身份单源 | 全局搜 "HABA" 字面量 | 只出现在 `haba/src/lib/haba/merchant.ts` + i18n + 必要 UI 文案；不允许散落 |
| N2 | mock 集中 | 全局搜 `marvieProducts` `tokenResalePlans` 等 | 只在 `haba/src/lib/haba/*.ts` 定义 |
| N3 | 旧文案清干净 | 搜 "Acme" "yamada@acme" "跨境电商" | 全部 0 命中（presentation.html 历史段落以外） |
| N4 | HABA 与 Console 解耦 | 全局搜 `from "@/netstars` 或 `from "../../netstars` | 在 `haba/` 里 0 命中 |
| N5 | 文档与代码一致 | 对照三份文档 §0/§5/§6 状态 | 全部回写为"已完成" |
| N6 | 不打破现有 SDK / quickstart | `make sdk-example` | 8 步 DEV 模式仍通过 |
| N7 | 不打破 wea smoke | `make wea-smoke` | 闭环仍通过 |

---

## 9. 不在本次范围

- 不接 OpenAI/Claude 真模型；Agent 推荐走 mock 函数 + 静态映射
- 不引入图片资产（emoji + Tailwind 占位）
- 不做付款真链 demo（仍 DEV mode）
- 不做多 tenant 切换 UI（只 HABA 一家）
- 不加 admin 登录 / RBAC

---

## 10. 风险与回滚

| 风险 | 触发症状 | 回滚方案 |
|------|---------|---------|
| HABA 站点 build 时间过长拖累 CI | 后端服务都已 healthy，但 haba-site 还在 npm install | 不让 CI 等 haba-site healthcheck；docker-compose 里 `haba-site` 不放进 `depends_on: condition: service_healthy` |
| 顶层多出 `haba/` 增加 monorepo 复杂度 | 团队不熟悉新目录 | README.md 顶层加项目地图段，三句话讲清 `sdk/` `netstars/` `wea/` `haba/` 各自责任 |
| presentation.html §08 / §13b 抢了原 deck 节奏 | 整页过长 / 章节顺序乱 | §13b 放在 §13 GTM 之后；不改前 12 张幻灯片顺序 |
| HABA 法务在 demo 完成后要求改名 | 客户审批节点滞后 | 单源 `habaMerchant.displayName` 一处替换即可恢复泛化（"DemoMart"），demo 不重写 |
| HABA 项目的 zh-CN.json 配置出错 | HABA 站点起不来 | HABA 项目独立 locale，影响范围仅 :3001；Console 不受影响 |
| Console 文案改完 i18n 串了 | en/ja 部分 dashboard 出现 raw key | 严格只改 subtitle 拼接，不动 messages 文件结构 |

---

## 11. 文档与代码的同步约定

- 任何 milestone 推进，必须**同回合**回写本文 §7 状态
- 任何对 §2 类型定义的改动，三份文档都要同步（这是单点泄漏点）
- 任何对 [agent-design §3](./haba-agent-design.md#3-用户旅程--对话脚本) 对话脚本的扩充，要在本文 §3.2 同步增加 scenario 数量上限
- 任何对 [requirements §6](./haba-demo-requirements.md#6-验收标准demo-完成的定义) 验收点的调整，要立刻同步本文 §8

> **写代码前先读完 3 篇文档**——文档不齐就动手写代码，是本次最大的反 pattern。
