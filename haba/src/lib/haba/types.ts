/**
 * HABA · single source of truth for TypeScript types.
 *
 * All types follow haba-technical-plan §2 verbatim. Concrete mock values
 * live in sibling files (merchant.ts / products.ts / scenarios.ts /
 * resale.ts / partners.ts / payment.ts) — they `import type` from here
 * and re-export their typed constants via `index.ts`.
 *
 * Naming rule: types are PascalCase; mock collections are camelCase plurals
 * (`marvieProducts`, `habaAgentScenarios`, …).
 */

// ──────────────────────────────────────────────────────────────────
// HABA merchant (single tenant)
// ──────────────────────────────────────────────────────────────────
export type HabaMerchant = {
  id: string;                          // "mch_haba_001"
  legalName: string;                   // "HABA / ハーバー研究所"
  displayName: string;                 // "HABA"
  productLine: string;                 // "MARVIE Medical Foods"
  websiteUrl: string;
  primaryColor: string;                // tailwind brand-primary fallback (#hex)
  consumerSegments: string[];          // ["控糖人群", "减脂人群", …]
  b2bSegments: string[];               // ["药局", "医院营养科", …]
  defaultPaymentProject: string;       // "prod"
  paymentMerchantId: string;           // 商户租户 ID
};

// ──────────────────────────────────────────────────────────────────
// MARVIE products
// ──────────────────────────────────────────────────────────────────
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
  id: string;                          // stable slug for refs
  sku: string;                         // "MARVIE-LQ-200" — what shows on invoices
  name: string;                        // 商品全名
  shortName: string;                   // 卡片标题用
  category: ProductCategory;
  tags: ProductTag[];
  priceJpy: number;                    // MOCK
  caloriesPerServing: { value: number; unit: "kcal"; servingLabel: string };
  sweetnessRatioToSugar?: number;      // 200 = 200× 砂糖；undefined for non-sweetener
  ingredients: string[];               // ["赤藓糖醇", "甜菊糖苷"]
  imageEmoji: string;                  // 占位 emoji
  shortPitch: string;                  // 一句话卖点（卡片副标）
  longDescription: string;             // 详情段落
  inventorySnapshot?: { storeName: string; qty: number }[];   // B2B pharmacy 场景用
};

// ──────────────────────────────────────────────────────────────────
// Agent dialogue scenarios + recommendations
// ──────────────────────────────────────────────────────────────────
export type AgentPersona =
  | "c_concierge"
  | "b2b_pharmacy"
  | "b2b_hospital"
  | "b2b_dietitian"
  | "b2b_ec_partner";

export type Recommendation = {
  productId: MarvieProduct["id"];
  /** UI renders as bullet list; ≥ 3 维度（卡路里/甜度/场景/配方兼容 …） */
  reasons: string[];
  badge?: "Best for Diabetic" | "Heat Stable" | "Editor's Pick" | "Elderly Friendly" | "Most Popular";
  /** points into bundleSuggestions */
  bundleSuggestionId?: string;
};

export type BundleSuggestion = {
  id: string;
  productIds: MarvieProduct["id"][];
  bundlePriceJpy: number;              // 折后
  originalTotalJpy: number;
  saveLabel: string;                   // "节约 ¥180"
  pitch: string;                       // 一句话场景
};

/** UI 按钮 — Agent 输出末尾 CTA 列表 */
export type AgentCta = {
  label: string;
  kind:
    | "add_to_cart"          // C 端：加入购物车
    | "ask_more"             // C 端：换个角度
    | "recommend_to_client"  // 药局：推荐给顾客
    | "print"                // 药局：打印小票
    | "copy_to_client"       // 营养师：复制到客户邮件
    | "embed_snippet";       // EC 合作方：复制嵌入代码
};

export type HabaAgentScenario = {
  id: string;
  persona: AgentPersona;
  /** 卡片标题（teaser） */
  title: string;
  /** Agent 接到的完整用户提问（or 程序化 context） */
  userPrompt: string;
  /** Persona-shaped 一句开场 */
  agentOpening: string;
  recommendations: Recommendation[];
  closingCtas: AgentCta[];
  /** B2B 调用计费提示用 */
  billsAsB2bCall?: boolean;
  /** 显示警告/兜底（如超额、范围外、库存不足） */
  warning?: { kind: "out_of_scope" | "out_of_stock" | "quota_exceeded"; text: string };
};

// ──────────────────────────────────────────────────────────────────
// Token AI Resale plans
// ──────────────────────────────────────────────────────────────────
export type TokenResalePlanId = "starter" | "growth" | "enterprise";

export type TokenResalePlan = {
  id: TokenResalePlanId;
  displayName: string;                 // "Starter"
  monthlyTokenQuota: number;           // 10_000
  /** ¥-per-Token under base quota */
  pricePerTokenJpy: number;
  /** monthly base fee */
  monthlyBaseFeeJpy: number;
  targetPersona: string;               // "单店药局 / 独立营养师"
  marketingLine: string;               // "够日均 200 次顾客咨询"
  features: string[];                  // ["SDK 接入", "MCP 接口", ...]
  /** the highlighted card on the resale page */
  recommended?: boolean;
};

// ──────────────────────────────────────────────────────────────────
// B2B Partner cases (the buyers of HABA AI Advisor resale)
// ──────────────────────────────────────────────────────────────────
export type B2BPartnerId =
  | "pharmacy"
  | "hospital_dietitian"
  | "freelance_dietitian"
  | "ec_partner";

export type EmbedTechnique =
  | "Web 嵌入"
  | "API 直调"
  | "SDK + 自有 SaaS"
  | "MCP 工具调用";

export type B2BPartnerCase = {
  id: B2BPartnerId;
  /** 中文短标签 */
  partnerKind: "药局" | "医院营养指导" | "独立营养师" | "合作电商";
  icon: string;                        // emoji 占位
  valueProp: string;                   // 一句话价值主张
  embedTechnique: EmbedTechnique;
  sampleScenarioId: HabaAgentScenario["id"];
  monthlyCallVolume: number;           // 月均调用量（参考值）
  recommendedPlanId: TokenResalePlanId;
};

// ──────────────────────────────────────────────────────────────────
// x402 payment step diagrams (two flavours)
// ──────────────────────────────────────────────────────────────────
/**
 * Consumer-facing payment-flow actor labels. Intentionally vendor-neutral:
 * the upstream payment gateway / settlement service / public chain are real
 * external integrations, but HABA's site does not expose those vendors by
 * name. See docs/haba-technical-plan §5.x on actor-name policy.
 */
export type PaymentActorKind =
  | "haba"          // HABA 站点 / SDK
  | "gateway"       // 支付通道（HABA 接入的上游网关，对消费者不署名）
  | "settler"       // 链上结算执行层（同上）
  | "chain"         // 公链（USDC SPL）
  | "customer";     // 终端消费者（场景 B）

export type X402PaymentStep = {
  n: number;                           // 1..8
  fromActor: PaymentActorKind;
  toActor: PaymentActorKind;
  label: string;                       // 协议层动作（"POST /v1/payments"）
  note: string;                        // 一句解释
  detailZh?: string;                   // 富文案，UI 工具提示用
};
