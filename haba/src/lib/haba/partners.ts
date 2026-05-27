// B2B partner cases — MOCK · NOT FOR PRICING REFERENCE.
//
// 4 partners (haba-demo-requirements §6.6). Each links to a scenario in
// scenarios.ts and a recommended plan in resale.ts — the UI uses these
// to drive its "see partner / see dialogue / see plan" cross-nav.

import type { B2BPartnerCase } from "./types";

export const habaB2BPartners: readonly B2BPartnerCase[] = [
  {
    id: "pharmacy",
    partnerKind: "药局",
    icon: "🏪",
    valueProp:
      "药局前台扫顾客卡 → 调用 HABA AI Advisor 一键给糖友顾客推商品 + 店内现货",
    embedTechnique: "SDK + 自有 SaaS",
    sampleScenarioId: "pharmacy_counter",
    monthlyCallVolumeDemo: 32_000,
    recommendedPlanId: "growth",
  },
  {
    id: "hospital_dietitian",
    partnerKind: "医院营养指导",
    icon: "🏥",
    valueProp:
      "医院营养科出院饮食单 → Advisor 自动生成控糖一周方案 + 商品清单 + 患者邮件",
    embedTechnique: "API 直调",
    sampleScenarioId: "hospital_dietitian_plan",
    monthlyCallVolumeDemo: 8_500,
    recommendedPlanId: "enterprise",
  },
  {
    id: "freelance_dietitian",
    partnerKind: "独立营养师",
    icon: "🥗",
    valueProp:
      "独立营养师工作台 → 一键生成客户餐食 + 商品建议 + 客户专属购物车链接",
    embedTechnique: "MCP 工具调用",
    sampleScenarioId: "freelance_dietitian_clinic",
    monthlyCallVolumeDemo: 1_200,
    recommendedPlanId: "starter",
  },
  {
    id: "ec_partner",
    partnerKind: "合作电商",
    icon: "🛒",
    valueProp:
      "合作电商首页嵌入「AI 健康助手」widget → 访客对话直接转化购买，按调用量分账",
    embedTechnique: "Web 嵌入",
    sampleScenarioId: "ec_partner_widget",
    monthlyCallVolumeDemo: 215_000,
    recommendedPlanId: "enterprise",
  },
] as const satisfies readonly B2BPartnerCase[];

export function getPartnerById(id: B2BPartnerCase["id"]): B2BPartnerCase | undefined {
  return habaB2BPartners.find((p) => p.id === id);
}
