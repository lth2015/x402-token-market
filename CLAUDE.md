# X402 Token Market — Project Context

> 入口路由。本文件只放最高频事实；详尽内容指向权威文档，避免每次对话重复加载。

## 一句话定位

Netstars + Wea Japan 共建的 **AI Token 流通市场**：x402 协议 + Solana USDC 结算。

## 模块边界（独立部署 / 独立 DB / 独立 CI）

| 模块 | 路径 | 技术栈 | 角色 | 本地端口 |
|---|---|---|---|---|
| haba | [haba/](haba/) | Next.js 15 · React 19 · Tailwind · next-intl | 消费端 demo 站（health food EC） | 3001 |
| x402 | [netstars/x402/](netstars/x402/) | FastAPI · Python | x402 协议 gateway（资源服务器） | 8081 |
| token | [netstars/token/](netstars/token/) | FastAPI · Next.js Console | Token 账本 + AI usage metering + Console | 8080 / 3000 |
| wea | [wea/](wea/) | Rust axum · sqlx · Solana JSON-RPC | x402 facilitator + 链上执行 | 8082 |
| sdk | [sdk/](sdk/) | Python（Phase 1） | 商户接入库 | — |

各模块独立 console：x402 console 3002 · wea console 3003 · token console 3000。

## 严禁事项（架构原则 · 详见 [ARCHITECTURE.md](ARCHITECTURE.md) §1）

- **AP4** Netstars 永不直连 Solana — 链上操作只在 wea
- **KMS** 只用 AWS KMS ap-northeast-1（Tokyo）direct — 不用 CloudHSM / YubiHSM / Netstars 内部 KMS
- **AP2** 模块间数据库不共享 — 只通过 API 通信
- **AP6** API 向后兼容 ≥ 12 个月

## 用户级规则（持久）

- 对外材料 / 消费端系统**不出现** demo 痕迹 / x402 / token / 上链字眼 — 放 PPT
- 对外材料**不点名**需 PR 审批的合作伙伴
- 经营层 PPT：商业逻辑 / 市场匹配 / GTM / 生态飞轮，避免无来源数字
- AI 服务**默认 OpenAI gpt-4.1**；Anthropic 已封号永久排除
- 写代码 / 设计 Console UI **显式调用** `ui-ux-pro-max` skill
- Demo 场景统一用「跨境电商运营 Agent」，不切回机场/任何客户场景

## 关键决策（v1.1 已锁，详见 [prd.md](prd.md) §13）

- **D1** SDK Phase 1 仅 Python
- **D2** 鉴权 API Key + HMAC-SHA256（DID 推到 Phase 3+）
- **D7** Phase 1 不交付 MCP；Console 仅只读
- **TOK-Q1** Token 系统全量重写，不复用既有代码
- **D8** Aurora MySQL 8.0；单一 QA 环境；K8s 手写 YAML（不用 Terraform）

## 本地栈

```bash
docker compose up -d
make migrate-x402
python3 scripts/x402_protocol_e2e.py   # E2E 应全部 assert pass
```

注意：Apple Silicon 上 Solana validator 不可用（amd64 only / AVX 缺失）。要跑真链请 host 装 solana-cli 走 native；详见 [LOCAL-DEV.md](LOCAL-DEV.md)。

## 权威文档（按需查阅 / 不预加载）

- [prd.md](prd.md) — Master PRD
- [ARCHITECTURE.md](ARCHITECTURE.md) — 系统级架构（C4 模型）
- [LOCAL-DEV.md](LOCAL-DEV.md) — 本地开发踩坑
- [docs/PROGRESS.md](docs/PROGRESS.md) — 实施进度
- 各模块 `<module>/PRD.md` · `<module>/ARCHITECTURE.md` · `<module>/DESIGN.md`

## Subagent 使用指引（**省 token 关键**）

具体到某个模块的实现任务，**主 loop（Opus）必须委托给对应模块 agent**（都用 Sonnet）：

| 任务 | Agent |
|---|---|
| haba 前端 / Next.js / i18n / 消费端 UI | `haba-engineer` |
| x402 协议 / FastAPI gateway / payment proof | `x402-engineer` |
| token 账本 / metering / token console | `token-engineer` |
| Solana 链上 / Rust / facilitator / KMS 签名 | `wea-engineer` |
| 跨模块研究 / 找不到去哪 | `Explore`（read-only，便宜） |

**主 loop（Opus 4.8）只做**：规划、跨模块决策、final review、用户对话。具体编码委托 agent，减少主 context 占用。
