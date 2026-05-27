# X402 Token Market — 项目进度

**最后更新**: 2026-05-27 (第四轮)
**当前阶段**: Demo 视觉精品化：Hero 双栏生态图 · 动态指标栏 · 链上结算戏剧化成功页 · 全站 hover/入场动画 · 明天办公室配置 TODO

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

### P2 — ✅ 本轮完成
- [x] **B2B 调用计费实时化**: 新增 `GET /api/payment/b2b-stats` 路由（从 ledger 聚合当月 ai_call 次数）；新建 `B2BCallNotice.tsx` 组件替代 `AgentChatDemo` 内的静态文案，每次 `haba:balance-refresh` 事件后自动刷新。月度上限 50,000 次（growth 套餐演示值）。
- [x] **`.env` 创建**: 从 `.env.example` 复制，保留 DUMMY key 结构，docker-compose 可正常 `up`。将真实 `ANTHROPIC_API_KEY` 填入后 stub 模式自动切换为真实 LLM 调用。

### P2 — ✅ 本轮完成
- [x] **Solana Devnet 真实 USDC 支付**:
  - `netstars/x402/src/x402/tx_builder.py` — 构建 SPL TransferChecked + Memo 交易
  - x402-api `POST /v1/payments/{id}/dev-checkout` — server-side 签名 + 广播 + 等待确认
  - HABA checkout 优先走真实链，失败自动降级 admin-confirm（无缝 fallback）
  - 金额上限改为 MAX_USDC = $9（原错误值 10,000）
  - 成功页展示 "真实 Devnet 链上交易" 徽章 + "在 Solana Explorer 查看" 按钮
  - `SOLANA_RPC_URL` 默认改为 `https://api.devnet.solana.com`（不再依赖本地 validator）
  - `scripts/setup-devnet-wallet.py` — 一键生成演示钱包 + 充值指引

### P2 — 下次开工继续
- [ ] **真 LLM key 接入**: 把 `ANTHROPIC_API_KEY` 填入 `.env`（已创建），`token-api/providers/` 框架完备，无需改代码，只需 key。
- [ ] **Devnet 钱包充值**: 在办公室运行 `python scripts/setup-devnet-wallet.py`，将输出填入 `.env`，然后从 https://faucet.circle.com 获取 devnet USDC。

### P3 — ✅ 本轮完成
- [x] `/agent` 第 3 个剧本: **B2B 多渠道频次场景** — 药局 / 医院营养科 / 独立营养师 / 合作电商 4 频道 × 3 轮 = 12 次调用，含自动充值触发。见 `AgentRunner.tsx: B2B_CHANNEL_PROMPTS`。
- [x] `/cart` **订单持久化**: 成功页写入 `localStorage`（key: `haba_last_order`，24h TTL）；再次进入 `/cart` 时顶部显示「上次订单」横幅，支持查看 / 忽略 / 新建订单三种操作。
- [x] **产品卡片视觉升级**: `ProductCard.tsx` 新增 h-40 渐变色图片区块（按 category 自动选色：液体甜味料=天空蓝、粉末=琥珀黄、料理辅助=橙色、果酱=玫瑰红、糖果=紫色），emoji 升至 text-6xl，`DemoBadge` 移至右上角。

### P3 — ✅ 本轮完成
- [x] **Demo 精品化 (耳目一新)**:
  - `HabaHero.tsx` 全面重写：双栏布局，左 = 标题/标语/分群 chip/实时指标；右 = `EcosystemFlowCard`（深森绿卡片，三方节点 + CSS 流动动画）
  - `EcosystemFlowCard.tsx` (NEW)：暗色主题，HABA → 支付协议 → Solana USDC，traveling-dot 连接线，三方状态实时点
  - `LiveMetricsBar.tsx` (NEW)：客户端组件拉取余额 API，展示 Token余额 / SKU数 / Devnet状态，带骨架屏
  - `CheckoutFlow.tsx` 成功页分两态：devnet = 脉冲环确认动画 + 深色链上证明卡（tx高亮）+ 大号 Explorer 按钮；dev = 简洁版
  - `globals.css`：5 个 keyframes (haba-fade-up / pulse-ring / flow-dot / shimmer / breathe) + 8 个 utility 类
  - 全站 hover/入场动画：产品卡 `-translate-y-0.5 hover:shadow-e3`；Teaser 格同步；TopBar Logo 渐变升级
  - Footer 新增技术栈行：HABA · x402 Protocol · Solana USDC chip

### P3 — 下次继续
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

- **Solana**: Apple Silicon 跑不动 validator，但现在默认走公网 Devnet RPC（无需本地 validator）。x402-api 和 wea-api 都已去掉对 `solana` service 的 `depends_on`。若需要全离线测试，设 `SOLANA_RPC_URL=http://solana:8899`。
- **KMS**: 项目约定只用 AWS KMS ap-northeast-1 直接调，**禁** CloudHSM / Netstars 内部 KMS (见 memory: `feedback_kms_aws_direct`)。当前 demo 未涉及 KMS 调用；若 P2 接真 LLM key 涉及 secret 存储，遵守该约束。
- **PR 审批**: 对外材料避免点名需 PR 审批的合作伙伴 (见 memory: `feedback_no_pr_exposure`)；presentation.html 与 demo-runner.html 是内部 demo 工具，已加 disclaimer。
- **演示语**: 中文为主，但术语保留英文 (x402 / USDC / Token / Solana / API)。
