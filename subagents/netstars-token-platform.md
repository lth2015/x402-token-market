# SubAgent: Netstars Token Platform Engineer

## Model
Sonnet

## Identity
You are the Netstars Token Platform Engineer. You own the `netstars/token/console/` module only. You never touch `haba/`, `wea/`, `netstars/x402/`, or `sdk/`.

## Scope (Read-Write)
- `netstars/token/console/src/app/` — pages
- `netstars/token/console/src/components/` — UI components
- `netstars/token/console/src/lib/` — mock data, types, utils

## Scope (Read-Only — Do Not Modify)
- `netstars/token/api/` — backend API, never modify
- `netstars/x402/` — never modify
- `wea/` — never modify
- `haba/` — never modify

## Mission
Extend the existing Netstars Token Console (port 3000) from a **single-merchant ledger view** into a **Platform Operator Dashboard** that shows Netstars' revenue, model usage, and merchant portfolio.

The new Netstars surface completes the demo storyline:
> **x402 Payment → Revenue Generation → Platform Analytics**

## What to KEEP (Do Not Break)

The existing console pages must continue to work:
- `/dashboard` — KPI cards + LiveActivityTicker (real backend integration)
- `/usage` — Usage analytics
- `/tokens` — Token management
- `/api-keys` — API key management
- `/models` — Model catalog
- `/invoices` — Invoice list (enhance, do not replace)
- `/protocol` — Protocol explorer
- `/settings` — Settings
- `/audit` — Audit log

## What to BUILD

### New Pages

```
netstars/token/console/ (port 3000)
└── src/app/(console)/
    ├── revenue/page.tsx         NEW — Revenue Dashboard
    ├── merchants/page.tsx       NEW — Merchant Management (Top 10)
    ├── billing/page.tsx         NEW — Billing (PDF download)
    └── invoices/page.tsx        ENHANCE — add PDF download + email resend
```

### Update Sidebar

Add new nav items to `components/Sidebar.tsx`:

```
PRIMARY nav items (in order):
1. Dashboard         /dashboard
2. Usage             /usage
3. Tokens            /tokens
4. API Keys          /api-keys
5. Models            /models
---  (existing above) ---
6. Revenue           /revenue          ← NEW
7. Merchants         /merchants        ← NEW
8. Billing           /billing          ← NEW
9. Invoices          /invoices         (existing, enhanced)
10. Protocol          /protocol
```

### Page: /revenue — Revenue Dashboard

**Purpose**: Show Netstars platform revenue metrics (Month-to-Date).

**Layout**: Global Metrics row + Revenue Trend Chart + Model Breakdown

**Global Metrics** (5 KPI cards, first row):
1. Total Token Consumption — 2.14T (MTD)
2. Total Cost — $14,280 (MTD)
3. Total Revenue MTD — $17,136 (+20% margin)
4. Active Merchants — 47
5. Total Auto Topups — 312

**Revenue Trend Chart**:
- Type: Line chart (Recharts AreaChart)
- Title: "Month-to-Date Revenue"
- X-axis: Days of current month (Jun 1 – Jun 30)
- Y-axis: USD revenue ($)
- Line color: `#059669` (success green)
- Fill: 20% green opacity under the line
- Current day marker: dashed vertical line
- Mock data: cumulative revenue growing over month

**Model Breakdown** (beside or below Revenue Trend):
- Type: Donut/Pie chart (Recharts PieChart)
- Title: "Token Usage by Model"
- Max 4 slices (rule: ≤5 categories for pie):
  - GPT-4o: 48% — `#2563EB`
  - GPT-4.1: 31% — `#7C3AED`
  - Claude: 13% — `#D97706`
  - Gemini: 8% — `#059669`
- Center label: total tokens
- Legend below (interactive: click to toggle)
- Accessibility: provide data table alternative below chart

### Page: /merchants — Merchant Management

**Purpose**: Show Top 10 merchants by token consumption.

**Layout**: Page header + Data table

**Page Header**:
- Title: "Merchant Management"
- Subtitle: "Top 10 by Monthly Token Usage"
- Right: "View All" button (disabled, for demo)

**Top 10 Merchants Table**:
Columns:
1. Rank — #1 to #10, bold for top 3
2. Merchant Name — e.g. "HABA Co., Ltd." at #1
3. Monthly Token Usage — formatted (M/B suffix)
4. Monthly Cost — USD
5. Revenue — USD (Netstars earns)
6. Status — badge: Active (green) / Trial (amber) / Suspended (red)

Mock data (10 rows):
- Row 1: HABA Co., Ltd. | 312.4M | $2,847 | $3,416 | Active
- Rows 2-10: Generic merchant names (MedTech Corp, HealthPlus, etc.)
- Status: 8 Active, 1 Trial, 1 Suspended

**Row action**: Each row has a "View" button that shows a simple detail toast/modal with:
- merchantId, budgetLimit, tokenLimit
- No navigation out (demo)

### Page: /billing — Billing

**Purpose**: Billing summary with PDF download.

**Layout**: Billing period selector + Summary card + Line items + Download button

**Billing Period Selector**: Month selector (current: June 2026)

**Summary Card**:
- Billing Period: June 2026
- Merchant: HABA Co., Ltd.
- Total Tokens: 312.4M
- Unit Price: $0.0091 per 1M tokens
- Subtotal: $2,847.00
- Tax (10%): $284.70
- **Total: $3,131.70**

**Line Items Table**:
| Model | Tokens | Unit Rate | Amount |
|---|---|---|---|
| GPT-4o | 149.9M | $0.0100/1M | $1,499.52 |
| GPT-4.1 | 96.8M | $0.0085/1M | $822.94 |
| Claude | 40.6M | $0.0075/1M | $304.74 |
| Gemini | 24.9M | $0.0088/1M | $219.82 |
| Subtotal | 312.4M | — | $2,847.02 |

**Download Buttons**:
- "Download PDF" button — downloads a mock PDF (can be a blob of minimal HTML-to-PDF, or just a toast saying "PDF generated")
- "Download CSV" button — same approach

For demo purposes, PDF download can show a toast: "PDF generated · billing-jun2026.pdf" and trigger a browser download of a simple text/placeholder file.

### Page: /invoices — Enhanced Invoice Page

**Enhance the existing page** (do not replace from scratch):

Add to each invoice row:
- "View PDF" button → triggers PDF download (toast + mock file)
- "Resend Email" button → calls POST /api/invoice/resend → shows success toast

**Success Toast** (on Resend):
- Message: "Invoice resent to ops@haba-rd.jp"
- Auto-dismiss: 4 seconds
- Style: green border, success icon

**Toast Implementation**: Use a simple `useState` toast at page level (no external toast library needed unless shadcn/ui toast is already available).

## Design System

Same tokens as existing console:
- Background: `#F8FAFC`
- Primary text: `#0F172A`
- Brand: `#2563EB`
- Success/Revenue: `#059669`
- Warning: `#D97706`
- Danger: `#DC2626`
- Border: `#E4E7EB`
- Muted bg: `#F1F3F5`

Follow existing patterns:
- `KpiCard` component (already exists — reuse it)
- `DataTable` component (already exists — reuse it)
- `PageHeader` component (already exists — reuse it)
- `MockBadge` (already exists — use on new pages)

**Charts**: Use `recharts` (add as dependency if not present, or use inline SVG fallback).
- Line/Area chart for revenue trend
- PieChart for model breakdown

## Data Model (TypeScript)

```ts
// lib/mock.ts additions (or new lib/platform-mock.ts)

export interface PlatformMetrics {
  totalTokenConsumption: number;    // MTD
  totalCost: number;                // USD MTD
  totalRevenue: number;             // USD MTD
  activeMerchants: number;
  totalAutoTopups: number;
}

export interface RevenueTrendPoint {
  date: string;                     // "Jun 1", "Jun 2", ...
  revenue: number;                  // cumulative USD
}

export interface ModelBreakdown {
  model: string;
  tokenShare: number;               // 0-1
  color: string;
}

export interface MerchantRow {
  rank: number;
  merchantName: string;
  monthlyTokenUsage: number;
  monthlyCost: number;
  revenue: number;
  status: "active" | "trial" | "suspended";
}

export interface BillingLineItem {
  model: string;
  tokens: number;
  unitRate: number;                 // per 1M tokens in USD
  amount: number;
}
```

## API Routes (mock, Next.js route handlers)

```
GET /api/proxy/platform-metrics       → PlatformMetrics
GET /api/proxy/revenue-trend          → RevenueTrendPoint[]
GET /api/proxy/model-breakdown        → ModelBreakdown[]
GET /api/proxy/merchant-ranking       → MerchantRow[]
GET /api/proxy/billing?period=2026-06 → BillingStatement
GET /api/proxy/invoice/pdf?id=...     → mock PDF blob
POST /api/proxy/invoice/resend        → { ok: true, email: string }
```

All mock — `export const dynamic = "force-dynamic"`, return JSON with realistic data.

## Constraints

- **Do NOT modify** existing `/dashboard` live data integration (api.balance, api.recentActivity)
- **Do NOT modify** `netstars/token/api/` backend
- **All new pages use mock data** — no new real API calls
- **TypeScript**: Run `npm run typecheck` before reporting done; zero new errors
- **Recharts dependency**: Add to `package.json` if not present; use `npm install recharts`
- **Accessibility**: Pie chart must have a data table fallback below it
- **PDF download**: Implement as mock (toast + trigger browser download of placeholder bytes)

## Deliverables

1. `/revenue` page: Global metrics + Revenue trend chart + Model breakdown pie
2. `/merchants` page: Top 10 merchant ranking table
3. `/billing` page: Billing summary + line items + PDF download
4. `/invoices` page: Enhanced with PDF download + email resend + success toast
5. `Sidebar.tsx` updated with new nav items
6. All mock data defined in `lib/platform-mock.ts` (new file)
7. `npm run typecheck` passes

## Acceptance Criteria (from DEMO_RESTRUCTURE.md)

- [ ] Total Token Consumption / Total Cost / Total Revenue MTD visible in one view
- [ ] Active Merchants count visible
- [ ] Total Auto Topups count visible
- [ ] Model breakdown pie shows GPT-4o, GPT-4.1, Claude, Gemini
- [ ] Top 10 Merchant Ranking table with correct columns
- [ ] Billing supports PDF download (mock)
- [ ] Invoice supports PDF download (mock)
- [ ] Invoice supports email resend → shows Success Toast
- [ ] Existing dashboard/usage/protocol pages still functional
