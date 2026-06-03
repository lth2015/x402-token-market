# AI-Native Commerce Infrastructure

**Netstars × HABA — Metered AI for Enterprise Operations**

> When AI works overnight, every token becomes a business record.

[日本語](README.ja.md) · [中文](README.zh.md)

---

## The Business Problem

Enterprise AI agents execute real operational work — pricing analysis, content generation, logistics optimization — around the clock. Most platforms today, however, have no standard for metering those calls, no billing boundary, and no settlement trail.

The result: AI costs are invisible, unmanageable, and impossible to turn into a product you can sell to the next customer.

---

## What This Is

Two products. One business story.

### HABA Enterprise

A cross-border e-commerce brand running AI agents for overnight operational tasks. Instead of having a team come in at 9 AM to do routine work, HABA's agents complete pricing analysis, bilingual copywriting, and logistics comparisons while the office is dark.

The enterprise dashboard shows the team exactly what happened: which tasks ran, how many tokens were consumed, and what the AI produced — in a form ready to act on first thing in the morning.

### Netstars Token Platform

The infrastructure layer that makes AI usage measurable and monetizable.

Every AI call made by HABA agents is metered against a token balance. When that balance drops below 20%, the platform triggers an automated top-up via the x402 settlement protocol on Solana — no human approval, no bank transfer delay, 420 milliseconds end-to-end.

On the Netstars side, every settlement is platform revenue. The console shows MTD revenue trends, merchant activity rankings, and model usage breakdown — a real-time view of an AI commerce flywheel in motion.

---

## Business Value

| For enterprise customers (HABA) | For the platform operator (Netstars) |
|---|---|
| AI agents work 24 / 7 without human oversight | Every AI call becomes a billable, auditable event |
| Token balance is always visible, never surprising | Settlement is automatic — no manual invoicing |
| Auto top-up ensures agents never stop mid-task | Platform revenue scales directly with merchant AI usage |
| One dashboard to see AI cost, output, and ROI | Replicable model: onboard next merchant, same infrastructure |

---

## Platform Architecture

```
HABA Enterprise Dashboard  →  Netstars Token API  →  x402 Gateway  →  Wea Facilitator  →  Solana (USDC)
       (Next.js)                  (FastAPI)            (FastAPI)          (Rust axum)
```

| Service | Role | Port |
|---|---|---|
| HABA Enterprise | AI agent dashboard · token balance · auto top-up | 3001 |
| Netstars Token Console | Revenue analytics · merchant rankings · activity feed | 3000 |
| Netstars x402 Console | Payment protocol telemetry | 3002 |
| Wea Facilitator Console | On-chain settlement telemetry | 3003 |
| token-api | AI usage metering and token ledger | 8080 |
| x402-api | Payment protocol gateway | 8081 |
| wea-api | Solana settlement facilitator | 8082 |

---

## Business Demo Flow

| Scene | Where | What to show | The takeaway |
|---|---|---|---|
| 1 · AI at work | HABA `/dashboard` | Trigger three agent tasks, watch token balance update in real time | Real AI calls, visible cost |
| 2 · Budget control | HABA `/budget` | Show the 80% threshold rule and progress gauge | Enterprises set rules; AI manages itself |
| 3 · Auto settlement | HABA `/topup` | Review top-up history, authorize via Touch ID | x402 settles on Solana in 420 ms, no human in the loop |
| 4 · Morning report | HABA `/dashboard` | Show agent outputs and restored token balance | Overnight AI work → actionable conclusions at 9 AM |
| 5 · Platform view | Netstars `/revenue` + `/merchants` | MTD revenue curve and merchant activity ranking | Every merchant's AI usage is Netstars platform revenue |

---

## Quick Start

```bash
docker compose up -d
make migrate-x402
```

Verify services are healthy:

```bash
docker compose ps
```

---

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — System architecture and settlement flow
- [prd.md](prd.md) — Master product requirements
- [story.md](story.md) — Business narrative and poster prompts
- [LOCAL-DEV.md](LOCAL-DEV.md) — Local environment setup
- [docs/PROGRESS.md](docs/PROGRESS.md) — Implementation status
