// Token AI Resale plans — MOCK · NOT FOR PRICING REFERENCE.
//
// Three-tier structure mirrors haba-demo-requirements §4.2.
// resaleChainNarrative: the static prose used in TokenResaleSection / deck §13b.

import type { TokenResalePlan } from "./types";

export const tokenResalePlans: readonly TokenResalePlan[] = [
  {
    id: "starter",
    displayName: "Starter",
    monthlyTokenQuota: 10_000,
    pricePerTokenJpy: 3.0,
    monthlyBaseFeeJpy: 0,
    targetPersona: "单店药局 / 独立营养师",
    marketingLine: "够日均 200 次顾客咨询",
    features: [
      "SDK 接入（Python / Node 即将）",
      "MCP 工具调用",
      "调用日志保留 90 天",
      "标准 SLA（Best Effort）",
    ],
  },
  {
    id: "growth",
    displayName: "Growth",
    monthlyTokenQuota: 100_000,
    pricePerTokenJpy: 2.4,
    monthlyBaseFeeJpy: 5_000,
    targetPersona: "中型药局连锁 / 私立医院 / 工作室级营养师团队",
    marketingLine: "够 5–10 家门店共用",
    features: [
      "全部 Starter 功能",
      "子账户拆分（按门店 / 营养师 / 项目）",
      "调用日志保留 1 年",
      "可配置 prompt prefix（药局/医院/营养师皮肤）",
      "99.5% SLA",
    ],
    recommended: true,
  },
  {
    id: "enterprise",
    displayName: "Enterprise",
    monthlyTokenQuota: 1_000_000,
    pricePerTokenJpy: 1.6, // 议价；显示一个 demo 锚点
    monthlyBaseFeeJpy: 0,  // 议价，0 表示需要商务对接
    targetPersona: "大型药局连锁 / 公立医院 / 合作电商首页嵌入",
    marketingLine: "API + SLA + 数据回流报表",
    features: [
      "全部 Growth 功能",
      "专属 API 接入 + 定制 prompt context",
      "数据回流：调用、推荐、转化漏斗",
      "99.9% SLA + 故障应急通道",
      "合规支持：医疗数据脱敏、日本个人情报保护法对齐",
      "价格议价",
    ],
  },
] as const satisfies readonly TokenResalePlan[];

// ──────────────────────────────────────────────────────────────────
// Narrative used in UI sections + deck slide
// ──────────────────────────────────────────────────────────────────
export const resaleChainNarrative = {
  /** 一句话标题，用在 section 头部 */
  headline: "HABA AI Advisor — 把健康食品顾问能力按调用量卖给合作伙伴",

  /** 三段叙事，从 HABA 视角出发 */
  pitch: [
    "HABA 把多年积累的健康食品商品库 + 控糖话术 + 多 persona 配方，组装成「HABA AI Advisor」垂直能力。",
    "Advisor 按月度调用量打包；合作方按使用量预付 Token 配额，HABA 自动计量、对账、出报表。",
    "药局 / 医院 / 营养师 / 合作电商共享同一个 Advisor，只是嵌入形态不同(SDK / API / MCP / Web widget)。",
  ],

  /** 转售链路图节点 + 边 — 只显示 HABA 与下游合作方，HABA 内部基础设施不暴露 */
  chainDiagram: {
    nodes: [
      { id: "haba",      label: "HABA AI Advisor",   sub: "商品库 + 控糖话术 + 多 persona 配方" },
      { id: "pharmacy",  label: "药局",               sub: "前台咨询调用" },
      { id: "hospital",  label: "医院",               sub: "营养指导调用" },
      { id: "dietitian", label: "营养师",             sub: "餐食方案调用" },
      { id: "ec",        label: "合作电商",           sub: "首页 widget 嵌入" },
    ] as const,
    edges: [
      { from: "haba", to: "pharmacy",  label: "按调用量付费" },
      { from: "haba", to: "hospital",  label: "按调用量付费" },
      { from: "haba", to: "dietitian", label: "按调用量付费" },
      { from: "haba", to: "ec",        label: "按调用量付费" },
    ] as const,
  },

  /** Demo 数据用 — 当月 HABA 给 B2B 卖出去的总调用数（mock） */
  thisMonthResaleCallsDemo: 18_432,
  thisMonthResaleRevenueJpyDemo: 44_320,
} as const;

export function getPlanById(id: TokenResalePlan["id"]): TokenResalePlan | undefined {
  return tokenResalePlans.find((p) => p.id === id);
}
