// Agent dialogue scenarios — MOCK · NOT FOR PRICING REFERENCE.
//
// 9 scenarios cover the journeys in haba-agent-design §3:
//   - 5× C-end (c_concierge): 控糖家庭 / 替砂糖烘焙 / 早餐果酱 / 减脂零食 / 老年护理
//   - 4× B2B (pharmacy / hospital / dietitian / ec_partner)
// Bundles are referenced by id from Recommendation.bundleSuggestionId.

import type { BundleSuggestion, HabaAgentScenario } from "./types";

// ──────────────────────────────────────────────────────────────────
// Bundle suggestions (referenced from scenarios)
// ──────────────────────────────────────────────────────────────────
export const bundleSuggestions: readonly BundleSuggestion[] = [
  {
    id: "bundle_pharmacy_pair",
    productIds: ["marvie_liquid_200ml", "marvie_powder_250g"],
    originalTotalJpy: 1_580 + 980, // 2,560
    bundlePriceJpy: 2_380,
    saveLabel: "节约 ¥180",
    pitch: "饮品 + 料理双场景，一次买齐",
  },
  {
    id: "bundle_breakfast_trio",
    productIds: ["marvie_jam_blueberry", "marvie_jam_strawberry", "marvie_jam_yuzu"],
    originalTotalJpy: 720 + 720 + 780, // 2,220
    bundlePriceJpy: 1_980,
    saveLabel: "节约 ¥240",
    pitch: "3 瓶尝鲜装，一周早餐不重样",
  },
  {
    id: "bundle_baker_kit",
    productIds: ["marvie_powder_250g", "marvie_cooking_aid_500g", "marvie_liquid_200ml"],
    originalTotalJpy: 980 + 1_780 + 1_580, // 4,340
    bundlePriceJpy: 3_780,
    saveLabel: "节约 ¥560",
    pitch: "烘焙工坊 / 营养师工作室开店套装",
  },
  {
    id: "bundle_diet_snack",
    productIds: ["marvie_candy_mix_80g", "marvie_jam_blueberry"],
    originalTotalJpy: 580 + 720, // 1,300
    bundlePriceJpy: 1_180,
    saveLabel: "节约 ¥120",
    pitch: "减脂期口腹之欲组合",
  },
] as const satisfies readonly BundleSuggestion[];

// ──────────────────────────────────────────────────────────────────
// Agent dialogue scenarios
// ──────────────────────────────────────────────────────────────────
export const habaAgentScenarios: readonly HabaAgentScenario[] = [
  // ── C-end 1: 控糖家庭 ────────────────────────────────────────
  {
    id: "control_sugar_family",
    persona: "c_concierge",
    title: "我想给糖尿病家人买低卡甜味料",
    userPrompt: "我想给糖尿病家人买低卡甜味料，最好可以做料理也能直接放饮料里。",
    agentOpening: "我帮您找适合糖友家庭的料理 + 饮品双用甜味料。建议看下面 3 款：",
    recommendations: [
      {
        productId: "marvie_liquid_200ml",
        badge: "Best for Diabetic",
        reasons: [
          "0 kcal / 5ml — 凉热饮量小好控",
          "甜度约砂糖 200 倍，一两滴足够",
          "液体形态，冷水也能瞬间溶解",
        ],
      },
      {
        productId: "marvie_powder_250g",
        reasons: [
          "1.5 kcal/g，比砂糖卡路里低 70%",
          "颗粒和砂糖一致，1:1 替换原食谱不用换勺",
          "烘焙 180℃ 不焦化，煮甜煮物也能用",
        ],
      },
      {
        productId: "marvie_jam_strawberry",
        reasons: [
          "13 kcal/大匙，传统果酱卡路里的 1/3",
          "无添加蔗糖，适合早餐",
          "草莓本味突出，老少都接受",
        ],
        bundleSuggestionId: "bundle_pharmacy_pair",
      },
    ],
    closingCtas: [
      { label: "全部加入购物车", kind: "add_to_cart" },
      { label: "我想再看其他场景", kind: "ask_more" },
    ],
  },

  // ── C-end 2: 替砂糖烘焙 ──────────────────────────────────────
  {
    id: "replace_sugar_baking",
    persona: "c_concierge",
    title: "做烘焙想替代砂糖，要好换算、不要后味",
    userPrompt: "我做烘焙想替代砂糖，量要好换算，不要有奇怪后味。",
    agentOpening: "烘焙最关键是 1:1 替换 + 耐高温不变色，我帮您挑了 2 款：",
    recommendations: [
      {
        productId: "marvie_powder_250g",
        badge: "Heat Stable",
        reasons: [
          "1:1 替换砂糖，原食谱直接搬过来",
          "烘焙 180℃ 不焦化，戚风/曲奇通用",
          "盲测后味评分 8.4 / 10（社内 50 人）",
        ],
      },
      {
        productId: "marvie_cooking_aid_500g",
        badge: "Editor's Pick",
        reasons: [
          "大袋装，烘焙工坊性价比约 80%",
          "与 250g 装配方完全相同",
          "适合月度烘焙课、订阅式食谱包",
        ],
        bundleSuggestionId: "bundle_baker_kit",
      },
    ],
    closingCtas: [
      { label: "加入购物车", kind: "add_to_cart" },
      { label: "看用户烘焙食谱", kind: "ask_more" },
    ],
  },

  // ── C-end 3: 早餐果酱 ───────────────────────────────────────
  {
    id: "breakfast_jam_pick",
    persona: "c_concierge",
    title: "早餐想吃低卡果酱，搭配吐司或酸奶",
    userPrompt: "早餐想吃低卡果酱，搭配吐司或酸奶。",
    agentOpening: "HABA 的低卡 Jam 系列 3 种口味，按糖度从低到高：",
    recommendations: [
      {
        productId: "marvie_jam_blueberry",
        reasons: [
          "11 kcal/大匙 — 三款中最低",
          "酸度高，配厚切吐司、希腊酸奶",
          "抗氧化高，适合长期早餐",
        ],
      },
      {
        productId: "marvie_jam_strawberry",
        reasons: [
          "13 kcal/大匙",
          "经典口味，全家接受度最高",
          "无添加蔗糖",
        ],
      },
      {
        productId: "marvie_jam_yuzu",
        reasons: [
          "14 kcal/大匙",
          "日本国产柚子，香气足",
          "可加苏打水做无糖特调饮品",
        ],
        bundleSuggestionId: "bundle_breakfast_trio",
      },
    ],
    closingCtas: [
      { label: "3 瓶尝鲜装加入购物车", kind: "add_to_cart" },
      { label: "我想看更多搭配", kind: "ask_more" },
    ],
  },

  // ── C-end 4: 减脂零食 ───────────────────────────────────────
  {
    id: "weight_loss_snack",
    persona: "c_concierge",
    title: "减脂期间想要无负担的零食",
    userPrompt: "减脂期间想要无负担的零食，最好不是只有蛋白棒一种。",
    agentOpening: "减脂期解嘴馋首选低卡糖 + 低卡果酱，我挑了 2 款最受好评的：",
    recommendations: [
      {
        productId: "marvie_candy_mix_80g",
        badge: "Most Popular",
        reasons: [
          "12 kcal/颗，4 口味混装不会吃腻",
          "无添加蔗糖、零脂肪",
          "便携 80g 装，包里随时一颗",
        ],
      },
      {
        productId: "marvie_jam_blueberry",
        reasons: [
          "11 kcal/大匙，配希腊酸奶等于一份高蛋白甜点",
          "抗氧化",
          "和椰子片/燕麦组合做减脂 granola",
        ],
        bundleSuggestionId: "bundle_diet_snack",
      },
    ],
    closingCtas: [
      { label: "减脂组合加入购物车", kind: "add_to_cart" },
      { label: "我想看营养师餐食建议", kind: "ask_more" },
    ],
  },

  // ── C-end 5: 老年家庭护理 ────────────────────────────────────
  {
    id: "elderly_care",
    persona: "c_concierge",
    title: "给家里老人控糖，配方要简单好用",
    userPrompt: "给家里 70 多岁的老人控糖，配方要简单，他们看不清小字。",
    agentOpening: "老年家庭推荐量小好控、操作直观的两款：",
    recommendations: [
      {
        productId: "marvie_liquid_200ml",
        badge: "Elderly Friendly",
        reasons: [
          "液体一滴定量，无需称量",
          "0 kcal，加入味噌汤/汤药都不影响",
          "瓶身大字标识，老人易看",
        ],
      },
      {
        productId: "marvie_candy_mix_80g",
        reasons: [
          "12 kcal/颗，独立分装糖纸防误食",
          "口味多样，老人不易腻",
          "可作为低糖小零食代替血糖糖",
        ],
      },
    ],
    closingCtas: [
      { label: "加入购物车", kind: "add_to_cart" },
      { label: "我想看糖尿病饮食套装", kind: "ask_more" },
    ],
  },

  // ── B2B 1: 药局前台 ─────────────────────────────────────────
  {
    id: "pharmacy_counter",
    persona: "b2b_pharmacy",
    title: "药局前台 · 顾客问代糖产品",
    userPrompt:
      "[context] store=ABC 药局梅田店, customer_age=60+\n" +
      "顾客：医生让少糖，老婆让来买代糖，家里要泡咖啡也要煮甜煮物。",
    agentOpening: "60+ / 控糖家庭 / 饮品 + 料理双场景，建议：",
    recommendations: [
      {
        productId: "marvie_liquid_200ml",
        reasons: [
          "店内库存：梅田店 3 瓶（实时）",
          "0 kcal，咖啡一两滴",
          "甜度约砂糖 200 倍，老人易控量",
        ],
      },
      {
        productId: "marvie_powder_250g",
        reasons: [
          "店内库存：梅田店 8 包",
          "炒菜煮物 1:1 替换砂糖",
          "颗粒口感家人更易接受",
        ],
        bundleSuggestionId: "bundle_pharmacy_pair",
      },
    ],
    closingCtas: [
      { label: "推荐给顾客", kind: "recommend_to_client" },
      { label: "打印小票", kind: "print" },
    ],
    billsAsB2bCall: true,
  },

  // ── B2B 2: 医院营养指导科 ────────────────────────────────────
  {
    id: "hospital_dietitian_plan",
    persona: "b2b_hospital",
    title: "医院营养科 · 慢病出院控糖一周餐食",
    userPrompt:
      "[context] dept=营养指导科, client_profile={age:62, dx:糖尿病前期, goal:出院后控糖, restrictions:[]}\n" +
      "营养师：给患者出一周早餐与零食建议，避免砂糖、要可执行。",
    agentOpening: "为患者生成一周早餐 + 零食控糖方案（每份约 280–360 kcal）：",
    recommendations: [
      {
        productId: "marvie_cooking_aid_500g",
        reasons: [
          "营养科食堂烘焙/煮粥 1:1 替糖",
          "大袋适合 5–10 患者周量",
          "1.5 kcal/g — 厨房不用换勺",
        ],
      },
      {
        productId: "marvie_jam_blueberry",
        reasons: [
          "11 kcal/大匙，早餐吐司可控总糖摄入",
          "抗氧化对慢病人群有益",
          "无添加蔗糖",
        ],
      },
      {
        productId: "marvie_candy_mix_80g",
        reasons: [
          "12 kcal/颗，应对患者低血糖应急以外的口腹之欲",
          "独立分装糖纸，每颗可控",
          "请结合患者临床用药指示",
        ],
      },
    ],
    closingCtas: [
      { label: "导出至患者出院饮食单", kind: "copy_to_client" },
      { label: "复制到病例邮件", kind: "copy_to_client" },
    ],
    billsAsB2bCall: true,
  },

  // ── B2B 3: 独立营养师 ───────────────────────────────────────
  {
    id: "freelance_dietitian_clinic",
    persona: "b2b_dietitian",
    title: "独立营养师 · 减脂客户一周餐食建议",
    userPrompt:
      "[context] client_profile={age:45, goal:减脂 5kg, restrictions:[乳糖不耐]}\n" +
      "营养师：给这位客户出一周早餐 + 下午茶建议，控糖、避乳制品。",
    agentOpening: "生成一周早餐 + 下午茶方案（每份约 320–380 kcal）：",
    recommendations: [
      {
        productId: "marvie_powder_250g",
        reasons: [
          "杂粮粥 + 燕麦控糖替换砂糖",
          "1:1 替换不影响家庭食谱口感",
          "避乳制品的早餐也可用",
        ],
      },
      {
        productId: "marvie_jam_blueberry",
        reasons: [
          "11 kcal/大匙，配豆奶/燕麦奶都和谐",
          "抗氧化对减脂期皮肤有益",
          "无乳制品",
        ],
      },
      {
        productId: "marvie_jam_yuzu",
        reasons: [
          "14 kcal/大匙",
          "下午茶可加苏打水做无糖柚子特调",
          "口味变化避免单调",
        ],
        bundleSuggestionId: "bundle_breakfast_trio",
      },
    ],
    closingCtas: [
      { label: "复制到客户邮件", kind: "copy_to_client" },
      { label: "加入客户专属购物车", kind: "add_to_cart" },
    ],
    billsAsB2bCall: true,
  },

  // ── B2B 4: 合作电商首页嵌入 ──────────────────────────────────
  {
    id: "ec_partner_widget",
    persona: "b2b_ec_partner",
    title: "合作电商首页 · 嵌入式 AI 健康助手",
    userPrompt:
      "[context] surface=ecommerce_home, widget=health_advisor\n" +
      "访客：最近在减肥，但是早上还是想吃面包配果酱怎么办？",
    agentOpening:
      "减脂期 + 早餐场景，可以用低卡果酱搭配，单次摄入仍可控：",
    recommendations: [
      {
        productId: "marvie_jam_blueberry",
        badge: "Most Popular",
        reasons: [
          "11 kcal/大匙 — 一片吐司涂量约 22 kcal",
          "无添加蔗糖",
          "适合每日早餐固定摄入",
        ],
      },
      {
        productId: "marvie_jam_strawberry",
        reasons: [
          "13 kcal/大匙",
          "经典口味，复购率最高",
          "周转快，发货快",
        ],
        bundleSuggestionId: "bundle_breakfast_trio",
      },
    ],
    closingCtas: [
      { label: "复制嵌入代码", kind: "embed_snippet" },
      { label: "加入合作方购物车", kind: "add_to_cart" },
    ],
    billsAsB2bCall: true,
  },
] as const satisfies readonly HabaAgentScenario[];

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────
export function getScenarioById(id: string): HabaAgentScenario | undefined {
  return habaAgentScenarios.find((s) => s.id === id);
}

export function getBundleById(id: string): BundleSuggestion | undefined {
  return bundleSuggestions.find((b) => b.id === id);
}

export function getConsumerScenarios(): HabaAgentScenario[] {
  return habaAgentScenarios.filter((s) => s.persona === "c_concierge");
}

export function getB2BScenarios(): HabaAgentScenario[] {
  return habaAgentScenarios.filter((s) => s.persona !== "c_concierge");
}
