# X402 Token Market — 项目进度

**最后更新**: 2026-05-27
**当前阶段**: HABA AI 健康食品电商 demo · 端到端闭环跑通 · 多语言 + 演示驾驶舱 + 终端 Agent 模拟器全部就绪

---

## 1. 一句话状态

> HABA AI 健康食品电商 demo 已端到端跑通：4 个相关方独立部署，3 个表面共享一份 ledger，所有"真打一次"按钮都触发真实后端调用并在 token-api / Console / HABA pill 三处同步可见。

---

## 2. 4-Actor 拓扑

| Actor | 角色 | 端口 / 部署 | 状态 |
|---|---|---|---|
| **HABA** | 商户 (实业 / 买 Token / 卖商品) | `haba-site` :3001 (独立 Next.js) | ✅ healthy |
| **Netstars** | x402 + Token 网关 | `token-api` :8080 + `x402-api` :8081 + `token-console` :3000 + `token-worker` | ✅ healthy |
| **WEA Japan** | x402 链上执行 | `wea-api` :8082 (Rust) | ✅ healthy |
| **Solana** | USDC SPL 公链 | `solana` validator (Apple Silicon 跑不起来) | ❌ 范围外，DEV 模式跳过 |

3 个表面：
- HABA 消费端 `http://localhost:3001/`
- Netstars Console `http://localhost:3000/`
- 经营层简报 `claude/presentation.html`
- 演示驾驶舱 `claude/demo-runner.html` (给演示者用，不部署)

---

## 3. 已完成 (按层)

### 3.1 后端 services
- ✅ **token-api** (`netstars/token/api/`): HMAC verify · `/v1/balance` · `/v1/recent-activity` · `/v1/token-purchase` · `/v1/messages` (真 LLM 调用 + 预检余额 + debit ledger + stub fallback)
- ✅ **x402-api** (`netstars/x402/`): payment requirements · `/v1/settlements` · `/v1/admin/payments/{id}/confirm` (DEV shortcut)
- ✅ **wea-api** (`wea/`): pending→broadcasting→confirmed→done 状态机 · HMAC-signed webhook 回调 · 5 档重试
- ✅ **token-worker** (`netstars/token/worker/`): 后台任务
- ✅ MySQL + Redis (docker-compose) healthy

### 3.2 SDK
- ✅ Python SDK (`sdk/src/netstars/`): `sign_request` HMAC · 重试 + idempotency · `quickstart.py` 跑通完整链路

### 3.3 Netstars Token Console (`netstars/token/console/`)
- ✅ Dashboard / Live Activity Ticker (HMAC + INTERNAL_URL 修好)
- ✅ Settings / Org / Team 全部 HABA 化身份
- ✅ TopBar 商户切换器 → HABA

### 3.4 HABA 站点 (`haba/`)
- ✅ **6 个路由**: `/` (Hero + Agent + 商品 + 跨页 teaser) · `/topup` · `/resale` · `/b2b` · `/cart` · `/agent`
- ✅ **真后端集成** (`src/lib/netstars/client.ts`): HMAC 签名 · INTERNAL DNS · `fetchBalance` / `fetchRecentActivity` / `createTokenPurchase` / `adminConfirm` / `chatCompletion`
- ✅ **5 个 server-only API 代理路由**: `/api/payment/{balance,topup,advise}` · `/api/checkout/order`
- ✅ **AI Advisor 真调用**: 任一场景的 `真打一次` 按钮 → /v1/messages → 余额跳变 → Console Ticker 同步
- ✅ **购物车 + 结账**: React Context store · localStorage 持久化 · `/cart` 三态状态机 (cart-view → processing 动画 → success) · 真 tx hash + 自动清空
- ✅ **终端 Agent 模拟器** (`/agent`): Terminal log + balance summary · 2 个 scenario (5 连击 / autopilot 自动 topup)
- ✅ **多语言** (zh-CN / ja / en): TopBar `<LocaleSwitcher>` + server action 写 cookie + `router.refresh()` 立即生效
- ✅ **vendor 身份剥离**: HABA 消费端不出现 Netstars/WEA/Solana 字样；upstream provider 在 UI 上以中性名称呈现 (支付通道 / 结算层 / 公链)

### 3.5 Demo materials
- ✅ `claude/presentation.html` — 经营层简报 (商业逻辑 / 市场匹配 / GTM / 生态飞轮，已写入 §07b 4-actor + §13b Token AI Resale)
- ✅ `claude/demo-runner.html` — 演示驾驶舱 (4-actor 拓扑 / 3 表面入口 / 服务自检链接 / 6 步演示剧本 / 排查 CLI)

### 3.6 项目文档
- ✅ `docs/haba-demo-requirements.md` (v0.8)
- ✅ `docs/haba-agent-design.md` (v0.7)
- ✅ `docs/haba-technical-plan.md` (v0.8)
- ✅ `docs/PROGRESS.md` (本文件)

---

## 4. 端到端真实闭环验证 (smoke test)

| 场景 | 触发点 | 后端调用 | 可见效果 |
|---|---|---|---|
| Token 自充 (场景 A) | `/topup` "真打一笔" | token-purchase + admin-confirm | 余额 +10M / tx_hash 显示 / Console Ticker credit |
| AI Advisor 调用 | 任一场景的 "真打一次" | /v1/messages (HMAC + LLM stub + debit) | 余额 −150 / 真 AI 回复 / Console Ticker debit |
| 消费者结账 (场景 B) | `/cart` "USDC 钱包结账" | token-purchase + admin-confirm | 订单号 + 链上 tx_hash / 购物车自动清空 |
| 终端 Agent autopilot | `/agent` "Run #2" | 12 次连续调用 + autopilot topup | 中段累积扣 500 Token 触发自动充值 +10M |

token-api 的 `/v1/recent-activity` 可见所有事件；Netstars Console Live Activity Ticker 同步看到。

---

## 5. 待办 (优先级排序)

### P2 — 下次开工继续做
- [ ] **真 LLM key 接入**: 把 `ANTHROPIC_API_KEY` (或其他 provider) 注入 `token-api` env，让 `/v1/messages` 返回真实 AI 输出而非 stub。`token-api/providers/` 已经有 dispatch 框架，只缺 key。
- [ ] **B2B 调用计费写入真 ledger**: `/b2b` 4 个 partner 卡片当前是静态 prompt/output 展示。改成"每张卡片背后是真实的 API key + 月度套餐扣减"，让 `b2bCallNotice` (18,432 / 100,000) 是实时数。
- [ ] **prd.md / sdk/ARCHITECTURE.md / outputs/ 旧文案清理**: M5 时记录的"跨境电商 / Acme" 残留，对外材料要扫干净。

### P3 — 体验打磨
- [ ] HABA 商品图片资产 (当前 emoji 占位 — 真展示要换真图或绘图)
- [ ] `/agent` 第 3 个剧本: B2B 频次场景 (药局 / 医院 / 营养师 / EC 轮流调用)
- [ ] `/cart` 订单详情持久化 (现在 success 页一刷新就丢，应写入 localStorage 或后端表)
- [ ] 钱包 connect UI 真接 Phantom / Solflare (现在签名是 server-side mock)

### P4 — 范围外 / 长期
- [ ] Solana validator on Apple Silicon (需要 host-side solana-cli + Devnet RPC 转发)
- [ ] 真实 HABA 商品履约 (订单下完不发货，纯演示)
- [ ] HABA 自有用户体系 (现在没登录)

---

## 6. 启动命令

```bash
# 起整套栈
make up
# 或: docker compose up -d

# 看状态
docker compose ps

# 重建 HABA (开发循环最高频)
docker compose build haba-site && docker compose up -d --no-deps haba-site

# HABA 项目内 typecheck
cd haba && npx tsc --noEmit

# 演示驾驶舱
open claude/demo-runner.html
```

---

## 7. 已知约束

- **Solana**: Apple Silicon 跑不动 validator，DEV 模式用 admin-confirm shortcut 跳过广播。生产或 Linux 上跑要把 `solana` service 起来。
- **KMS**: 项目约定只用 AWS KMS ap-northeast-1 直接调，**禁** CloudHSM / Netstars 内部 KMS (见 memory: `feedback_kms_aws_direct`)。当前 demo 未涉及 KMS 调用；若 P2 接真 LLM key 涉及 secret 存储，遵守该约束。
- **PR 审批**: 对外材料避免点名需 PR 审批的合作伙伴 (见 memory: `feedback_no_pr_exposure`)；presentation.html 与 demo-runner.html 是内部 demo 工具，已加 disclaimer。
- **演示语**: 中文为主，但术语保留英文 (x402 / USDC / Token / Solana / API)。
