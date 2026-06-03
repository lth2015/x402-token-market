# AI Token Billing Platform — Demo 重构设计评审

> 状态: **待评审** · 版本 v1.0 · 日期 2026-06-03
> 评审通过后方可编码。请在本文件中批注修改意见，或直接口头告知修改方向。

---

## 1. Storyline Design（3 分钟演示剧本）

### 故事主线：一个企业 AI 服务账单的完整闭环

```
[HABA Enterprise Dashboard]
      ↓ AI Advisor 持续调用 GPT-4o
[Token 消耗监控]
      ↓ 预算使用率达 80%
[Budget Alert 触发]
      ↓ AI Agent 自动发起充值
[Auto Topup 记录]
      ↓ 演示员点击"模拟充值授权"
[Chrome Extension + Touch ID 授权]
      ↓
[x402 on Solana · USDC 支付完成]
      ↓ 切换至 Netstars 平台视角
[Netstars Token Platform Revenue Dashboard]
```

### 6-Step 演示脚本（控制在 3 分钟内）

| 步骤 | 时长 | 演示员操作 | 观众看到 | 核心信息点 |
|---|---|---|---|---|
| **STEP 1** AI Usage | 30s | 打开 HABA Enterprise Dashboard `/dashboard` | 6个KPI卡 + GPT-4o模型卡 + Token消耗趋势图 | HABA 是 AI 服务的企业用户，每天消耗亿级 Token |
| **STEP 2** Budget Monitoring | 20s | 点击 Budget `/budget` | Monthly Limit 选择器 + 预算使用率进度条 (57%) | 企业可以设置 Token 上限和预算上限，实时监控 |
| **STEP 3** Auto Topup | 25s | 点击 Auto Topup `/topup` | 充值规则卡 + 历史充值记录表 | AI Agent 自动检测余额不足，触发 100M Token 定额充值 |
| **STEP 4** Payment Auth | 30s | 点击"模拟充值授权"按钮 | Chrome Extension UI → Touch ID 弹窗 | 企业级安全授权：指纹验证，不需要输入密码 |
| **STEP 5** x402 Payment | 20s | Touch ID 确认 | x402 协议在 Solana 上完成 USDC 支付 | 链上结算，支付方式：USDC · Solana DevNet |
| **STEP 6** Revenue | 35s | 切换至 Netstars Console `/revenue` | MTD 收入趋势图 + 模型占比饼图 → Merchants 页面 Top 10 | Netstars 平台视角：实时看到所有商户产生的收入 |

**总计：约 160 秒 ≈ 2.5 分钟**（含切换时间富裕 30 秒）

---

## 2. Updated Information Architecture

### HABA 站点（port 3001）— 全面重构

**Before（消费者电商）:**
```
/ → ConversationalAdvisor（健康食品 AI 顾问聊天）
/cart → 购物车结账
/resale → Token AI 转售套餐
/b2b → B2B 合作伙伴
/agent → 终端 Agent 模拟器
```

**After（企业客户仪表盘）:**
```
/ → 302 redirect → /dashboard
/dashboard → 企业 AI 使用仪表盘（主入口）
/budget    → 预算监控
/topup     → Auto Topup 历史 + 支付授权演示
```

**HABA 全局导航（新 Sidebar）:**
```
┌─────────────────┐
│ HABA Enterprise │  ← 品牌标识
├─────────────────┤
│ ⊞ Overview      │  → /dashboard   (active by default)
│ ◎ Budget        │  → /budget
│ ⚡ Auto Topup   │  → /topup
├─────────────────┤
│ → Netstars ↗    │  external link to port 3000
└─────────────────┘
```

### Netstars Token Console（port 3000）— 新增平台视图

**Before（单商户视图）:**
```
/dashboard  → Token 余额 + 活动流
/usage      → 使用量分析
/tokens     → Token 管理
/api-keys   → API Key 管理
/models     → 模型目录
/invoices   → 账单列表
/protocol   → 协议浏览器
/settings   → 设置
/audit      → 审计日志
```

**After（平台运营视图，新增）:**
```
/dashboard  → 保留（实时 Token 流）
/usage      → 保留
/tokens     → 保留
/api-keys   → 保留
/models     → 保留
/revenue    → NEW: 平台收入仪表盘（MTD 收入 + 模型占比）
/merchants  → NEW: 商户管理（Top 10 排行）
/billing    → NEW: 账单（PDF 下载）
/invoices   → ENHANCED: 增加 PDF 下载 + 邮件重发
/protocol   → 保留
/settings   → 保留
/audit      → 保留
```

**Netstars Sidebar（新增项）:**
```
PRIMARY:
  Dashboard, Usage, Tokens, API Keys, Models
  ────────────────────────────── (新分组线)
  Revenue (TrendingUp icon)   ← NEW
  Merchants (Users icon)      ← NEW
  Billing (Receipt icon)      ← NEW
  Invoices (enhanced)
  Protocol
SECONDARY:
  Settings, Audit Log
```

### 保护区域（严禁修改结构）

| 表面 | 路径 | 保护内容 |
|---|---|---|
| Wea Console | port 3003 | 所有页面结构 |
| x402 Console | port 3002 | 所有页面结构 |
| x402 支付协议 | netstars/x402/ | 协议逻辑、verify/settle |
| Solana 结算 | wea/ | 链上签名/广播 |
| Touch ID 授权 | haba checkout flow | 指纹鉴权逻辑 |

---

## 3. UI Component Changes（组件改造清单）

### HABA — 改造

| 组件 | 操作 | 说明 |
|---|---|---|
| `HabaTopBar.tsx` | MODIFY | 移除购物车图标；标题改为"HABA Enterprise" |
| `HabaFooter.tsx` | MODIFY | 移除商品相关链接；保留 Netstars 版权 |
| `layout.tsx` (app) | MODIFY | 增加 Sidebar 组件；移除购物车 Provider |
| `app/page.tsx` | MODIFY | 改为重定向至 `/dashboard` |

### HABA — 新增

| 组件路径 | 类型 | 内容 |
|---|---|---|
| `components/enterprise/EnterpriseSidebar.tsx` | Layout | 左侧导航（Overview / Budget / Topup） |
| `components/enterprise/KpiCard.tsx` | UI | 指标卡（label + value + unit + delta badge） |
| `components/enterprise/ConsumptionTrendChart.tsx` | Chart | Recharts LineChart，Tab 切换 Today/Week/Month |
| `components/enterprise/ModelStatsCard.tsx` | UI | GPT-4o 固定展示卡（请求数 / Token / 成本） |
| `components/enterprise/BudgetGauge.tsx` | UI | 进度条 + 阈值标注，颜色随用量变化 |
| `components/enterprise/BudgetLimitSelector.tsx` | UI | Token/Budget 限额选择器（segmented control） |
| `components/enterprise/TopupHistoryTable.tsx` | UI | Auto Topup 历史数据表 |
| `components/enterprise/TopupRuleCard.tsx` | UI | 充值规则说明卡（100M/次固定） |
| `app/dashboard/page.tsx` | Page | 企业 AI 使用仪表盘 |
| `app/budget/page.tsx` | Page | 预算监控页 |
| `app/topup/page.tsx` | Page | Auto Topup 历史 + 支付授权入口 |
| `lib/haba/enterprise.ts` | Data | 全部 mock 数据 + TypeScript 类型 |
| `app/api/enterprise/kpi/route.ts` | API | GET KPI 数据 |
| `app/api/enterprise/trend/route.ts` | API | GET Token 消耗趋势 |
| `app/api/enterprise/budget/route.ts` | API | GET 预算状态 |
| `app/api/enterprise/topup-history/route.ts` | API | GET 充值历史 |

### Netstars — 改造

| 组件 | 操作 | 说明 |
|---|---|---|
| `components/Sidebar.tsx` | MODIFY | 新增 Revenue / Merchants / Billing nav items |
| `app/(console)/invoices/page.tsx` | ENHANCE | 增加 PDF 下载 + Resend Email + Toast |

### Netstars — 新增

| 组件路径 | 类型 | 内容 |
|---|---|---|
| `components/RevenueAreaChart.tsx` | Chart | Recharts AreaChart，绿色填充，MTD 趋势 |
| `components/ModelPieChart.tsx` | Chart | Recharts PieChart，4个模型，含数据表 fallback |
| `components/MerchantRankingTable.tsx` | UI | Top 10 商户表，前三名高亮 |
| `app/(console)/revenue/page.tsx` | Page | 收入仪表盘 |
| `app/(console)/merchants/page.tsx` | Page | 商户管理（Top 10） |
| `app/(console)/billing/page.tsx` | Page | 账单 + PDF 下载 |
| `lib/platform-mock.ts` | Data | 平台级 mock 数据 + 类型 |
| `app/api/proxy/platform-metrics/route.ts` | API | GET 平台指标 |
| `app/api/proxy/revenue-trend/route.ts` | API | GET 收入趋势 |
| `app/api/proxy/model-breakdown/route.ts` | API | GET 模型占比 |
| `app/api/proxy/merchant-ranking/route.ts` | API | GET Top 10 商户 |
| `app/api/proxy/billing/route.ts` | API | GET 账单详情 |
| `app/api/proxy/invoice/resend/route.ts` | API | POST 重发邮件 |

---

## 4. Removed Components（待删除清单）

### HABA 删除

| 路径 | 理由 |
|---|---|
| `components/advisor/ConversationalAdvisor.tsx` | 消费者聊天窗口 |
| `components/advisor/ChatProductCard.tsx` | 商品推荐卡（聊天附属） |
| `components/checkout/CheckoutFlow.tsx` | 消费者结账流程 |
| `components/checkout/AddressStep.tsx` | 结账步骤 |
| `components/checkout/ConfirmStep.tsx` | 结账步骤 |
| `components/checkout/SuccessStep.tsx` | 结账成功页 |
| `components/product/ProductCard.tsx` | 商品卡片 |
| `components/cart/CartIconLink.tsx` | 购物车图标 |
| `components/cart/AddToCartButton.tsx` | 加入购物车按钮 |
| `components/shared/EnterpriseAcceptancePanel.tsx` | B2B 旧接受面板 |
| `lib/cart/store.tsx` | 购物车状态管理 |
| `app/cart/page.tsx` | 购物车页面 |
| MARVIE 商品 SKU 数据（`lib/haba/products.ts` 等） | 商品目录 |
| `/resale`、`/b2b`、`/agent` 路由（如存在） | 旧业务页面 |

> 注意：删除前需检查这些组件是否被 API 路由 (`app/api/`) 引用，若有则同步移除引用。`app/api/payment/advise`、`app/api/payment/balance` 等路由**保留**（被 TopBar 或新 Dashboard 可能使用）。

---

## 5. Added Components（完整新增清单）

见 §3 "新增"部分，已全部列出。

**重点新增说明**：

### ConsumptionTrendChart（HABA）
- 库：Recharts `<AreaChart>`
- Props: `period: "today" | "week" | "month"`, `data: ConsumptionDataPoint[]`
- 颜色：`#2563EB` 主线，`rgba(37,99,235,0.15)` 填充
- Y轴格式：`>= 1B → "1.2B"`, `>= 1M → "312M"`
- X轴：today=小时, week=星期, month=日期
- 响应式：`<ResponsiveContainer width="100%" height={240}>`

### ModelPieChart（Netstars）
- 库：Recharts `<PieChart>` + `<Cell>`
- 必须提供数据表 fallback（`<details>` 折叠展开）
- 颜色：GPT-4o=#2563EB, GPT-4.1=#7C3AED, Claude=#D97706, Gemini=#059669
- 可交互图例（点击切换显示/隐藏）
- Center label：总 Token 量

### PDF Download（Mock 实现）
- `GET /api/proxy/billing/pdf` → 返回 `application/pdf` 的 1KB 空白 PDF blob
- 前端：`<a href=... download="billing-2026-06.pdf">Download PDF</a>` 直接链接
- 或使用 fetch + createObjectURL + programmatic click

---

## 6. Data Model Changes

### 新增 TypeScript 类型

```typescript
// haba/src/lib/haba/enterprise.ts

export interface EnterpriseKpi {
  activeUsersOnline: number;
  todayTokenUsage: number;       // absolute count
  weeklyTokenUsage: number;
  monthlyTokenUsage: number;
  currentBudgetUsed: number;     // USD
  remainingBudget: number;       // USD
  budgetLimit: number;           // USD (配置值)
  tokenLimit: number;            // absolute count (配置值)
}

export interface AiModelStats {
  model: "gpt-4o";               // 固定
  requestCount: number;
  tokenUsage: number;
  estimatedCost: number;         // USD
}

export interface ConsumptionDataPoint {
  label: string;                 // "14:00" / "Mon" / "Jun 1"
  tokens: number;
}

export type TopupPeriod = "today" | "week" | "month";

export interface AutoTopupRecord {
  id: string;
  time: string;                  // ISO 8601
  triggerReason: string;         // "预算使用率达 80%" 等
  remainingTokenBefore: number;
  topupAmount: 100_000_000;      // 固定 1亿
  usdCost: number;
  txHash: string;
  status: "completed" | "pending" | "failed";
}
```

```typescript
// netstars/token/console/src/lib/platform-mock.ts

export interface PlatformMetrics {
  totalTokenConsumption: number; // MTD
  totalCostUsd: number;          // MTD
  totalRevenueUsd: number;       // MTD
  activeMerchants: number;
  totalAutoTopups: number;
}

export interface RevenueTrendPoint {
  date: string;                  // "Jun 1"
  revenue: number;               // cumulative USD
}

export interface ModelBreakdownItem {
  model: "GPT-4o" | "GPT-4.1" | "Claude" | "Gemini";
  tokenShare: number;            // 0.0 - 1.0
  tokenCount: number;
  color: string;                 // hex
}

export interface MerchantRankingRow {
  rank: number;
  merchantId: string;
  merchantName: string;
  monthlyTokenUsage: number;
  monthlyCostUsd: number;
  revenueUsd: number;
  status: "active" | "trial" | "suspended";
}

export interface BillingStatement {
  period: string;                // "2026-06"
  merchantName: string;
  lineItems: BillingLineItem[];
  subtotal: number;
  taxRate: number;               // 0.1 = 10%
  total: number;
}

export interface BillingLineItem {
  model: string;
  tokens: number;
  unitRatePerMillion: number;    // USD per 1M tokens
  amount: number;
}

// Invoice 扩展（在现有 InvoiceRow 基础上）
export interface InvoiceRowEnhanced extends InvoiceRow {
  pdfUrl: string;               // mock URL
  emailStatus: "sent" | "pending" | "failed";
  recipientEmail: string;
}
```

### Mock 数据参考值

**HABA Enterprise KPI（mock）:**
```typescript
const MOCK_KPI: EnterpriseKpi = {
  activeUsersOnline: 247,
  todayTokenUsage: 14_200_000,
  weeklyTokenUsage: 89_600_000,
  monthlyTokenUsage: 312_400_000,
  currentBudgetUsed: 2847,
  remainingBudget: 2153,
  budgetLimit: 5000,
  tokenLimit: 5_000_000_000,     // 5B
};
```

**HABA Auto Topup History（mock, 6 records）:**
```typescript
// Most recent topup: 今天 14:32
// Trigger: 预算使用率达 80%（$4,000 / $5,000）
// Remaining: 12,400,000 tokens
// Cost: $50.00 USDC
// Status: completed
// txHash: "5gYYVxN...wYMS"
```

**Netstars Platform Metrics（mock）:**
```typescript
const MOCK_PLATFORM: PlatformMetrics = {
  totalTokenConsumption: 2_140_000_000_000,  // 2.14T
  totalCostUsd: 14_280,
  totalRevenueUsd: 17_136,
  activeMerchants: 47,
  totalAutoTopups: 312,
};
```

---

## 7. API Design

### HABA 新增 API Routes（Next.js App Router, all mock）

| Method | Path | 返回 | 说明 |
|---|---|---|---|
| GET | `/api/enterprise/kpi` | `EnterpriseKpi` | 企业 KPI 数据 |
| GET | `/api/enterprise/model-stats` | `AiModelStats` | GPT-4o 模型统计 |
| GET | `/api/enterprise/trend?period=today\|week\|month` | `ConsumptionDataPoint[]` | Token 消耗趋势 |
| GET | `/api/enterprise/budget` | `BudgetStatus` | 预算使用状态 |
| GET | `/api/enterprise/topup-history` | `AutoTopupRecord[]` | 充值历史 |

**保留（不改变）:**
- `POST /api/payment/advise` → AI Advisor 调用（保留，Dashboard 可能展示最近活动）
- `GET /api/payment/balance` → Token 余额
- `POST /api/checkout/order` → x402 结账（用于 Touch ID 授权演示入口）

### Netstars 新增 API Routes（Next.js App Router, all mock）

| Method | Path | 返回 | 说明 |
|---|---|---|---|
| GET | `/api/proxy/platform-metrics` | `PlatformMetrics` | 平台全局指标 |
| GET | `/api/proxy/revenue-trend` | `RevenueTrendPoint[]` | MTD 收入趋势 |
| GET | `/api/proxy/model-breakdown` | `ModelBreakdownItem[]` | 模型 Token 占比 |
| GET | `/api/proxy/merchant-ranking` | `MerchantRankingRow[]` | Top 10 商户 |
| GET | `/api/proxy/billing?period=2026-06` | `BillingStatement` | 账单详情 |
| GET | `/api/proxy/invoice/[id]/pdf` | PDF blob | 发票 PDF 下载 |
| POST | `/api/proxy/invoice/resend` | `{ ok: true, email: string }` | 重发发票邮件 |

**保留（不改变）:**
- `GET /api/proxy/balance` → real backend
- `GET /api/proxy/recent-activity` → real backend

---

## 8. Implementation Plan

### Phase 1 — 删除消费者系统（HABA）
**负责 Agent**: haba-enterprise-dashboard  
**预计工期**: 1 round  

Tasks:
1. 删除所有消费者组件（见 §4 列表）
2. 删除 `lib/cart/` 和商品数据
3. 更新 `app/page.tsx` 为 redirect
4. 更新 `layout.tsx` 移除 CartProvider
5. 更新 `HabaTopBar.tsx` 移除购物车图标
6. 运行 `npm run typecheck` 确认 0 errors

### Phase 2 — HABA Enterprise Dashboard
**负责 Agent**: haba-enterprise-dashboard  
**预计工期**: 1 round  

Tasks:
1. 创建 `lib/haba/enterprise.ts` 含所有类型和 mock 数据
2. 创建 `EnterpriseSidebar.tsx`
3. 更新 `layout.tsx` 集成 Sidebar
4. 实现 `app/dashboard/page.tsx`（KPI + Model + Trend）
5. 实现 `ConsumptionTrendChart.tsx`（Recharts）
6. 实现 4 个 API routes

### Phase 3 — Budget Monitoring（HABA）
**负责 Agent**: haba-enterprise-dashboard  
**预计工期**: 1 round  

Tasks:
1. 实现 `BudgetLimitSelector.tsx`
2. 实现 `BudgetGauge.tsx`（进度条 + 颜色状态）
3. 实现 `app/budget/page.tsx`
4. API route: `/api/enterprise/budget`

### Phase 4 — Auto Topup History（HABA）
**负责 Agent**: haba-enterprise-dashboard  
**预计工期**: 1 round  

Tasks:
1. 实现 `TopupRuleCard.tsx`
2. 实现 `TopupHistoryTable.tsx`（6列数据表）
3. 实现 `app/topup/page.tsx`
4. API route: `/api/enterprise/topup-history`
5. 连接已有 Touch ID / x402 支付授权按钮（仅修改入口文案）

### Phase 5 — Netstars Token Platform
**负责 Agent**: netstars-token-platform  
**预计工期**: 1 round  

Tasks:
1. 创建 `lib/platform-mock.ts`
2. 实现 `RevenueAreaChart.tsx`（Recharts）
3. 实现 `ModelPieChart.tsx`（含数据表 fallback）
4. 实现 `MerchantRankingTable.tsx`
5. 实现 `app/(console)/revenue/page.tsx`
6. 实现 `app/(console)/merchants/page.tsx`
7. 实现 `app/(console)/billing/page.tsx`
8. 增强 `app/(console)/invoices/page.tsx`（PDF + Resend Toast）
9. 更新 `Sidebar.tsx` 新增 3 个导航项
10. 实现所有新增 API routes

### Phase 6 — Demo 验收
**负责**: 主 loop  

Tasks:
1. 按照 §1 演示剧本走完完整流程
2. 逐项核对 §10 Acceptance Checklist
3. 运行 `npm run typecheck`（HABA + Netstars Console）
4. 可选：运行 `python3 scripts/x402_protocol_e2e.py` 确认 E2E 不破

---

## 9. Test Plan

### 9.1 TypeScript 检查

```bash
# HABA
cd haba && npm run typecheck
# 预期：0 errors

# Netstars Token Console
cd netstars/token/console && npm run typecheck
# 预期：0 errors
```

### 9.2 Demo Flow 手工验证

按以下顺序逐步验证：

```
[ ] HABA /dashboard 加载正常（不出现"健康食品"/"商品"/"购物车"字眼）
[ ] 6 个 KPI 卡数值正常显示
[ ] GPT-4o 模型卡正常显示（只有 GPT-4o，无其他模型）
[ ] Trend Chart Today/Week/Month Tab 切换正常
[ ] HABA /budget 加载正常
[ ] Token Limit 选择器 (1B/5B/10B/50B) 可切换
[ ] Budget Limit 选择器 ($100/$500/$1000/$5000) 可切换
[ ] 进度条颜色随使用率变化（绿/琥珀/红）
[ ] HABA /topup 加载正常
[ ] Topup Rule 显示"100,000,000 Tokens"和"x402 on Solana · USDC"
[ ] Topup History 表显示 5-8 条记录，含正确字段
[ ] 点击"模拟充值授权"触发 Touch ID 弹窗
[ ] Touch ID 确认后显示 x402 支付成功
[ ] Netstars /revenue 加载正常
[ ] Revenue KPI 5 个指标卡正常
[ ] Revenue Trend Chart 显示绿色趋势线
[ ] Model Breakdown Pie 显示 4 个模型（GPT-4o/GPT-4.1/Claude/Gemini）
[ ] Pie 图下有数据表 fallback
[ ] Netstars /merchants 显示 Top 10 表
[ ] 前三名有高亮样式
[ ] Netstars /billing 显示账单详情 + 各模型明细
[ ] "Download PDF" 按钮有响应（触发下载或 Toast）
[ ] Netstars /invoices "Download PDF" 有响应
[ ] Netstars /invoices "Resend Email" 点击后显示 Success Toast（4s 自动消失）
[ ] 原有 /dashboard Live Ticker 仍然正常（不破坏）
[ ] Wea Console (port 3003) 不受影响
[ ] x402 Console (port 3002) 不受影响
```

### 9.3 边界验收

```bash
# 确认无商品相关文案
grep -r "健康食品\|商品购买\|购物车\|MARVIE\|Supplement\|Product Purchase" haba/src/ --include="*.tsx" --include="*.ts"
# 预期：0 matches

# 确认无 demo 禁词
grep -r "demo\|Demo\|DEMO" haba/src/app --include="*.tsx" | grep -v "node_modules"
# 预期：0 matches（或仅在注释中）

# 确认 x402 协议 E2E 不破（可选）
python3 scripts/x402_protocol_e2e.py
# 预期：40 passed · 0 failed
```

---

## 10. Acceptance Checklist

验收前逐项打钩，全部满足方可发布：

### 功能验收

- [ ] **AC-01** 页面中不存在商品购买流程（无 Product Catalog / Cart / Checkout）
- [ ] **AC-02** 页面中不存在消费者聊天窗口（无 Consumer Chat / ConversationalAdvisor）
- [ ] **AC-03** HABA 被定义为企业客户（界面显示 "HABA Enterprise"，无"健康食品电商"定位）
- [ ] **AC-04** GPT-4o 为 HABA Dashboard 展示的唯一 AI 模型（不显示 Claude / Gemini / GPT-4.1）
- [ ] **AC-05** Auto Topup 固定步长显示为 100,000,000 Tokens（1亿，不可修改）
- [ ] **AC-06** 支付方式显示 "x402 on Solana · USDC"
- [ ] **AC-07** Chrome Extension + macOS Touch ID 授权链路正常运行（不破坏）
- [ ] **AC-08** Netstars Billing 页支持 PDF 下载（按钮可点击，有文件下载或 Toast 响应）
- [ ] **AC-09** Netstars Invoice 页支持 PDF 下载
- [ ] **AC-10** Netstars Invoice 页支持邮件重发，点击后显示 Success Toast
- [ ] **AC-11** Wea Console 页面结构无变化（无任何修改）
- [ ] **AC-12** x402 Console 页面结构无变化（无任何修改）
- [ ] **AC-13** Solana 支付流程无变化（无任何修改）
- [ ] **AC-14** Netstars Merchants 页显示 Top 10 商户排行
- [ ] **AC-15** Demo 可按顺序演示：AI Usage → Token Consumption → Budget Monitoring → Auto Topup → x402 Payment → Revenue Dashboard
- [ ] **AC-16** 整个 Demo 可在 3 分钟内讲解完毕（按 §1 剧本验证）

### 技术验收

- [ ] **TC-01** `cd haba && npm run typecheck` → 0 errors
- [ ] **TC-02** `cd netstars/token/console && npm run typecheck` → 0 errors
- [ ] **TC-03** HABA 首页 (`/`) 正确 302 redirect 到 `/dashboard`
- [ ] **TC-04** HABA 新 Sidebar 三个导航项均可点击且对应页面正常加载
- [ ] **TC-05** Netstars Sidebar 新增三项（Revenue / Merchants / Billing）正常显示并可导航
- [ ] **TC-06** Netstars 原有 `/dashboard` LiveActivityTicker 实时数据正常（不因新页面影响）

### 设计验收

- [ ] **DC-01** 无 emoji 作为图标（使用 lucide-react SVG 图标）
- [ ] **DC-02** KPI 数值使用等宽数字（`font-variant-numeric: tabular-nums`）
- [ ] **DC-03** 进度条颜色语义正确（绿/琥珀/红 对应 0-60/60-80/80-100%）
- [ ] **DC-04** Pie Chart 有数据表 fallback（满足无障碍要求）
- [ ] **DC-05** Toast 4 秒后自动消失，有 aria-live 支持

---

## 附：Subagent 文件位置

本次新增：
- [subagents/haba-enterprise-dashboard.md](subagents/haba-enterprise-dashboard.md) — HABA 企业仪表盘工程师
- [subagents/netstars-token-platform.md](subagents/netstars-token-platform.md) — Netstars 平台工程师

已有（本次不变）：
- [docs/haba-agent-design.md](docs/haba-agent-design.md) — HABA Agent 行为设计
- [docs/haba-demo-requirements.md](docs/haba-demo-requirements.md) — 旧版需求（已被本文档取代）
- [docs/haba-technical-plan.md](docs/haba-technical-plan.md) — 旧版技术方案（已被本文档取代）

---

*评审通过后，按 Phase 1 → 6 顺序启动各 SubAgent 编码。*
