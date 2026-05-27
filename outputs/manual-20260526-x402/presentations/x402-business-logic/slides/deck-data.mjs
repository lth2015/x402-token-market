export const W = 1280;
export const H = 720;

export const C = {
  ink: "#111827",
  muted: "#5B6472",
  faint: "#D8D2C4",
  paper: "#F7F3EA",
  panel: "#FFFFFF",
  blue: "#1D4ED8",
  cyan: "#0891B2",
  green: "#059669",
  amber: "#D97706",
  red: "#DC2626",
  dark: "#0E1726",
  dark2: "#172033",
  white: "#FFFFFF",
};

export const slides = [
  {
    kicker: "MANAGEMENT THESIS",
    title: "x402 的价值不在“能收 USDC”，而在把 Agent 的 Token 消耗变成可销售、可结算、可审计的商户服务。",
    note: "基于 proposal.md 与两版参考稿重构：面向经营决策者，而非技术评审。",
    type: "cover",
  },
  {
    kicker: "WHY NOW",
    title: "支付需求正在从“人点击结账”迁移到“Agent 在任务中连续付费”。",
    type: "shift",
    human: ["人工发起", "订单金额较高", "页面跳转确认", "按订单对账", "失败由人处理"],
    agent: ["机器发起", "小额高频", "API 即时确认", "按调用计费", "失败需自动恢复"],
    insight: "Agent Commerce 要求支付系统同时支持低摩擦、实时状态、细粒度计费和完整留痕。x402 只是入口，商业产品必须覆盖后续 Token 与账务闭环。",
  },
  {
    kicker: "STRATEGIC FIT",
    title: "Netstars 的优势与市场需求高度匹配：支付入口、稳定币执行、Token 销售与商户账务可以被打包成同一服务。",
    type: "matrix",
    headers: ["市场需求", "Netstars / Wea 现有基础", "商业含义"],
    rows: [
      ["高频微额支付", "Web2 聚合支付经验 + x402 网关", "成为 Agent 支付入口，而非单纯收款通道"],
      ["稳定币结算", "Wea Japan 链上执行 + Solana / USDC PoC", "把链上复杂度封装给商户"],
      ["AI Token 获取", "OpenAI / xAI / Google 等 Token 销售授权", "支付与 AI 消耗同包销售"],
      ["账务与可追溯", "Token 系统承接余额、消耗、发票、结算", "形成持续运营数据与企业客户信任"],
    ],
  },
  {
    kicker: "OFFER DESIGN",
    title: "对外销售的不是协议，而是一套“Agent Commerce Payment + AI Token Ops”服务包。",
    type: "stack",
    layers: [
      ["客户接入层", "SDK / API / MCP", "让 Agent 和商户系统用统一接口购买、查询、消耗 Token"],
      ["支付网关层", "x402 Gateway", "创建支付要求、校验证明、处理状态回调与异常"],
      ["稳定币执行层", "Wea / Solana / USDC", "链上交易、确认、凭证、结算状态"],
      ["Token 运营层", "Token System", "余额、扣减、套餐、发票、账单、告警、报表"],
    ],
    monetization: ["网关服务费", "Token 销售毛利", "商户管理费", "结算与对账增值服务"],
  },
  {
    kicker: "DEMO PROOF",
    title: "Demo 必须证明一条收入链，而不是只证明一次链上支付。",
    type: "chain",
    steps: [
      ["支付触发", "Agent 余额不足，请求购买 10,000 Token"],
      ["x402 支付", "Netstars 返回 402 支付要求，USDC 支付完成"],
      ["Token 入账", "Token 账本增加余额，记录订单与交易哈希"],
      ["AI 调用", "Agent 消耗 Token 调用授权模型完成业务任务"],
      ["账务闭环", "商户后台展示消耗、余额、发票与结算状态"],
    ],
    proof: "结尾画面必须同时出现：支付成功、Token 增加、AI 任务完成、账务可查询。",
  },
  {
    kicker: "OPERATING MODEL",
    title: "客户只面对 Netstars；链上执行和 AI Token 供给在后台协作完成。",
    type: "roles",
    roles: [
      ["商户 / Agent", "发起购买、调用模型、查询余额", C.amber],
      ["Netstars", "统一签约、SDK/API/MCP、x402 网关、Token 账本、账务后台", C.blue],
      ["Wea Japan", "Solana / USDC 执行、交易确认、链上凭证", C.green],
      ["AI Providers", "授权模型 Token 供给与调用服务", C.cyan],
    ],
    principle: "经营原则：客户侧不学习链、不处理私钥、不拼接多个后台；Netstars 负责把复杂协作包装成可购买的产品体验。",
  },
  {
    kicker: "COMMERCIAL CENTER",
    title: "Token 系统是商业化中心，因为它把一次支付变成持续用量、账单与客户运营。",
    type: "flywheel",
    nodes: ["购买套餐", "余额入账", "Agent 调用", "实时扣减", "账单/发票", "续费提醒"],
    side: [
      ["客户价值", "可控预算、可查余额、可追溯用量"],
      ["Netstars 价值", "持续交易、Token 毛利、账务数据、增值服务"],
      ["生态价值", "模型、Agent、商户与稳定币结算被同一账本连接"],
    ],
  },
  {
    kicker: "TRUST GATE",
    title: "企业客户购买的不是“自动支付”，而是可控、可审计、可恢复的自动支付。",
    type: "trust",
    controls: [
      ["客户侧", "SDK 签名、密钥轮换、Agent 权限、nonce"],
      ["网关侧", "订单幂等、支付要求有效期、Webhook 认证、风控"],
      ["链上侧", "USDC 交易哈希、确认状态、失败回滚、结算凭证"],
      ["账本侧", "余额流水、消耗明细、发票状态、审计报表"],
    ],
    risk: "Demo 建议展示一次失败或过期支付处理，证明系统不是只会展示“成功”。",
  },
  {
    kicker: "GTM WEDGE",
    title: "市场开拓应从“Token 消耗明确、跨语言/跨门店/跨系统任务频繁”的场景切入。",
    type: "gtm",
    segments: [
      ["机场 / 旅游零售", "多语言内容、库存建议、门店日报", "与稳定币 PoC 故事自然衔接"],
      ["跨境电商", "商品上架、客服、广告素材、价格监控", "Agent 高频调用与账务透明需求强"],
      ["SaaS / ISV", "把 AI Token 作为嵌入式能力销售给其商户", "可通过 API / MCP 放大渠道"],
    ],
    funnel: ["Demo 样板", "设计伙伴", "试点商户", "标准套餐", "渠道复制"],
  },
  {
    kicker: "ECOSYSTEM EXPANSION",
    title: "生态扩张的关键，是让各方都通过 Netstars 获得更低接入成本和更清楚的收益分配。",
    type: "ecosystem",
    center: "Netstars Agent Commerce Hub",
    items: [
      ["AI 模型提供方", "Token 销售与用量分发"],
      ["Agent 平台 / MCP", "工具化支付与余额查询"],
      ["商户 / ISV", "低门槛接入与统一账务"],
      ["Wea / 链上伙伴", "稳定币执行与结算网络"],
      ["金融 / 合规伙伴", "风控、审计、企业结算"],
    ],
    expansion: "从单一 Demo 扩展到多模型、多商户、多资产、多链，但前提是统一商户账户、统一账本与统一结算口径。",
  },
  {
    kicker: "ROADMAP",
    title: "产品路线要先证明商业闭环，再扩大技术边界。",
    type: "roadmap",
    phases: [
      ["0-1 个月", "样板 Demo", "完成机场零售 Agent 故事；展示支付、Token、AI 调用、账务闭环"],
      ["1-3 个月", "试点硬化", "SDK/API/MCP、异常处理、审计日志、Token 套餐与后台原型"],
      ["3-6 个月", "商业化包装", "商户合同、价格包、结算说明、运营报表、渠道材料"],
      ["6 个月+", "平台扩展", "多模型、多商户、多资产、多链；x402 能力并入 Token 系统"],
    ],
  },
  {
    kicker: "MANAGEMENT ASK",
    title: "建议把该项目定位为 Agent Commerce 支付样板，并批准三项经营动作。",
    type: "ask",
    asks: [
      ["锁定 Demo 口径", "用一个经营者能理解的场景讲清楚收入链：支付、Token、调用、账务。"],
      ["确认协作边界", "Netstars 面向客户统一承接；Wea Japan 执行链上支付；Token 系统沉淀账务。"],
      ["启动试点包装", "形成服务包、接口说明、后台原型、结算说明和首批设计伙伴清单。"],
    ],
    close: "下一步输出物：可演示系统、商户接入说明、支付与 Token 流程图、试点报价框架、经营后台原型。",
  },
];

export function setup(slide, dark = false) {
  slide.background.fill = dark ? C.dark : C.paper;
}

export function addShape(slide, x, y, width, height, opts = {}) {
  const s = slide.shapes.add({ geometry: opts.geometry || "rect" });
  s.position.set({ left: x, top: y, width, height });
  s.fill = opts.fill || C.panel;
  s.line = { fill: opts.line || opts.fill || C.panel, width: opts.lineWidth ?? 1 };
  if (opts.radius !== undefined) s.borderRadius = opts.radius;
  return s;
}

export function addText(slide, text, x, y, width, height, opts = {}) {
  const s = addShape(slide, x, y, width, height, {
    fill: opts.fill || (opts.dark ? C.dark : C.paper),
    line: opts.line || opts.fill || (opts.dark ? C.dark : C.paper),
    lineWidth: opts.lineWidth ?? 0,
  });
  s.text.set(text);
  s.text.typeface = opts.font || "Hiragino Sans";
  s.text.fontSize = opts.size || 22;
  s.text.color = opts.color || (opts.dark ? C.white : C.ink);
  s.text.alignment = opts.align || "left";
  s.text.verticalAlignment = opts.valign || "top";
  s.text.wrap = "square";
  s.text.insets = opts.insets || { top: 4, right: 6, bottom: 4, left: 6 };
  if (opts.bold) s.text.bold = true;
  if (opts.lineSpacing) s.text.lineSpacing = opts.lineSpacing;
  return s;
}

export function addRule(slide, x, y, width, color = C.faint, h = 1.5) {
  return addShape(slide, x, y, width, h, { fill: color, line: color, lineWidth: 0 });
}

export function addHeader(slide, item, index, dark = false) {
  addText(slide, item.kicker, 54, 34, 260, 28, {
    size: 12,
    color: dark ? "#92DCE5" : C.cyan,
    bold: true,
    dark,
  });
  addText(slide, item.title, 54, 70, 900, 92, {
    size: item.title.length > 44 ? 28 : 32,
    color: dark ? C.white : C.ink,
    bold: true,
    dark,
    lineSpacing: 1.08,
  });
  addRule(slide, 54, 166, 1172, dark ? "#2C374D" : C.faint, 1);
  addText(slide, String(index + 1).padStart(2, "0"), 1180, 38, 46, 22, {
    size: 12,
    color: dark ? "#AAB5C8" : C.muted,
    align: "right",
    dark,
  });
}

export function addFooter(slide, index, dark = false) {
  addRule(slide, 54, 666, 1172, dark ? "#2C374D" : C.faint, 1);
  addText(slide, "Source: proposal.md, codex reference deck, claude reference deck | Internal discussion draft", 54, 674, 760, 22, {
    size: 10,
    color: dark ? "#97A2B7" : C.muted,
    dark,
  });
  addText(slide, `X402 Token Market  |  ${String(index + 1).padStart(2, "0")}`, 990, 674, 236, 22, {
    size: 10,
    color: dark ? "#97A2B7" : C.muted,
    align: "right",
    dark,
  });
}

export function pill(slide, label, x, y, w, color, dark = false) {
  const s = addShape(slide, x, y, w, 30, { fill: dark ? C.dark2 : "#F3F7F8", line: color, lineWidth: 1 });
  s.text.set(label);
  s.text.fontSize = 12;
  s.text.bold = true;
  s.text.color = color;
  s.text.alignment = "center";
  s.text.verticalAlignment = "middle";
  s.text.insets = { top: 4, right: 8, bottom: 4, left: 8 };
  return s;
}

export function sectionLabel(slide, text, x, y, color) {
  addText(slide, text, x, y, 260, 24, { size: 12, color, bold: true, fill: C.paper, line: C.paper });
}

export function drawArrow(slide, x1, y, x2, color = C.cyan) {
  addRule(slide, x1, y, x2 - x1 - 12, color, 2);
  const head = slide.shapes.add({ geometry: "triangle" });
  head.position.set({ left: x2 - 16, top: y - 6, width: 14, height: 14 });
  head.fill = color;
  head.line = { fill: color, width: 0 };
  head.position.rotation = 90;
  return head;
}

export async function buildSlide(presentation, index) {
  const item = slides[index];
  const slide = presentation.slides.add();
  const dark = item.type === "cover" || item.type === "ask";
  setup(slide, dark);

  if (item.type !== "cover") addHeader(slide, item, index, dark);

  renderers[item.type](slide, item, index);
  addFooter(slide, index, dark);
  return slide;
}

const renderers = {
  cover(slide, item) {
    addText(slide, "X402 TOKEN MARKET", 64, 54, 360, 24, { size: 13, color: "#92DCE5", bold: true, dark: true });
    addText(slide, item.title, 64, 118, 900, 210, { size: 38, color: C.white, bold: true, dark: true, lineSpacing: 1.08 });
    addText(slide, "经营决策版 | Agent Commerce 支付与 AI Token 运营服务", 66, 344, 720, 32, { size: 18, color: "#CBD5E1", dark: true });
    const rails = [
      ["市场问题", "Agent 发起小额高频支付"],
      ["核心优势", "Web2 PSP + Web3 稳定币 + AI Token 销售"],
      ["Demo 目的", "证明可销售、可结算、可追溯的商业闭环"],
    ];
    rails.forEach((r, i) => {
      const x = 66 + i * 374;
      addShape(slide, x, 470, 330, 104, { fill: C.dark2, line: "#2D3A53", lineWidth: 1 });
      addText(slide, r[0], x + 18, 488, 110, 20, { size: 12, color: "#92DCE5", bold: true, dark: true, fill: C.dark2 });
      addText(slide, r[1], x + 18, 520, 286, 38, { size: 20, color: C.white, bold: true, dark: true, fill: C.dark2 });
    });
    pill(slide, "Netstars-facing commercial narrative", 64, 612, 292, C.cyan, true);
  },
  shift(slide, item) {
    addText(slide, "传统支付任务", 100, 210, 280, 34, { size: 20, bold: true, color: C.ink });
    addText(slide, "Agent 支付任务", 824, 210, 280, 34, { size: 20, bold: true, color: C.ink });
    addShape(slide, 86, 260, 360, 260, { fill: "#FFFDFC", line: C.faint });
    addShape(slide, 794, 260, 360, 260, { fill: "#EFF9FA", line: "#B7E3E7" });
    item.human.forEach((t, i) => addText(slide, t, 118, 288 + i * 42, 280, 28, { size: 18, color: C.muted, fill: "#FFFDFC" }));
    item.agent.forEach((t, i) => addText(slide, t, 826, 288 + i * 42, 280, 28, { size: 18, color: C.ink, bold: true, fill: "#EFF9FA" }));
    drawArrow(slide, 470, 386, 768, C.cyan);
    addText(slide, "支付 job-to-be-done 改变", 492, 330, 250, 34, { size: 20, color: C.cyan, bold: true, align: "center" });
    addText(slide, item.insight, 170, 560, 940, 56, { size: 18, color: C.ink, bold: true, fill: C.paper, align: "center" });
  },
  matrix(slide, item) {
    const x = 70, y = 214, w = 1140;
    const col = [300, 420, 420];
    item.headers.forEach((h, i) => {
      addShape(slide, x + col.slice(0, i).reduce((a, b) => a + b, 0), y, col[i], 44, { fill: i === 0 ? C.dark : C.blue, line: C.paper, lineWidth: 2 });
      addText(slide, h, x + col.slice(0, i).reduce((a, b) => a + b, 0) + 16, y + 10, col[i] - 32, 20, { size: 15, color: C.white, bold: true, fill: i === 0 ? C.dark : C.blue });
    });
    item.rows.forEach((r, ri) => {
      const yy = y + 44 + ri * 82;
      r.forEach((cell, ci) => {
        const xx = x + col.slice(0, ci).reduce((a, b) => a + b, 0);
        addShape(slide, xx, yy, col[ci], 82, { fill: ri % 2 ? "#FFFEFB" : "#F2F6F7", line: C.paper, lineWidth: 2 });
        addText(slide, cell, xx + 14, yy + 15, col[ci] - 28, 44, { size: ci === 0 ? 17 : 15, color: ci === 0 ? C.ink : C.muted, bold: ci === 0, fill: ri % 2 ? "#FFFEFB" : "#F2F6F7" });
      });
    });
    addText(slide, "判断：这是一个“资产组合匹配市场需求”的机会，不只是单项技术领先。", 86, 594, 1020, 34, { size: 20, bold: true, color: C.blue });
  },
  stack(slide, item) {
    item.layers.forEach((l, i) => {
      const y = 220 + i * 82;
      const color = [C.blue, C.cyan, C.green, C.amber][i];
      addShape(slide, 96, y, 310, 62, { fill: color, line: color });
      addText(slide, l[0], 116, y + 11, 120, 18, { size: 14, color: C.white, bold: true, fill: color });
      addText(slide, l[1], 116, y + 30, 252, 26, { size: 18, color: C.white, bold: true, fill: color });
      addShape(slide, 430, y, 700, 62, { fill: "#FFFFFF", line: C.faint });
      addText(slide, l[2], 450, y + 15, 650, 30, { size: 18, color: C.ink, fill: "#FFFFFF" });
    });
    addText(slide, "收入桥", 90, 572, 92, 28, { size: 18, color: C.ink, bold: true });
    item.monetization.forEach((m, i) => pill(slide, m, 190 + i * 226, 570, 190, [C.blue, C.amber, C.green, C.cyan][i]));
  },
  chain(slide, item) {
    const colors = [C.amber, C.cyan, C.blue, C.green, C.ink];
    item.steps.forEach((s, i) => {
      const x = 72 + i * 232;
      addShape(slide, x, 236, 178, 156, { fill: "#FFFFFF", line: colors[i], lineWidth: 2 });
      addText(slide, String(i + 1), x + 16, 252, 32, 26, { size: 22, color: colors[i], bold: true, fill: "#FFFFFF" });
      addText(slide, s[0], x + 16, 292, 142, 24, { size: 18, color: C.ink, bold: true, fill: "#FFFFFF" });
      addText(slide, s[1], x + 16, 326, 142, 46, { size: 13, color: C.muted, fill: "#FFFFFF" });
      if (i < item.steps.length - 1) drawArrow(slide, x + 186, 314, x + 226, colors[i + 1]);
    });
    addShape(slide, 120, 480, 1040, 82, { fill: "#EFF9FA", line: "#B7E3E7" });
    addText(slide, item.proof, 150, 505, 980, 34, { size: 22, color: C.ink, bold: true, fill: "#EFF9FA", align: "center" });
  },
  roles(slide, item) {
    item.roles.forEach((r, i) => {
      const x = 80 + i * 292;
      addShape(slide, x, 236, 236, 188, { fill: "#FFFFFF", line: r[2], lineWidth: 2 });
      addShape(slide, x, 236, 236, 12, { fill: r[2], line: r[2], lineWidth: 0 });
      addText(slide, r[0], x + 18, 272, 194, 30, { size: 20, color: C.ink, bold: true, fill: "#FFFFFF", align: "center" });
      addText(slide, r[1], x + 22, 326, 190, 58, { size: 15, color: C.muted, fill: "#FFFFFF", align: "center" });
      if (i < item.roles.length - 1) drawArrow(slide, x + 246, 326, x + 286, r[2]);
    });
    addText(slide, item.principle, 122, 502, 1036, 58, { size: 21, color: C.blue, bold: true, align: "center" });
  },
  flywheel(slide, item) {
    const centerX = 410, centerY = 390;
    item.nodes.forEach((n, i) => {
      const angle = (-90 + i * 60) * Math.PI / 180;
      const x = centerX + Math.cos(angle) * 210 - 64;
      const y = centerY + Math.sin(angle) * 150 - 22;
      pill(slide, n, x, y, 128, [C.blue, C.cyan, C.green, C.amber, C.blue, C.green][i]);
    });
    addShape(slide, 288, 318, 244, 106, { fill: C.dark, line: C.dark });
    addText(slide, "Token Ledger", 318, 342, 184, 32, { size: 22, color: C.white, bold: true, fill: C.dark, align: "center" });
    addText(slide, "余额 / 消耗 / 发票 / 结算", 316, 382, 188, 24, { size: 13, color: "#CBD5E1", fill: C.dark, align: "center" });
    item.side.forEach((s, i) => {
      const y = 238 + i * 112;
      addShape(slide, 760, y, 390, 88, { fill: "#FFFFFF", line: [C.blue, C.amber, C.green][i], lineWidth: 2 });
      addText(slide, s[0], 782, y + 13, 150, 24, { size: 16, color: [C.blue, C.amber, C.green][i], bold: true, fill: "#FFFFFF" });
      addText(slide, s[1], 782, y + 42, 330, 34, { size: 15, color: C.ink, fill: "#FFFFFF" });
    });
  },
  trust(slide, item) {
    item.controls.forEach((c, i) => {
      const y = 226 + i * 76;
      const color = [C.blue, C.cyan, C.green, C.amber][i];
      addShape(slide, 94, y, 190, 52, { fill: color, line: color });
      addText(slide, c[0], 112, y + 14, 140, 18, { size: 18, color: C.white, bold: true, fill: color, align: "center" });
      addShape(slide, 312, y, 780, 52, { fill: "#FFFFFF", line: C.faint });
      addText(slide, c[1], 332, y + 14, 720, 20, { size: 17, color: C.ink, fill: "#FFFFFF" });
    });
    addShape(slide, 100, 560, 1020, 54, { fill: "#FFF7ED", line: "#F1C27D" });
    addText(slide, item.risk, 130, 574, 960, 22, { size: 18, color: C.amber, bold: true, align: "center", fill: "#FFF7ED" });
  },
  gtm(slide, item) {
    item.segments.forEach((s, i) => {
      const x = 76 + i * 380;
      addShape(slide, x, 220, 326, 178, { fill: "#FFFFFF", line: [C.blue, C.green, C.amber][i], lineWidth: 2 });
      addText(slide, s[0], x + 22, 244, 270, 22, { size: 20, color: C.ink, bold: true, fill: "#FFFFFF" });
      addText(slide, s[1], x + 22, 292, 270, 34, { size: 15, color: C.muted, fill: "#FFFFFF" });
      addText(slide, s[2], x + 22, 344, 270, 34, { size: 15, color: [C.blue, C.green, C.amber][i], bold: true, fill: "#FFFFFF" });
    });
    item.funnel.forEach((f, i) => {
      const x = 116 + i * 210;
      pill(slide, f, x, 508, 150, [C.blue, C.cyan, C.green, C.amber, C.ink][i]);
      if (i < item.funnel.length - 1) drawArrow(slide, x + 158, 522, x + 204, C.faint);
    });
  },
  ecosystem(slide, item) {
    addShape(slide, 470, 318, 340, 86, { fill: C.dark, line: C.dark });
    addText(slide, item.center, 506, 344, 268, 28, { size: 24, color: C.white, bold: true, fill: C.dark, align: "center" });
    item.items.forEach((it, i) => {
      const pos = [[90,230],[852,230],[92,450],[852,450],[470,522]][i];
      const color = [C.cyan, C.blue, C.amber, C.green, C.red][i];
      addShape(slide, pos[0], pos[1], 330, 76, { fill: "#FFFFFF", line: color, lineWidth: 2 });
      addText(slide, it[0], pos[0] + 20, pos[1] + 14, 210, 18, { size: 17, color, bold: true, fill: "#FFFFFF" });
      addText(slide, it[1], pos[0] + 20, pos[1] + 40, 280, 20, { size: 14, color: C.muted, fill: "#FFFFFF" });
    });
    addText(slide, item.expansion, 166, 608, 948, 34, { size: 18, color: C.ink, bold: true, align: "center" });
  },
  roadmap(slide, item) {
    item.phases.forEach((p, i) => {
      const x = 80 + i * 286;
      const color = [C.blue, C.cyan, C.green, C.amber][i];
      addRule(slide, x, 342, 230, color, 5);
      addShape(slide, x, 246, 230, 238, { fill: "#FFFFFF", line: C.faint });
      addText(slide, p[0], x + 18, 272, 120, 18, { size: 15, color, bold: true, fill: "#FFFFFF" });
      addText(slide, p[1], x + 18, 304, 160, 24, { size: 22, color: C.ink, bold: true, fill: "#FFFFFF" });
      addText(slide, p[2], x + 18, 370, 190, 62, { size: 14, color: C.muted, fill: "#FFFFFF" });
    });
  },
  ask(slide, item) {
    item.asks.forEach((a, i) => {
      const x = 92 + i * 374;
      addShape(slide, x, 250, 320, 188, { fill: C.dark2, line: ["#315BE8", "#0891B2", "#D97706"][i], lineWidth: 2 });
      addText(slide, String(i + 1), x + 22, 274, 38, 34, { size: 30, color: ["#93C5FD", "#67E8F9", "#FCD34D"][i], bold: true, fill: C.dark2 });
      addText(slide, a[0], x + 76, 280, 190, 24, { size: 21, color: C.white, bold: true, fill: C.dark2 });
      addText(slide, a[1], x + 24, 340, 268, 56, { size: 15, color: "#CBD5E1", fill: C.dark2 });
    });
    addText(slide, item.close, 116, 510, 1048, 56, { size: 22, color: C.white, bold: true, align: "center", dark: true });
  },
};
