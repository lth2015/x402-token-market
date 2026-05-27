# Merchant Console — UX Specification

> **范围**：netstars/token/ui — B2B fintech 管理后台（Stripe Dashboard 风格）
> **属于**：[../ARCHITECTURE.md](../ARCHITECTURE.md)
> **基于**：[PRD.md](../PRD.md) v1.1 决策（Phase 1 仅只读 Console；Phase 2 写操作）
> **受众**：商户 IT / CFO / 运维 / 财务（日本 B2B 企业）
> **技术栈**：Next.js 15 App Router · React Server Components · shadcn/ui · Tailwind 4 · Recharts
> **设计方法**：由 [ui-ux-pro-max](https://nextlevelbuilder.com/ui-ux-pro-max) 提供风格/色板/字体推荐，本文档基于其输出 + Stripe / Vercel / Linear 等业界 fintech-grade dashboard 经验定制

---

## 1. 设计原则（设计前的承诺）

| # | 原则 | 落地体现 |
|---|------|---------|
| UX1 | **Stripe Dashboard 风格** | 高信息密度、表格优先、专业；**避免 Web3 / 加密美学**（无渐变、无霓虹、无几何动画） |
| UX2 | **B2B 日本企业语境** | 数字千位逗号 / 日期 YYYY/MM/DD / 货币¥ + USDC 双显 / 字段紧凑 |
| UX3 | **Phase 1 仅只读** | 任何写操作（按钮、表单）一律不出现在 v1；写操作 UI 用浅色 disabled 占位并标注 "Phase 2" tooltip |
| UX4 | **无障碍 WCAG AA** | 对比度 ≥ 4.5:1；可键盘完全导航；屏幕阅读器友好 |
| UX5 | **快、确定** | TTFB < 1s；表格分页与 server-side filter；不在 client 算聚合 |
| UX6 | **i18n 日英双语** | 顶部切换；日期/数字/货币 locale-aware；不假设布局宽度（日文比英文短，避免溢出） |

---

## 2. Design Tokens（设计系统）

### 2.1 色板（来自 ui-ux-pro-max + B2B 校准）

```css
/* ── Brand ──────────────────────────────────── */
--brand-primary:        #2563EB;   /* Indigo 600 — 主品牌色，CTA */
--brand-primary-hover:  #1D4ED8;   /* Indigo 700 */
--brand-secondary:      #3B82F6;   /* Indigo 500 — 链接 / 次要按钮 */

/* ── Semantic ──────────────────────────────────── */
--success:              #10B981;   /* Emerald 500 */
--warning:              #F59E0B;   /* Amber 500 */
--danger:               #DC2626;   /* Red 600 */
--info:                 #0EA5E9;   /* Sky 500 */

/* ── Neutral (Light) ──────────────────────────────────── */
--bg-page:              #F8FAFC;   /* Slate 50 */
--bg-surface:           #FFFFFF;
--bg-surface-elevated:  #FFFFFF;
--bg-muted:             #F1F5F9;   /* Slate 100 — table header / hover row */
--border-subtle:        #E2E8F0;   /* Slate 200 */
--border-default:       #CBD5E1;   /* Slate 300 */
--text-primary:         #0F172A;   /* Slate 900 */
--text-secondary:       #475569;   /* Slate 600 */
--text-tertiary:        #94A3B8;   /* Slate 400 — captions */
--text-on-brand:        #FFFFFF;

/* ── Dark mode ──────────────────────────────────── */
--bg-page-d:            #0B1220;   /* 比 slate-900 更深 */
--bg-surface-d:         #0F172A;   /* slate-900 */
--bg-muted-d:           #1E293B;   /* slate-800 */
--border-subtle-d:      #1E293B;
--border-default-d:     #334155;   /* slate-700 */
--text-primary-d:       #F1F5F9;
--text-secondary-d:     #94A3B8;
--text-tertiary-d:      #64748B;

/* ── Data viz palette（图表用，色弱友好 + 与品牌色一致） */
--chart-1: #2563EB;  /* Indigo (primary) */
--chart-2: #14B8A6;  /* Teal */
--chart-3: #F59E0B;  /* Amber */
--chart-4: #8B5CF6;  /* Violet */
--chart-5: #EC4899;  /* Pink */
--chart-6: #84CC16;  /* Lime */
```

**对比度验证**（关键组合）：
| 前景 / 背景 | 比值 | 评级 |
|-----------|------|------|
| `text-primary #0F172A` / `bg-surface #FFFFFF` | 18.46 | AAA |
| `text-secondary #475569` / `bg-surface #FFFFFF` | 8.46 | AAA |
| `text-tertiary #94A3B8` / `bg-surface #FFFFFF` | 3.43 | AA Large (only) |
| `brand-primary #2563EB` / `bg-surface` | 5.17 | AA ✓ |
| `text-on-brand #FFFFFF` / `brand-primary #2563EB` | 5.17 | AA ✓ |
| `danger #DC2626` / `bg-surface` | 5.04 | AA ✓ |

`text-tertiary` 不用于正文，仅用于 caption / placeholder。

### 2.2 字体

**Heading + Body**：`Plus Jakarta Sans` (variable; weight 400/500/600/700/800)
**Monospace**（trace_id, tx_hash, code blocks）：`JetBrains Mono`
**日文 fallback**：`Noto Sans JP`

```css
font-family: 'Plus Jakarta Sans', 'Noto Sans JP', system-ui, sans-serif;
font-family-mono: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
```

加载策略：`font-display: swap`，preload 仅 400/600/700。

### 2.3 字号阶梯（mobile-first）
```
caption  : 12px / 16px (1.33)
small    : 13px / 18px (1.38)
body     : 14px / 20px (1.43)     ← 默认（B2B 信息密度高）
body-lg  : 16px / 24px (1.5)
h4       : 16px / 22px (1.375) + 600
h3       : 20px / 28px (1.4)   + 600
h2       : 24px / 32px (1.33)  + 700
h1       : 32px / 40px (1.25)  + 700
display  : 40px / 48px (1.2)   + 800
```

数字（金额、计量）用 **tabular-nums** 让列对齐：
```css
font-variant-numeric: tabular-nums;
```

### 2.4 间距（4px grid）
```
xs   = 4px      sm = 8px      md = 12px     base = 16px
lg   = 24px     xl = 32px     2xl = 48px    3xl = 64px
```

页面边距：`px-6 md:px-8 lg:px-12`；卡片内 padding：`p-5 md:p-6`；表格行高 `h-12`（紧凑模式 `h-10`）。

### 2.5 圆角 / 阴影
```
radius-sm: 6px     radius-md: 8px (default)    radius-lg: 12px    radius-xl: 16px (cards/modals)

elevation-0: none                                    (page bg)
elevation-1: 0 1px 2px rgba(15,23,42,.04)            (subtle cards)
elevation-2: 0 4px 12px rgba(15,23,42,.08)           (popovers / hover)
elevation-3: 0 12px 32px rgba(15,23,42,.12)          (modals — Phase 2)
```

阴影克制，不堆叠。

### 2.6 动效
```
duration-fast    : 120ms   (hover, focus)
duration-default : 200ms   (state transition)
duration-slow    : 300ms   (page entrance, modal)
easing           : cubic-bezier(0.16, 1, 0.3, 1)  (ease-out-expo)
```

所有动画尊重 `prefers-reduced-motion: reduce`。

---

## 3. 全局布局（App Shell）

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TopBar  (h-14, bg-surface, border-b)                                    │
│   ┌──────────┬──────────────────────────────────────────────────┬────┐  │
│   │ Logo     │  Org Switcher ▾   |   Search (⌘K)                │ JP│ │  │
│   │ Netstars │  Acme Co.         |                              │ EN│👤│
│   └──────────┴──────────────────────────────────────────────────┴────┘  │
├──────────────────────────────────────────────────────────────────────────┤
│              │                                                            │
│ Sidebar      │  Main Content Area                                         │
│ (w-56)       │  (max-w-7xl, mx-auto, py-8 px-6)                           │
│              │                                                            │
│ ◉ Dashboard  │   <Breadcrumb> 〉Dashboard                                 │
│ ○ Usage      │   <PageHeader>                                             │
│ ○ Tokens     │   <PageContent>                                            │
│ ○ API Keys   │                                                            │
│ ○ Models     │                                                            │
│ ○ Invoices   │                                                            │
│ ─── ─── ───  │                                                            │
│ ○ Settings   │                                                            │
│ ○ Audit Log  │                                                            │
│              │                                                            │
│ ── footer ─  │                                                            │
│ Docs ↗       │                                                            │
│ Status: ●    │                                                            │
└──────────────┴────────────────────────────────────────────────────────────┘
```

**响应式断点**：
- `< 768px`: Sidebar 隐藏，TopBar 显示 hamburger，Sidebar 抽屉式打开
- `768–1023px`: Sidebar 折叠为 icon-only（w-14），hover/click 展开
- `≥ 1024px`: 完整 Sidebar（w-56）

**Search (⌘K)**：cmd-k palette，全局搜索 — merchants / projects / agent_keys / trace_id / payment_order_id / models。Phase 1 仅检索（不执行操作）。

---

## 4. 信息架构（IA）

```
1. Dashboard           月度概览首屏（KPI + 趋势 + Live Activity Ticker + 异常告警）
2. Usage               消耗分析（按时间 / 模型 / 项目 拆分）
3. Tokens              账本与充值（余额 / 流水 / 套餐）
4. API Keys            Key 列表 + 配额 + 最近调用日志（Phase 1 只读）
5. Models              可用 AI 模型 + 单价 + 文档链接
6. Invoices            发票列表 + 下载
7. Protocol Explorer   X402 协议交互式说明（开发者友好；灵感来自 web4.ai）
─────────────────────
8. Settings            团队 / Webhook / 集成（Phase 1 主要只读）
9. Audit Log           操作日志（合规）
```

二级导航：每页右上角的 **Tabs**（如 Usage 下 By Model / By Project / By Day）

---

## 5. 关键页面 Wireframes（ASCII，Phase 1）

### 5.1 Dashboard（首页）

```
┌────────────────────────────────────────────────────────────────────────┐
│ Dashboard                                          [Last 30 days ▾]    │
│ Acme Co. · Production                                                  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐         │
│  │ Token Balance │ Spent (30d)  │ Requests (30d)│ Active Keys  │  KPI    │
│  │  12.4M        │  ¥234,500    │  18,420       │  7 / 10      │  cards  │
│  │  ≈ $830 USDC  │  +12% vs PM  │  +8%         │  3 frozen    │         │
│  └──────────────┴──────────────┴──────────────┴──────────────┘         │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Token consumption  (last 30 days)             [By Model ▾]      │    │
│  │                                                                  │    │
│  │     ▁▂▂▄▃▅▆▇█▇▆▅▄▃▅▆▇█▇▆▅▆▇▆▅▄▃▅▆▇█                            │    │
│  │     ─────────────────────────────────────                       │    │
│  │     May 1                            May 30                     │    │
│  │  ● Claude Opus  ● Claude Sonnet  ● GPT-4.1  ● Gemini-2.5-pro    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌────────────────────────┬─────────────────────────────────────┐       │
│  │ Top models (by spend)   │  Alerts (last 7 days)                │       │
│  │                          │                                        │       │
│  │ Claude Opus    ¥ 98,210  │  ⚠  High burn rate (project: prod)   │       │
│  │ Claude Sonnet  ¥ 67,400  │     2.3× of 30-day average            │       │
│  │ GPT-4.1        ¥ 52,800  │     2026/05/24 14:23                  │       │
│  │ Gemini-2.5pro  ¥ 16,090  │  ──────────────────────────────────  │       │
│  │                          │  ●  API key revoked (security audit)  │       │
│  │ [View all →]             │     agk_01HX...                       │       │
│  │                          │                                        │       │
│  └────────────────────────┴─────────────────────────────────────┘       │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │ Live activity                            ● live  [Audit Log →] │     │
│  │ ────────────────────────────────────────────────────────────── │     │
│  │ 14:23:18  💳  Token purchased        +10,000      $10.00 USDC │     │
│  │           ↳  pmt_01HX...  ·  tx 5KJp...  ·  prod              │     │
│  │ 14:23:01  🧠  Claude Opus inference    -4,231     ¥420  ·  prod│     │
│  │           ↳  generate 中/英/日 SKU description (3/50)          │     │
│  │ 14:22:50  🧠  Claude Opus inference    -3,892     ¥390  ·  prod│     │
│  │           ↳  competitor price analysis                          │     │
│  │ 14:18:34  ⚠  Request failed            timeout    Claude Sonnet│     │
│  │ 14:15:02  🔑  API key created          agk_01HY...             │     │
│  │           ↳  by yamada@acme.co.jp                              │     │
│  └────────────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────────┘
```

> **Live activity ticker（受 web4.ai 启发）**：
> - 顶部 `● live` 绿点 + pulse 动效，每 5s polling 拉新事件
> - 新事件**从顶部 slide-in**（120ms ease-out），下方平移
> - 每行 = 时间 + 图标 + 主语义 + 金额（tabular-nums 右对齐）+ 上下文（缩进副行）
> - 金额用 JetBrains Mono；颜色：credit = green / debit = primary / failed = red / config = gray
> - hover 整行 → 跳详情；shift-click → 复制 trace_id
> - **目的**：让经营层 / 财务一眼看到"Agent 真的在消费"，让平台变得"活着"——这是 web4.ai 让协议变得具体可感的核心机制
> - **图标用 Lucide SVG**（💳 → `credit-card`；🧠 → `brain`；⚠ → `alert-triangle`；🔑 → `key`），**不用 emoji**（见 §1 UX1）
>

**KPI 卡片细节**：
- 大数字 `text-2xl font-bold tabular-nums`
- 单位与备注 `text-sm text-secondary`
- 同比变化 `+12%` 用 success/danger 色（向上不一定好，向上消耗用 warning）
- 移动端 KPI 卡片堆叠 1 列

**异常告警**：
- 颜色：⚠ warning / ● info / ✕ danger
- 7 天内未读自动浮出；点击进入 [Audit Log] 详情

### 5.2 Usage（消耗分析）

```
┌────────────────────────────────────────────────────────────────────────┐
│ Usage                          [Last 30 days ▾]  [Export CSV] (disabled│
│                                                   tooltip: "Phase 2")  │
│ ──────────────────────────────────────────────────────────────────── │
│ [ By Time ]  [ By Model ]  [ By Project ]  [ By API Key ]              │
├────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Total spend: ¥ 234,500  ·  Total tokens consumed: 89.4M                 │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │ Spend by day (¥)                                                │     │
│  │   ¥10K┤                                                          │     │
│  │       │              ╭╮     ╭╮                                  │     │
│  │   ¥8K ┤          ╭╮ ╱ ╰╮   ╱ ╰╮      ╭─╮                       │     │
│  │       │      ╭╮ ╱ ╰╯   ╲ ╱   ╲╮ ╭───╯ ╰╮                       │     │
│  │   ¥6K ┤    ╱ ╰╯         ╳     ╰╯       ╰─╮                     │     │
│  │       │  ╱                                  ╰                   │     │
│  │   ¥4K ┤                                                          │     │
│  │   ¥2K ┤                                                          │     │
│  │       └──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──   │     │
│  │         5/1                                                  5/30│     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │ Model                  Requests │ Tokens In │ Tokens Out │ Spend │     │
│  │ ────────────────────────────────│───────────│────────────│───────│     │
│  │ claude-opus-4-7         8,341  │ 12.4M     │  3.2M      │ ¥98,2K│     │
│  │ claude-sonnet-4-6       6,128  │  8.1M     │  2.4M      │ ¥67,4K│     │
│  │ gpt-4.1                 3,420  │  4.2M     │  1.1M      │ ¥52,8K│     │
│  │ gemini-2.5-pro            531  │    920K   │   240K     │ ¥16,1K│     │
│  │ ────────────────────────────────│───────────│────────────│───────│     │
│  │ Total                  18,420  │ 25.6M     │  6.9M      │¥234,5K│     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  Showing 1-10 of 27 model variants               [< Prev] 1 2 3 [Next >]│
└────────────────────────────────────────────────────────────────────────┘
```

**关键交互**：
- 时间范围 selector：Last 7 / 30 / 90 days / This month / Last month / Custom range
- Tabs 切换 viewpoint 时保持时间范围一致
- Chart hover 显示精确数值（tooltip 带 trace_id 跳转）
- Server-side filter / pagination；客户端不加总

### 5.3 Tokens（账本与充值）

```
┌────────────────────────────────────────────────────────────────────────┐
│ Tokens                                                                  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────┬─────────────────────────┐    │
│  │  Current balance                       │  Subscription             │
│  │                                        │                            │
│  │     12,400,000  AI Token              │  Growth                    │
│  │     ≈ 0.83 USDC ≈ ¥124                │  ¥50,000 / month            │
│  │                                        │  50M tokens included        │
│  │  On hold: 0                            │  Renewal: 2026/06/01        │
│  │                                        │                            │
│  │  ┌────────────────────────┐           │  [Manage] (disabled)        │
│  │  │ Top up                  │           │  Phase 2                    │
│  │  │ (Disabled in Phase 1.   │           │                            │
│  │  │  Use API: POST /v1/     │           │                            │
│  │  │  token-purchase)        │           │                            │
│  │  └────────────────────────┘           │                            │
│  └──────────────────────────────────────┴─────────────────────────┘    │
│                                                                          │
│  Ledger                                       [All ▾]  [Search trace_id]│
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │ Time       Type    Amount   Balance After  Source            ↗│     │
│  │ ───────────│───────│────────│──────────────│──────────────────│     │
│  │ 2026/05/26 │credit │+10.0M  │ 12.4M        │ x402 pmt_01HX...│     │
│  │  14:23:12  │       │         │              │ tx 5KJp...      │     │
│  │ ───────────│───────│────────│──────────────│──────────────────│     │
│  │ 2026/05/26 │debit  │-12,300 │  2.4M        │ ai claude-opus  │     │
│  │  14:18:55  │       │         │              │ req_01HX...     │     │
│  │ ───────────│───────│────────│──────────────│──────────────────│     │
│  │ 2026/05/26 │debit  │-8,400  │  2.4M        │ ai claude-sonnet│     │
│  │ ...                                                              │     │
│  └────────────────────────────────────────────────────────────────┘     │
│  Showing 1-25 of 1,247                                  [< Prev][Next >]│
└────────────────────────────────────────────────────────────────────────┘
```

**关键**：每行可点击展开细节（trace 链路、关联订单/请求 ID、跳转到 [Audit Log]）。

### 5.4 API Keys（列表 + 调用日志）

```
┌────────────────────────────────────────────────────────────────────────┐
│ API Keys                                                                │
├────────────────────────────────────────────────────────────────────────┤
│  [+ Create new key] (disabled, "Phase 2 — use POST /console/api-keys") │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │  Key Prefix    Label              Project    Status   Last used │     │
│  │ ────────────────────────────────────────────────────────────── │     │
│  │  ak_a1b2…    Production agent     prod      ● active  2m ago    │     │
│  │  ak_c3d4…    EC scrape worker     prod      ● active  17m ago   │     │
│  │  ak_e5f6…    QA bot                staging   ○ active  3d ago    │     │
│  │  ak_g7h8…    Old key (revoke)     prod      ✕ revoked 2026/05/20│     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  ─── Click row to see details ─────────────────────────────────         │
│                                                                          │
│  ak_a1b2… · Production agent                                            │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │ Limits             Allowed models       Recent calls            │     │
│  │ ───────────────── ────────────────────  ─────────────────────  │     │
│  │ 600 req/min        ✓ claude-*           Last 100 requests       │     │
│  │ 100M tokens/min    ✓ gpt-4.1            (table below)          │     │
│  │ ¥10,000/day        ✗ gemini-*                                   │     │
│  └────────────────────────────────────────────────────────────────┘     │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │ Time     Model        Tokens  Cost   Status  trace_id          │     │
│  │ ───────  ──────────── ─────── ─────── ─────── ─────────────────│     │
│  │ 14:23:18 claude-opus  4,231   ¥420   succeed 00-abc123...     │     │
│  │ 14:23:01 claude-opus  3,892   ¥390   succeed 00-def456...     │     │
│  │ 14:22:50 claude-opus  failed  -      timeout 00-ghi789...     │     │
│  └────────────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.5 Models（可用模型 + 单价）

```
┌────────────────────────────────────────────────────────────────────────┐
│ Models                                                                  │
├────────────────────────────────────────────────────────────────────────┤
│  All AI models you can call via Netstars Token API. Pricing in AI       │
│  Token units (1 USDC = 1,000,000 Token).                                │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │ Model              Provider   Input/1K   Output/1K  Doc        │     │
│  │ ─────────────────  ─────────  ──────────  ──────────  ───────  │     │
│  │ claude-opus-4-7    Anthropic  15,000     75,000      [docs ↗] │     │
│  │ claude-sonnet-4-6  Anthropic   3,000     15,000      [docs ↗] │     │
│  │ claude-haiku-4-5   Anthropic     800      4,000      [docs ↗] │     │
│  │ gpt-4.1            OpenAI     10,000     30,000      [docs ↗] │     │
│  │ gpt-4.1-mini       OpenAI      2,000      6,000      [docs ↗] │     │
│  │ grok-4             xAI         8,000     24,000      [docs ↗] │     │
│  │ gemini-2.5-pro     Google      8,000     24,000      [docs ↗] │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  Status:  All providers healthy ●                  [System status ↗]    │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.6 Invoices（发票列表）

```
┌────────────────────────────────────────────────────────────────────────┐
│ Invoices                                                                │
├────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │ Period    Invoice ID         Total       Status       Actions  │     │
│  │ ──────── ──────────────── ──────────── ──────────── ────────── │     │
│  │ 2026/05  inv_202605_00012  ¥234,500    ● Issued     [PDF][CSV]│     │
│  │ 2026/04  inv_202604_00011  ¥218,300    ● Paid       [PDF][CSV]│     │
│  │ 2026/03  inv_202603_00010  ¥189,200    ● Paid       [PDF][CSV]│     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  Invoice 2026/05 includes 23 on-chain transactions and 18,420 AI calls. │
│  All on-chain tx hashes are listed in the CSV export for audit.         │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.7 Settings（Phase 1 只读 + 部分可读 readonly 信息）

```
┌────────────────────────────────────────────────────────────────────────┐
│ Settings                                                                │
├────────────────────────────────────────────────────────────────────────┤
│ [ Account ]  [ Team ]  [ Webhooks ]  [ Integrations ]  [ Security ]   │
│                                                                          │
│ Account                                                                 │
│ ─────────────────────────────────────────────────────────────────     │
│  Organization name      Acme Co., Ltd.                                  │
│  Legal name             株式会社アクメ                                   │
│  Tax ID (法人番号)      1234567890123                                   │
│  Billing email          finance@acme.co.jp                              │
│  Country                Japan                                           │
│  Created                2026/02/15                                      │
│                                                                          │
│  ╔════════════════════════════════════════════════════════════════╗     │
│  ║ Need to update? Phase 2 will support self-service editing.     ║     │
│  ║ For now, contact support@netstars.jp                            ║     │
│  ╚════════════════════════════════════════════════════════════════╝     │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.7b Protocol Explorer（开发者友好；灵感来自 web4.ai · Phase 1 选交付）

```
┌────────────────────────────────────────────────────────────────────────┐
│ Protocol Explorer · X402 in motion                                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [▶ Play]  [⏸ Pause]  Speed [1× ▾]   Recipe [Token purchase ▾]         │
│                                                                          │
│  ┌─────────┐    ┌──────────────┐    ┌──────────────┐   ┌────────────┐  │
│  │ Agent   │    │ Netstars     │    │ Wea Japan    │   │ Solana     │  │
│  │ (SDK)   │    │ X402 Gateway │    │ (settlement) │   │ + USDC SPL │  │
│  └────┬────┘    └──────┬───────┘    └──────┬───────┘   └─────┬──────┘  │
│       │  1  POST /v1/payments   │           │                 │         │
│       │ ─────────────────────►  │           │                 │         │
│       │                          │           │                 │         │
│       │  2  402 Payment Required │           │                 │         │
│       │ ◄─────────────────────   │           │                 │         │
│       │                          │           │                 │         │
│       │  3  X-PAYMENT (signed)   │           │                 │         │
│       │ ─────────────────────►  │           │                 │         │
│       │                          │  4  /v1/settlements        │         │
│       │                          │ ─────────────────────►    │         │
│       │                          │           │  5  submit USDC│         │
│       │                          │           │ ──────────────► │         │
│       │                          │           │                 │         │
│       │                          │           │  6  tx confirmed│         │
│       │                          │           │ ◄────────────── │         │
│       │                          │  7  settled callback       │         │
│       │                          │ ◄─────────────────────    │         │
│       │  8  webhook + 200 OK     │           │                 │         │
│       │ ◄─────────────────────   │           │                 │         │
│       │                          │           │                 │         │
│                                                                          │
│  Step 4 → 5  Wea broadcasts the signed transaction to Solana            │
│             via one of the healthy RPC nodes (priority QuickNode-1).     │
│             Average latency: 220ms.                                      │
│                                                                          │
│  ─── Recent real x402 actions on Netstars (Devnet) ──────────────       │
│  > Claude Opus inference        api/v1/messages       ¥420   2s ago     │
│  > Generate JP product copy     api/v1/messages       ¥80    8s ago     │
│  > Competitor price analysis    api/v1/messages       ¥120   14s ago    │
│  > Token top-up                 api/v1/token-purchase $10.00 32s ago    │
│  > Gemini long-context query    api/v1/messages       ¥56    1m ago     │
└────────────────────────────────────────────────────────────────────────┘
```

**为什么有这个页面**：
- 开发者第一次接入时，**协议黑盒**是最大恐惧。一个能"按播放键看完整流程"的页面胜过 1000 行文档。
- 经营层访问 demo 时，**这个页面就是 elevator pitch**：30 秒看完，立刻 get "X402 = Agent 自治支付的 HTTP 401 同级品"。
- web4.ai 用 sticky 边栏永远展示协议；我们用独立页面 + 真实最近交易聚合。

**交互细节**：
- **▶ Play**：箭头依次 1→2→...→8 脉冲（每步 600ms），关键字段动态出现（如 `signed_tx_base64: 5KJp...`）
- **Recipe selector**：`Token purchase / AI call / Failed payment / Refund` — 同一个图按场景跑不同 recipe，覆盖反向路径教学
- **底部 ticker**：与 Dashboard 复用同一个 `live activity` 组件，但 filter `source = x402_payment`
- **Speed control**：0.5× / 1× / 2× / 4× — 教学时慢，演示时快
- **可分享 URL**：`?recipe=token_purchase&speed=1&autoplay=true` — 销售可以贴链接给客户
- **静态 fallback**：reduce-motion 用户看到的是全部 8 步同时显示（不丢信息）

**实现要点**（给前端工程）：
- SVG line + `stroke-dasharray` 动画做流动效果（避免 canvas，便于无障碍）
- `aria-live="polite"` 报每一步给屏幕阅读器
- Recent ticker 直接调 `GET /v1/usage?recent=true&limit=10`，5s 轮询；reduce-motion 下退化为静态列表

### 5.8 Audit Log（合规导出）

```
┌────────────────────────────────────────────────────────────────────────┐
│ Audit Log                                                               │
├────────────────────────────────────────────────────────────────────────┤
│  [Last 7d ▾]  [All actions ▾]  [All actors ▾]   Search: [____________] │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │ Time              Actor              Action          Resource   │     │
│  │ ───────────────── ─────────────────  ──────────────  ────────── │     │
│  │ 2026/05/26 14:23  yamada@acme.co.jp  api_key.view   agk_01HX...│     │
│  │ 2026/05/26 14:18  system              token.credit   pmt_01HX...│     │
│  │ 2026/05/26 14:15  yamada@acme.co.jp  api_key.create agk_01HY...│     │
│  │ ...                                                              │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  Click row → see before / after state + trace_id link to Grafana Tempo. │
│  Logs retained 90 days hot / 7 years cold (compliance).                 │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. 通用组件清单（基于 shadcn/ui）

| 组件 | shadcn 组件 | 备注 |
|------|-----------|------|
| Page header | 自定义 | `<h1>` + breadcrumb + actions |
| KPI card | `Card` + tabular-nums | 大数字 + 单位 + 同比 |
| Data table | `Table` + TanStack Table | server-side pagination/filter/sort |
| Chart | `Recharts` LineChart/BarChart | 用 `--chart-*` 调色板 |
| Sidebar | `Sidebar` (shadcn) | 折叠/展开 + active 高亮 |
| Command palette | `Command` + `Dialog` | ⌘K 全局搜索 |
| Toast | `Sonner` | 仅 success/error，不刷屏 |
| Badge | `Badge` | status: active / revoked / failed / pending |
| Tabs | `Tabs` | 顶部 underline 风格 |
| Empty state | 自定义 | icon + 一句话 + 引导链接 |
| Loading skeleton | `Skeleton` | 优于 spinner |
| Tooltip | `Tooltip` | hover 显示完整内容；移动端长按 |

---

## 7. 状态设计（所有页面通用）

### 7.1 Loading
- **First paint**：服务端 React Server Components 预渲染骨架
- **Skeleton**：表格/图表区域显示 skeleton（≥300ms 才显示，避免闪烁）
- **Inline**：分页切换 / filter 切换时表格上方 progress bar

### 7.2 Empty
| 场景 | 内容 |
|------|------|
| 无 API Key | "No API keys yet. Create one via API: `POST /console/api-keys` (Console UI: Phase 2)" |
| 无消耗记录 | "No usage in selected period. Try expanding the time range." |
| 无发票 | "No invoices yet. The first invoice will be generated on the 1st of next month." |

每个 empty state 必带：图标 + 一句话 + 下一步引导（链接到 docs）。

### 7.3 Error
- 网络/API 错误：行内 toast + retry 按钮
- 鉴权失败：跳回登录页 + 友好提示
- 部分失败（如 9 条成功 1 条失败）：表格行内显示 `failed` badge + tooltip 错误码

### 7.4 Phase 2 即将上线的功能
不藏起来，明确显示：
- 按钮文字保留 + `disabled` 灰色
- hover tooltip: `Available in Phase 2 (Q3 2026). For now, use API: <link>`

这是**透明诚实**的设计而非"挖坑"。

---

## 8. 交互细节

### 8.1 表格
- **server-side**：filter / sort / pagination 全走后端（B2B 数据量大）
- **column resize**：可拖（saved per user）
- **row click**：进入详情；行内不放按钮（避免误触）
- **hover**：整行 `bg-muted` 高亮，cursor-pointer
- **selection**：Phase 1 不需要（仅只读）
- **dense mode toggle**：右上角；存 user preference

### 8.2 时间范围 selector
预设 + 自定义；选中后 URL query param 同步（可分享/书签）

### 8.3 ⌘K 命令面板
```
> _

──── Recent ────
🔍  payment pmt_01HX...
🔍  agent ak_a1b2...

──── Jump to ────
📊  Dashboard
📈  Usage
🔑  API Keys

──── Search ────
"pmt_..."  → payment lookup
"req_..."  → request lookup
"tx ..."   → on-chain tx lookup
"00-..."   → trace_id lookup
```

### 8.4 跳转 Trace（透明度）
任何 trace_id 链接 → 在新 tab 打开 Grafana Tempo（如果用户有权限）；否则显示提示。
这让客户能**自助排障**，减少 support 成本。

---

## 9. 无障碍（WCAG 2.1 AA 全面达标）

| 检查项 | 实现 |
|--------|------|
| 颜色对比度 | 所有文本/UI 元素 ≥ 4.5:1（大文本 3:1）；见 §2.1 验证表 |
| 仅靠颜色不传达信息 | status 必带 icon + 文字（不只是绿点） |
| 键盘导航 | 所有交互可 Tab；focus ring 明显（`ring-2 ring-brand-primary`） |
| Skip link | `<a href="#main">Skip to main content</a>` 第一个 tab stop |
| Heading 层级 | h1 → h2 → h3 顺序，不跳级 |
| 表单 label | 所有 input 有 `<label>`；error 用 `aria-describedby` 关联 |
| Icon-only button | 必带 `aria-label` |
| 表格 | `<th scope="col">` + 排序状态 `aria-sort` |
| 动态内容 | `aria-live="polite"` 用于通知；`role="alert"` 用于错误 |
| 焦点管理 | 路由切换后焦点移到 `<main>` |
| 缩小动效 | `prefers-reduced-motion: reduce` 时禁用 transition |
| 高对比度模式 | `forced-colors: active` 适配 Windows 高对比度 |

测试：每 PR 跑 `axe-core` + 手动键盘测 + 季度真人盲测（NVDA / VoiceOver）。

---

## 10. 国际化（i18n）

### 10.1 技术方案
- `next-intl`（App Router 友好）
- 顶部语言切换（默认依据 Accept-Language；用户选择记入 cookie）
- 路由：`/[locale]/dashboard`（`/ja/dashboard` / `/en/dashboard`）

### 10.2 翻译策略
- **关键文案双语审校**：日文由 Netstars 本地团队 review；英文由专业译者
- 命名约定：`<section>.<page>.<key>`（如 `dashboard.kpi.balance`）
- ICU MessageFormat 处理复数、性别、时间

### 10.3 区域格式
| 数据类型 | 日语 | 英语 |
|---------|------|------|
| 日期 | 2026/05/26 | May 26, 2026 |
| 时间 | 14:23 | 2:23 PM |
| 金额 (JPY) | ¥234,500 | ¥234,500 |
| 金额 (USDC) | 0.83 USDC | 0.83 USDC |
| 大数字 | 12,400,000 (no 万 — 商务场景不用) | 12,400,000 |
| 百分比 | 12% | 12% |

> 决策：金额不强制翻译成万単位（経営層更习惯阿拉伯数字 + 千位逗号），与 Stripe/财务软件一致。

### 10.4 布局适配
- 日语比英语短约 15-20%（汉字密度高），UI 元素 max-width 用日语压力测；不假设英语布局够用
- 避免硬编码英语简写（"Req/min" 等）；用 token + translation

---

## 11. 性能预算（B2B SaaS Dashboard 标准）

| 指标 | 目标 | 实现 |
|------|------|------|
| TTFB | < 1s (Tokyo) | RSC 服务端渲染 + RDS 同 region |
| LCP | < 2s | 关键 above-the-fold 直出；图表懒加载 |
| FID | < 100ms | 不在 main thread 做重计算 |
| CLS | < 0.05 | 所有 chart/image 预留 aspect-ratio |
| JS bundle (initial) | < 200KB gzipped | shadcn 按需 import；recharts 动态加载 |
| Lighthouse Perf score | ≥ 90 | CI 每 PR 跑 |
| Lighthouse A11y score | ≥ 95 | 同上 |

---

## 12. Dark Mode

完整支持。切换：System default / Light / Dark。

颜色映射见 §2.1。关键检查：
- 切换不闪烁（用 `next-themes` + `suppressHydrationWarning`）
- 图表色板 dark mode 单独调（亮色背景下 #2563EB 在 dark 模式偏暗，调亮到 #60A5FA）
- 不简单反转 — 阴影/边框单独定义

---

## 13. 错误页面

| 状态 | 处理 |
|------|------|
| 404 | 自定义页面 + 跳回 Dashboard 按钮 |
| 403 | 显示"无权限"+ 联系管理员 + 当前角色 |
| 500 | "出错了" + retry + error_id + support 链接 |
| 维护中 | 全屏 maintenance 页（不让用户进登录） |

---

## 14. 实施清单（开发顺序建议）

Phase 1 MVP（顺序）：
1. App Shell（TopBar + Sidebar + Routing + i18n + Auth）
2. Dashboard（最高曝光，先打磨）
3. Tokens（账本是核心）
4. Usage
5. API Keys
6. Models
7. Invoices
8. Audit Log
9. Settings（只读字段）

每个页面交付要素：
- [ ] 桌面 + 移动布局
- [ ] Loading / Empty / Error 三态
- [ ] 日英双语
- [ ] axe-core 全绿
- [ ] Lighthouse perf ≥ 90
- [ ] dark mode

---

## 15. 与 Tier 2 的衔接（下轮交付）

- [ ] 高保真 Figma mockups（每页 4 屏：default / loading / empty / error；light + dark）
- [ ] 完整 shadcn 组件库 token 定制（自定义 theme.css）
- [ ] 关键页面的 React Server Components 实现样板
- [ ] Storybook 配置（组件库 doc + visual regression test）
- [ ] Playwright E2E 关键路径脚本

---

## 16. 参考

- Stripe Dashboard — 信息密度 / 表格交互 / 帮助系统
- Vercel Dashboard — 全局搜索 / Project switcher
- Linear — 键盘快捷键 / Command palette
- Anthropic Console — Provider 视角的 API key 管理
- shadcn/ui — 组件库底座（MIT, 可商用）
- Recharts — 图表（轻量 + React 友好）
- ui-ux-pro-max design system output（见本文档 §2 token 来源）
- **[web4.ai](https://web4.ai)** — Live activity ticker（§5.1 Dashboard）+ Protocol Explorer 交互动画（§5.7b）的灵感来源；
  不借鉴其 EB Garamond 维多利亚版式（与我们 B2B Stripe-风方向相悖）
  及 Conway's Game of Life 背景（与产品不相关）

---

## 17. v1.1 变更（受 web4.ai 启发）

- **§4 IA**：新增 #7 Protocol Explorer 页（Phase 1 选交付；预计开发 3-5 天）
- **§5.1 Dashboard**：把"Recent activity"升级为带图标的 Live Activity Ticker（pulse 绿点、slide-in 动效、Mono 金额对齐）
- **§5.7b**：新增 Protocol Explorer 完整规范（8 步动画 + Recipe selector + 真实交易 ticker）

借鉴的本质是 **"让协议变得有形可感"** 这一信念——
web4.ai 把抽象的 HTTP 402 通过具体的 "$5 Linux VM" / "$0.02 inference" 让任何读者 30 秒内理解。
我们的版本把它落到 Console，让商户既能管理也能向他们的内部 stakeholder 演示"AI agent 在我们这里花钱"。
