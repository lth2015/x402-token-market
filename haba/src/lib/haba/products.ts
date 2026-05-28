// MARVIE product catalog — MOCK · NOT FOR PRICING REFERENCE.
//
// Tag dictionary follows haba-agent-design §5.1. Recommender (`selectByTags`,
// `pickByScenarioKey`) is a simple deterministic mapping — no LLM call.
//
// 7 SKUs spanning the 5 product categories in the requirements:
//   - 2× sweetener (liquid / powder)
//   - 1× cooking-aid (bakery powder, 大袋)
//   - 3× jam (strawberry / blueberry / yuzu)
//   - 1× candy mix
// Adding more is safe; scenarios.ts only references the ids defined here.

import type { MarvieProduct, ProductTag } from "./types";

export const marvieProducts: readonly MarvieProduct[] = [
  // ── Sweeteners ───────────────────────────────────────────────
  {
    id: "marvie_liquid_200ml",
    sku: "MARVIE-LQ-200",
    name: "MARVIE Liquid Sweetener · 200ml",
    shortName: "液体甜味料 200ml",
    category: "sweetener_liquid",
    tags: ["drink", "cooking", "for_diabetic_household", "for_elderly", "zero_calorie", "cold_soluble"],
    priceJpy: 1_580,
    caloriesPerServing: { value: 0, unit: "kcal", servingLabel: "5ml（约 1 小匙）" },
    sweetnessRatioToSugar: 200,
    ingredients: ["精制水", "赤藓糖醇", "甜菊糖苷", "枸橼酸"],
    imageEmoji: "🧴",
    shortPitch: "0 kcal · 凉热饮直接滴，不结块",
    longDescription:
      "甜度约砂糖的 200 倍，液体形态最适合咖啡、红茶、酸奶等饮品。冷热水都能瞬间溶解，没有粉末甜味料偶尔出现的结块问题。",
    inventoryDemo: [
      { storeName: "ABC 药局梅田店", qty: 3 },
      { storeName: "ABC 药局难波店", qty: 0 },
    ],
  },
  {
    id: "marvie_powder_250g",
    sku: "MARVIE-PW-250",
    name: "MARVIE Powder Sweetener · 250g",
    shortName: "粉末甜味料 250g",
    category: "sweetener_powder",
    tags: ["cooking", "bakery", "replace_sugar_1_to_1", "bakery_heat_stable",
           "for_diabetic_household", "low_calorie"],
    priceJpy: 980,
    caloriesPerServing: { value: 1.5, unit: "kcal", servingLabel: "1g" },
    sweetnessRatioToSugar: 3,
    ingredients: ["赤藓糖醇", "甜菊糖苷"],
    imageEmoji: "🧂",
    shortPitch: "1:1 替砂糖 · 烘焙 180℃ 不焦化",
    longDescription:
      "颗粒大小与砂糖一致，**直接 1:1 替换原食谱不用换勺子**。烘焙至 180℃ 不焦化，社内 50 人盲测后味评分 8.4/10。",
    inventoryDemo: [
      { storeName: "ABC 药局梅田店", qty: 8 },
      { storeName: "ABC 药局难波店", qty: 5 },
    ],
  },
  // ── Cooking aid ──────────────────────────────────────────────
  {
    id: "marvie_cooking_aid_500g",
    sku: "MARVIE-CK-500",
    name: "MARVIE Cooking Aid Sweetener · 500g（業務用）",
    shortName: "烘焙料理替糖 500g",
    category: "cooking_aid",
    tags: ["cooking", "bakery", "bakery_heat_stable", "replace_sugar_1_to_1",
           "for_dietitian", "low_calorie"],
    priceJpy: 1_780,
    caloriesPerServing: { value: 1.5, unit: "kcal", servingLabel: "1g" },
    sweetnessRatioToSugar: 3,
    ingredients: ["赤藓糖醇", "甜菊糖苷"],
    imageEmoji: "📦",
    shortPitch: "大袋装 · 营养师工作室/烘焙工坊适用",
    longDescription:
      "粉末甜味料的 500g 大袋装，适合营养师工作室、月度烘焙课、企业团购。性价比约普通装的 80%，配方与 250g 完全一致。",
  },
  // ── Jams ─────────────────────────────────────────────────────
  {
    id: "marvie_jam_strawberry",
    sku: "MARVIE-JM-STR",
    name: "MARVIE Low-Cal Strawberry Jam · 200g",
    shortName: "低卡草莓果酱",
    category: "jam",
    tags: ["breakfast", "low_calorie", "no_added_sugar"],
    priceJpy: 720,
    caloriesPerServing: { value: 13, unit: "kcal", servingLabel: "1 大匙（约 18g）" },
    ingredients: ["草莓", "赤藓糖醇", "果胶", "柠檬汁"],
    imageEmoji: "🍓",
    shortPitch: "13 kcal/大匙 · 传统果酱卡路里的 1/3",
    longDescription:
      "经典款，老少都接受。无添加蔗糖，用赤藓糖醇调味，能保留草莓本身的酸甜。",
  },
  {
    id: "marvie_jam_blueberry",
    sku: "MARVIE-JM-BLU",
    name: "MARVIE Low-Cal Blueberry Jam · 200g",
    shortName: "低卡蓝莓果酱",
    category: "jam",
    tags: ["breakfast", "low_calorie", "no_added_sugar"],
    priceJpy: 720,
    caloriesPerServing: { value: 11, unit: "kcal", servingLabel: "1 大匙（约 18g）" },
    ingredients: ["蓝莓", "赤藓糖醇", "果胶", "柠檬汁"],
    imageEmoji: "🫐",
    shortPitch: "11 kcal/大匙 · 抗氧化高、酸度适中",
    longDescription:
      "酸度比草莓款略高，搭配厚切吐司或希腊酸奶尤其合适。",
  },
  {
    id: "marvie_jam_yuzu",
    sku: "MARVIE-JM-YUZ",
    name: "MARVIE Marmalade Yuzu Jam · 200g",
    shortName: "低卡柚子果酱",
    category: "jam",
    tags: ["breakfast", "low_calorie"],
    priceJpy: 780,
    caloriesPerServing: { value: 14, unit: "kcal", servingLabel: "1 大匙（约 18g）" },
    ingredients: ["日本国产柚子", "赤藓糖醇", "果胶"],
    imageEmoji: "🍊",
    shortPitch: "日本国产柚子 · 苏打水特调",
    longDescription:
      "和歌山县产柚子，可作为吐司涂酱，也可加苏打水做无糖特调饮品。",
  },
  // ── Candy ────────────────────────────────────────────────────
  {
    id: "marvie_candy_mix_80g",
    sku: "MARVIE-CD-MIX",
    name: "MARVIE Low-Cal Candy Mix · 80g",
    shortName: "低卡糖果混装 80g",
    category: "candy",
    tags: ["for_weight_loss", "low_calorie", "no_added_sugar"],
    priceJpy: 580,
    caloriesPerServing: { value: 12, unit: "kcal", servingLabel: "1 颗（约 4g）" },
    ingredients: ["赤藓糖醇", "甜菊糖苷", "天然水果香精", "柠檬酸"],
    imageEmoji: "🍬",
    shortPitch: "12 kcal/颗 · 减脂期口腹之欲",
    longDescription:
      "苹果 / 柠檬 / 葡萄 / 梅子四种口味混装，单颗 12 kcal，减脂期"
      + "解嘴馋的低负担选择。",
  },
] as const satisfies readonly MarvieProduct[];

// ──────────────────────────────────────────────────────────────────
// Tiny tag-based recommender — agent-design §5.2 mapping in code form.
// Pure / deterministic; safe for SSR + tests.
// ──────────────────────────────────────────────────────────────────

export type RecallSortBy = "calories_asc" | "sweetness_asc" | "price_asc" | "popular_first";

/** Return products that carry ALL of the required tags (intersection). */
export function selectByTags(
  required: ProductTag[],
  sortBy: RecallSortBy = "popular_first",
): MarvieProduct[] {
  const matched = marvieProducts.filter((p) => required.every((t) => p.tags.includes(t)));
  return [...matched].sort((a, b) => {
    switch (sortBy) {
      case "calories_asc":
        return a.caloriesPerServing.value - b.caloriesPerServing.value;
      case "sweetness_asc":
        return (a.sweetnessRatioToSugar ?? 0) - (b.sweetnessRatioToSugar ?? 0);
      case "price_asc":
        return a.priceJpy - b.priceJpy;
      case "popular_first":
      default:
        // popularity = stable insertion order in this MOCK
        return 0;
    }
  });
}

export function getProductById(id: string): MarvieProduct | undefined {
  return marvieProducts.find((p) => p.id === id);
}
