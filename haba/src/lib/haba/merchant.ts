// HABA merchant single source of truth.
// Touch this file (and ONLY this file) when the brand/identity changes.
// MOCK · NOT FOR PRICING REFERENCE.

import type { HabaMerchant } from "./types";

export const habaMerchant: HabaMerchant = {
  id: "mch_haba_001",
  legalName: "HABA / ハーバー研究所",
  displayName: "HABA",
  productLine: "MARVIE Medical Foods",
  websiteUrl: "https://www.haba.example",
  primaryColor: "#0F9D58",
  consumerSegments: [
    "控糖人群（糖尿病/糖耐量异常）",
    "减脂人群",
    "老年慢病护理家庭",
    "孕产期需要控糖的人群",
  ],
  b2bSegments: [
    "药局",
    "医院营养指导科",
    "独立营养师 / 健身教练",
    "健康食品垂直电商",
  ],
  defaultPaymentProject: "prod",
  paymentMerchantId: "mch_haba_001",
};
