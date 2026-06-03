# AI 原生商业基础设施

**Netstars × HABA — 企业级 AI 用量计量与结算平台**

> Agent 在工作，每一个 Token 都变成一笔清楚的账。

[English](README.md) · [日本語](README.ja.md)

---

## 问题在哪里

企业的 AI Agent 每天都在做真实的业务工作：定价分析、文案生成、物流比较——全天候不间断。

但今天绝大多数 AI 平台，无法回答这三个问题：

- 这次调用花了多少？
- 什么时候该补充额度？
- 这笔 AI 服务费，怎么变成平台可以定价的产品？

结果是：AI 成本无法管理，更无法商业化。

---

## 这是什么

两个产品，一个商业故事。

### HABA Enterprise（企业端）

一家跨境电商品牌，把三项例行工作交给了 AI Agent：

- 竞品定价扫描，输出 SKU 调价建议
- 新品英文 + 日文文案生成
- DHL / EMS / SAL 时效与成本对比

以往需要团队花两小时的工作，Agent 在深夜完成。早上九点，运营团队打开仪表盘，结论已经在那里了。

**HABA 企业仪表盘**实时显示：哪些任务在运行、消耗了多少 Token、Token 余额是否健康——以及 Agent 产出的每一项结论。

### Netstars Token 平台（基础设施端）

把 AI 使用量变成可计量、可结算、可定价商品的基础设施。

HABA Agent 的每一次 AI 调用，都从 Token 账本中实时扣减。当余额跌破 20%，平台自动触发补充：通过 x402 协议，在 Solana 上完成 USDC 结算，全程不需要人工审批，420 毫秒完成。

**Netstars Token Console** 展示的是整个平台视角：本月收入曲线、商户活跃排行、模型调用分布——AI 商业化飞轮的实时运转画面。

---

## 商业价值

| 企业客户（HABA）| 平台运营方（Netstars）|
|---|---|
| AI Agent 24 小时工作，无需人工盯班 | 每一次 AI 调用都是可计费、可审计的商业事件 |
| Token 余额实时可见，成本透明 | 结算自动完成，无需手动开票 |
| 自动补充确保 Agent 不因额度不足中断 | 平台收入与商户 AI 用量直接挂钩 |
| 一张仪表盘看清 AI 成本、产出与回报 | 可复制到下一家商户的服务模板 |

---

## 平台架构

```
HABA 企业仪表盘  →  Netstars Token API  →  x402 网关  →  Wea 结算节点  →  Solana（USDC）
   （Next.js）          （FastAPI）         （FastAPI）     （Rust axum）
```

| 服务 | 职责 | 本地端口 |
|---|---|---|
| HABA Enterprise | AI Agent 仪表盘 · Token 余额 · 自动补充 | 3001 |
| Netstars Token Console | 收入分析 · 商户排行 · 活动流 | 3000 |
| Netstars x402 Console | 支付协议遥测 | 3002 |
| Wea Facilitator Console | 链上结算遥测 | 3003 |
| token-api | AI 用量计量与 Token 账本 | 8080 |
| x402-api | 支付协议网关 | 8081 |
| wea-api | Solana 结算节点 | 8082 |

---

## 演示串场

| 幕 | 打开哪里 | 现场动作 | 观众要记住 |
|---|---|---|---|
| 幕一 · AI 在工作 | HABA `/dashboard` | 触发三个 Agent 任务，看 Token 实时消耗 | 真实 AI 调用，成本实时可见 |
| 幕二 · 预算控制 | HABA `/budget` | 展示 80% 阈值触发规则和预算进度 | 企业设置规则，AI 自我管理 |
| 幕三 · 自动结算 | HABA `/topup` | 查看充值记录，Touch ID 授权 | x402 在 Solana 上完成，420ms，无需人工 |
| 幕四 · 早晨报告 | HABA `/dashboard` | 展示 Agent 产出和余额恢复 | 深夜工作，早上直接用结论 |
| 幕五 · 平台视角 | Netstars `/revenue` + `/merchants` | MTD 收入曲线和商户活跃排行 | 每个商户的 AI 用量都是平台收入 |

---

## 快速启动

```bash
docker compose up -d
make migrate-x402
```

检查服务状态：

```bash
docker compose ps
```

---

## 文档

- [ARCHITECTURE.md](ARCHITECTURE.md) — 系统架构与结算流程
- [prd.md](prd.md) — 产品需求文档
- [story.md](story.md) — 商业叙事与海报提示词
- [LOCAL-DEV.md](LOCAL-DEV.md) — 本地环境配置
- [docs/PROGRESS.md](docs/PROGRESS.md) — 实施进度
