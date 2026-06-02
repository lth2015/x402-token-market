# X402 Token Market — 项目进度

**最后更新**: 2026-06-02 (第十一轮 · 待立项全部落地 + E2E 验收 40 passed)
**当前阶段**: **标准 x402 协议层可演示 + 双 console 可观测 + GPT-4.1 Advisor 运行主线**。HABA Advisor 默认模型为 `gpt-4.1`；消费者商品结账走 HTTP 402 / `X-PAYMENT` 重试协议并由 Wea Facilitator 结算到 Solana Devnet USDC；C 端继续隐藏内部 Token 余额与成本细节。

## 第十一轮 · 待立项全部落地 + E2E 验收（2026-06-02）

把第十轮列出的待立项**全部认真做完**，并以本地栈 + E2E 实测验收（不止单测/cargo check）。

### token 线（token-engineer）
- ✅ **FX 去硬编码**：`FX_JPY_PER_USDC` env 注入，`/v1/balance` 不再字面写死 150。
- ✅ **per-key rate limiter + last_used**：Redis 滑窗 RPM + 分钟桶 TPM，超限 429+`Retry-After`；`_touch_last_used` fire-and-forget 不阻塞请求；无配置值不限流（向后兼容）。
- ✅ **GET /v1/merchant/profile + console 动态读取**：从 merchants 表读，console 走 API（env 降级为 fallback）。
- ✅ **worker 真正落地**：reconciler / invoice_generator / usage_aggregator / anomaly_detector 用 APScheduler 实现；reconciler 通过 x402 `GET /v1/payments` 拉单写 `payment_orders_mirror`（AP2 只走 API）。**容器实测 4 job 全绿**（修复见下）。

### wea 线（wea-engineer）
- ✅ **GET /facilitator/tx/:signature**：x402 confirmer 委托此端点查链上状态（pending/confirmed/finalized/failed），x402 不再直连 Solana 读。
- ✅ **KMS 真实集成**：`aws-sdk-kms`（ap-northeast-1 direct，optional feature `aws-kms`）；KMS_MODE=aws 走真实 Encrypt/Decrypt，dev 明文 fallback；wire format 0x00(dev)/0x01(aws)。生产编译需 Rust ≥1.91 + `--features aws-kms`。
- ✅ **depeg 守护**：worker 每 60s 拉价（PriceFeed trait，dev=MockPriceFeed 健康价 / 生产 http），连续越界 window 翻 `accepting_new_settlements=false`；settle 入口检查 flag。
- ✅ **生产硬化**：`WEA_LISTEN_ADDR` env 可配；`rpc_endpoints` 表多 RPC pool + failover；`/facilitator/*` 与 `/v1/settlements` interim `X-Internal-Auth` guard（统一 middleware layer，mTLS 留 TODO）。
- ✅ **dead-code 清理**：正当保留项加 `#[allow]`+TODO。

### x402 线（x402-engineer）
- ✅ **confirmer 改委托 wea**：彻底完成 AP4——支付路径与遗留 proof 路径均不再直连 Solana（仅剩 readyz 探针 + demo-only blockhash 端点）。
- ✅ **GET /v1/payments**：only-read，internal-auth，供 token worker reconciler 对账。
- ✅ **清理**：`__version__` 单一来源（三处统一 0.4.0）；`signed_tx_hash` 加 UniqueConstraint 对齐 migration；Dockerfile 支持已提交 lock。

### haba 线（haba-engineer）
- ✅ 删除死代码 `ProductGrid` / `DemoBadge`；清理全仓库注释/命名里的 `demo` 字样；typecheck/build 干净。

### E2E 验收 + 过程中发现并修复的 3 个集成回归
rebuild 全部受影响服务 → `python3 scripts/x402_protocol_e2e.py` → **40 passed · 0 failed**。过程中暴露并修复（单测/cargo check 抓不到、只有真实运行才暴露）：
1. **wea RpcPool 选到占位 URL**：`rpc_endpoints` seed 全是 `REPLACE.*` 占位 → settle 502。修：pool 过滤占位/不可达 URL，无有效端点时 fallback 到 env `SOLANA_RPC_URL`（真 devnet）。
2. **depeg 本地拉 CoinGecko 失败空转**：dev 默认改 `DEPEG_PRICE_FEED=mock` 健康价，不再每分钟刷 WARN。
3. **token-worker async/sync 不匹配**：docker-compose 把 worker `DATABASE_URL` 误配 `aiomysql`（async）而代码是 sync `create_engine` → 每个 job `greenlet_spawn` 报错。修：改回 `pymysql` + db 层 driver guard；新增 migration 003 建齐 `invoices/invoice_items/audit_log/usage_daily` 等 worker 依赖表（此前只在 SCHEMA.sql 未进 migrations）。容器实测 4 job 全绿。
4. **安全一致性**：补齐 `/facilitator/verify`/`settle` 的 internal-auth guard（此前裸奔），x402 调用同步带 header，加 guard 后 E2E 仍 40 passed。

### 遗留（生产前事项 / 不阻塞 demo）
- **poetry.lock 未提交**：本机 Python 3.10（项目要 3.12），需在 CI/3.12 环境 `poetry lock` 后提交（x402）。
- **KMS aws feature 编译**：需 Rust ≥1.91.1（当前 1.88）+ `cargo build --features aws-kms` + 配 `KMS_KEY_ID`。
- **reconciler 对账规则待细化**：当前把所有 x402 confirmed 都期望有 ledger credit，对"商品结算（by-design 不充值 token）"误报 missing_credit。需按订单类型区分对账规则。
- **mTLS**：当前 wea 为 interim `X-Internal-Auth` guard，生产替换为 mTLS（DESIGN §9）。

---

## 第十轮 · 4-agent 并行自检 + P0/P1 修复（2026-06-02）

4 个模块 agent（haba / x402 / token / wea）并行做只读健康自检，定位问题后并行修复。本轮聚焦 **P0（违反用户级硬规则的对外禁词 + 违反 AP4 架构原则）+ P1（明确运行时 bug / 数据正确性）**；需大工程或跨模块决策的项列为待立项（见 §5）。

- ✅ **haba 清除对外禁词**（消费端不得出现 上链/x402/Solana/USDC 钱包 等技术字眼，build 通过）：
  - `checkout/CheckoutFlow.tsx:364`「正在向链上发送支付」→「正在安全处理支付」
  - `checkout/ConfirmStep.tsx:98/170` 去「上链/稳定币」,保留「支付确认后不可撤销」正当提示
  - **删除 `layout/HabaArchitectureCrumb.tsx`** + 从 HabaTopBar 移除引用（x402 flow / Solana Devnet 面包屑彻底消失）
  - `app/cart/page.tsx:33`「用 USDC 钱包一键结账」→「一键安全结账」
- ✅ **x402 修 bug + AP4 退役**（8 单测通过，未改 E2E 依赖的标准路径）：
  - `webhooks.py:233` structlog 保留字 `event=` → `event_type=`（运行时会 KeyError/覆盖字段）
  - `protocol.py:211` 运算符优先级 bug 修正,x402Version 校验现真正生效（比对 `X402_VERSION=1`）
  - **AP4**：遗留 `/v1/payments/{id}/proof` 路由内部改为委托 wea `settle()`,保留路由签名/响应契约（守 AP6），标 `DEPRECATED v0.4.0`
- ✅ **token 修 schema 漂移 + 禁词 + 去硬编码合作方**（build 通过）：
  - `api/.../db.py` 三表（requests / merchants / projects）补齐缺失列对齐 migration；`request_hash` 不再被 SQLAlchemy 静默丢弃（audit 可追溯恢复）；日元发票必需的 `merchants.tax_id/legal_name` 等可写入
  - `console/.../invoices/page.tsx`「on-chain Solana tx hashes」→「決済参照番号 / Settlements」
  - 硬编码「HABA / ハーバー研究所」→ 新建 `lib/merchant-config.ts` 走 env（dashboard/TopBar/settings/sidebar），留 TODO 走 `GET /v1/merchant/profile`
- ✅ **wea 修 CI 方言 + 枚举对齐**（cargo check 0 error）：
  - `.github/workflows/ci.yml` PostgreSQL 16 → MySQL 8.0 + `mysql://` URL（CI 测试不再必挂）
  - 移除死值 `callback_pending`：新增 `db/migrations/002_drop_callback_pending_status.{up,down}.sql` + 更新 SCHEMA.sql,不改历史 migration（保 golang-migrate checksum）

⚠️ **本轮未跑整体 E2E**（本地 Docker 未起）。AP4 委托 wea 的新路径建议起栈跑一次 `python3 scripts/x402_protocol_e2e.py` 验收。
⚠️ token 新增 `CONSOLE_MERCHANT_NAME` 等 env,部署配置需补,否则 console 显示默认占位。

### 待立项（本轮按约定未碰，见 §5 详列）
- confirmer loop `get_signature_status` 直连 Solana（需 wea 先提供 tx status 端点）
- KMS 真实集成（wea callback_secret 仍明文 stub）
- token worker 空壳（reconciler / invoice / aggregator + `payment_orders_mirror` 无写入）
- wea depeg 守护 / mTLS / 多 RPC failover；token FX 硬编码 / rate limiter 未接线

---

## 第六轮 · 标准 x402 协议层 + 双 console

v0.8.0 将商品结账从旧的订单确认捷径收敛为标准 x402 wire protocol:

- ✅ **协议层变化**：x402-api 作为 resource server 返回 HTTP 402 + `WWW-Authenticate: X402` + `paymentRequirements`；客户端生成 `X-PAYMENT` header 后重试同一资源；gateway 在解锁前校验 resource binding、scheme/network、USDC mint/decimals、recipient、amount、nonce、expiry 与 replay。
- ✅ **WebAuthn 绑定**：HABA Touch ID 仍是真实 `navigator.credentials.create()`；challenge 从 `PaymentRequirements` 派生,并随支付 payload 作为 user verification 证据提交。
- ✅ **角色边界**：HABA 是 consumer / merchant surface；NetStars x402 Gateway 是资源服务器与协议验证者；Wea Facilitator 负责 verify + settle,通过 Solana JSON-RPC 广播已签名交易；Solana Devnet 是 USDC settlement layer。
- ✅ **四个可视表面**：HABA consumer site `:3001`、Token Console `:3000`、NetStars X402 Console `:3002`、Wea Facilitator Console `:3003`。X402 / Wea 两个新 console 均带 ArchitectureCrumb 与 live telemetry。
- ✅ **E2E 覆盖**：`python3 scripts/x402_protocol_e2e.py` 覆盖正常支付、错误 header、resource/network tamper、replay、expiry、facilitator verify/settle 等协议断言。

---

## 0d. 第九轮变更（2026-05-29 GPT-4.1 真实 provider 验收）

因当前 OpenAI project 的 `/v1/models` 返回列表不包含 `gpt-5.5`，且实际调用 `gpt-5.5` 返回 403 `model_not_found`，本轮按用户要求把 HABA Advisor 运行模型切到已有权限的 `gpt-4.1`：

- ✅ **默认模型切换**：`haba/src/app/api/payment/advise/route.ts`、`.env.example`、`docker-compose.yml`、当前 `.env` 与 `haba/scripts/test-advise-api.mjs` 均切到 `gpt-4.1`。
- ✅ **真实 OpenAI provider 验收通过**：`cd haba && HABA_ADVISOR_EXPECT_PROVIDER=openai npm run test:advise` 通过；两轮请求均返回 `provider=openai`、`model=gpt-4.1`。
- ✅ **真实 Token debit 验收通过**：本次 `npm run test:advise` 两次调用分别扣减 `15,460` / `19,760` Token；Console recent activity 可见 `openai/gpt-4.1` debit。
- ✅ **Console Ticker 复核**：`http://127.0.0.1:3000/api/proxy/recent-activity?limit=8` 返回最新 `openai/gpt-4.1` 记录。
- ✅ **保留 GPT-5.5 能力**：Netstars OpenAI provider 仍支持 `gpt-5*` 的 Responses API 路径，Console Models 表也保留 GPT-5.5 价格与 docs link；等 OpenAI project 开通权限后可再切回。

## 0c. 第八轮变更（2026-05-29 GPT-5.5 + Advisor Workbench）

本轮按“Claude Code 主干活、Codex 主验收”的交接要求，完成 GPT-5.5 迁移与 Advisor 体验重构，并留下下一轮验收清单：

- ✅ **HABA AI Advisor 默认模型改为 GPT-5.5**：`haba/src/app/api/payment/advise/route.ts` 默认模型从 `claude-haiku-4-5` 切到 `gpt-5.5`，并支持 `HABA_ADVISOR_MODEL` 覆盖。
- ✅ **Netstars Token API 支持 GPT-5.5 Responses API**：OpenAI provider 对 `gpt-5*` 走 `/v1/responses`，保留旧模型的 Chat Completions 路径；同步解析 `input_tokens` / `output_tokens` / `cached_tokens`。
- ✅ **价格表同步**：`netstars/token/api/src/token_api/providers/router.py` 增加 `gpt-5.5` 与 `gpt-5.5-2026-04-23`，按 OpenAI 官方 GPT-5.5 文档的 $5/M input、$30/M output 换算为 `5,000 / 30,000` AI Token per 1K tokens。
- ✅ **环境配置同步**：`.env.example` 和 `docker-compose.yml` 曾在本轮加入 `HABA_ADVISOR_MODEL`；第九轮已按可用权限切为 `gpt-4.1`。真实调用需要 `OPENAI_API_KEY`，无 key 时仍可 stub fallback 并移动 ledger。
- ✅ **Advisor UI 从聊天框升级为咨询工作台**：
  - 场景选择从左侧小卡改为顶部 5 场景入口，Advisor 成为页面主视觉。
  - 左侧展示用户需求、顾问判断、推荐依据、安全边界、可购买推荐卡与购买 CTA。
  - 右侧是 `Advisor Desk`：多轮追问、当前参考商品、快捷问题、连续上下文、发送框与错误降级文案。
  - B2B 场景不再复用消费端聊天外观，而是显示 Partner Console 工作流，强调同一 Advisor 能力可被药局/医院/营养师/电商渠道调用。
- ✅ **去 demo 痕迹**：移除 Advisor CTA 中的 `[demo]` no-op console 输出；消费者侧继续不显示 Token 余额、单次调用成本、自动充值提示。

### 原 Claude Code TODO（Codex 已接手）

- [x] **真实 provider 验收**：GPT-5.5 路径因 OpenAI project 权限返回 403；已按用户要求切到 `gpt-4.1` 并验收 `provider=openai`、`model=gpt-4.1`、Console Ticker debit。
- [x] **桌面 / 移动视觉 QA**：桌面 1280px 与移动 390px 均验证 Advisor 主面板、场景选择网格、右侧 Desk 参考商品区、快捷问题按钮；无横向 overflow，未见明显重叠。
- [x] **清理旧 Anthropic / Claude 叙事**：`docs/TOMORROW_SETUP.md` 改为 OpenAI 主线；`docs/haba-agent-design.md` / `docs/haba-technical-plan.md` 同步真实 OpenAI + stub fallback 边界；当前运行模型为 GPT-4.1，Console mock model table 保留 GPT-5.5 可切换项。
- [x] **`/api/payment/advise` 自动化测试**：新增 `haba/scripts/test-advise-api.mjs` + `npm run test:advise`，覆盖默认模型与 multi-turn messages；新增 `netstars/token/api/tests/test_openai_provider.py`，覆盖无 key fallback 判断、GPT-5.5 pricing、Responses usage 解析。
- [x] **Netstars Console Models 表加入 GPT-5.5**：`netstars/token/console/src/lib/mock.ts` 增加 `gpt-5.5`、`5,000 / 30,000` AI Token per 1K tokens 与 OpenAI docs link；重建 `token-console` 后 `/models` 已验证可见。
- [x] **Codex 验收重点**：消费者商品结账不 credit Token 已复验；C 端首页无内部 Token 余额、低余额、自动充值等运营文案；推荐仍只基于 MARVIE 真实 SKU；真 key 路径因 OpenAI model access 阻塞，stub/provider 单测路径可解释。

### 本轮验收记录

- ✅ `haba npm run typecheck` 通过。
- ✅ `python3 -m compileall netstars/token/api/src/token_api/providers/openai_compat.py netstars/token/api/src/token_api/providers/router.py` 通过。
- ✅ `git diff --check` 通过。
- ✅ `docker compose up -d --build token-api` 完成；`http://127.0.0.1:8080/healthz` 返回 200。
- ✅ 本地 `http://127.0.0.1:3002` 返回 200；首页包含“把 AI Advisor 做成真正的咨询台”和 `Advisor Desk`；HTML 未命中 `Token -` / `余额低` / `AI Token 自动`。
- ✅ 桌面 / 移动视口浏览器抽查：Advisor Workbench 主标题、5 个场景入口、左侧推荐依据、右侧 `Advisor Desk` 与参考商品区可见；1280px / 390px 均无横向 overflow。
- ✅ `PYTHONPATH=src poetry run pytest tests/test_openai_provider.py -q` 通过（3 tests）。
- ✅ `netstars/token/console npm run typecheck` 通过；`docker compose up -d --build token-console` 通过；`/models` HTML 包含 `gpt-5.5` 与 OpenAI docs link。
- ✅ 商品 checkout 边界复验：`/api/checkout/order` 成功，Token balance `213979386 → 213979386`，`creditDelta=0`。
- ⚠️ `cd haba && npm run test:advise` 已执行但未通过：真实 OpenAI key 已加载，provider 返回 403 `Project ... does not have access to model gpt-5.5`。这是模型权限问题；未发生成功 AI debit。
- ⚠️ `npm run lint` 未作为有效验收：当前项目未配置 ESLint，`next lint` 会进入交互式初始化向导。

## 0b. 第七轮变更（2026-05-28 UI/UX 商业观感修正）

针对最新产品走查反馈，补强前台商业质感与购买动线：

- ✅ **视觉层级放大**：Hero、导航、SectionTitle、场景卡、推荐卡、商品卡整体增大字号、图标、卡片尺度和按钮尺寸；消费端从“小 demo 组件感”向更正式的商业产品观感靠拢。
- ✅ **加入购物车后可直接购买**：单品和批量加入购物车后保留 5 秒“去结账 / 立即购买”快捷入口，不再要求用户再去顶部找购物车。
- ✅ **查看其他商品/场景实现**：`ask_more` CTA 不再是 no-op；消费者推荐区可切换到下一个场景，并提供“查看全部商品”锚点直达商品目录。
- ✅ **验证**：`haba npm run typecheck` 通过；本地 `http://localhost:3002` 验证首页 → 加入购物车 → 立即购买 → 购物车摘要，以及“我想再看其他场景”切换。

追加修正：
- ✅ **AI Advisor 多轮聊天**：消费者推荐区新增 Follow-up Chat；支持快捷问题与输入框连续追问，前端保留最近上下文并提交到 `/api/payment/advise`。
- ✅ **后端多轮消息**：`/api/payment/advise` 支持 `messages[]`，继续沿用 MARVIE 目录约束；每次调用仍由 Netstars Token ledger 自动扣费，但 HABA 消费者侧不显示 Token 余额/扣费明细。
- ✅ **布局防误换行**：导航、CTA、发送按钮、结账快捷按钮、SectionTitle 右侧元素补 `whitespace-nowrap` / flex 约束，减少商业页面中不必要的断行。
- ✅ **Token 计费边界修正**：购物车商品订单只走标准 x402/USDC 结算凭证，不再把消费者购买误记成 HABA Token 充值；AI Advisor 调用仍通过 `/v1/messages` 自动 debit。
- ✅ **运行态验收**：重建 `token-api` / `x402-api`；商品 checkout 验证 Token balance 前后不变，HABA `/api/payment/advise` 验证单次调用仍自动 debit（本次 `tokensConsumed=1614`）。

---

## 0a. 第六轮变更（2026-05-28 商业验收硬化）

从“demo 跑通”推进到“上市公司可验收”的第一轮严格修正：

- ✅ **AI Advisor 目录约束**：`haba/src/app/api/payment/advise/route.ts` 注入真实 7 款 MARVIE SKU 目录，要求 LLM 只能推荐目录内 SKU，并禁止编造商品、价格、库存、医疗功效或血糖承诺。
- ✅ **结账金额一致性**：新增 `haba/src/lib/haba/checkout.ts` 作为前后端共享的 USDC 换算 / clamp 策略；购物车摘要现在直接显示链上实扣金额，避免摘要与成功页金额不一致。
- ✅ **订单凭证补强**：`CheckoutFlow.tsx` 持久化并展示 `tx_hash`、`chain_mode`、`status`、`explorer_url`；真实 Devnet 时可直接进入 Solana Explorer。
- ✅ **企业验收面板**：新增 `EnterpriseAcceptancePanel`，并落在 `/b2b` 与 `/resale` 页面，明确品牌责任分层、调用计费、对账证据、治理控制、生态叙事边界。
- ✅ **验证**：`haba` 与 `netstars/token/console` TypeScript 检查通过；本地 `http://localhost:3002` 验证 `/b2b`、`/resale`、`/cart` 新文案与金额显示。

商业判断：这轮优先处理的是“观众会在会后追问、法务/财务会卡住”的信任问题，而不是继续堆动画或新页面。

---

## 0. 第五轮变更（2026-05-28 办公室激活）

按 `docs/TOMORROW_SETUP.md` 7 步全部完成，demo 从"stub + DEV bypass"升级为"真 LLM + 真 Devnet 链上结算"：

- ✅ **Devnet 钱包激活**：`scripts/setup-devnet-wallet.py` 生成 merchant + payer 对，写入 `.env`
  - Merchant（收款）：`61e1MSTEN5dTjNGNQcwUivRVubYz6ebYfmz9qvYtkeNr`
  - Payer（付款，已充值）：`5gYYVxNa4EfeYafSoM9c2e4YSFuRh1aRaw9G1zzMwYMS` — SOL 5.0 / USDC 起始 20.0
  - `x402-api` rebuild → `demo_payer_configured: true`
- ✅ **真实 Devnet 结算验证**：`/cart` 结账产生真 tx（如 `4R1weyG…HepHJAF`，slot 465394897），payer −9 / merchant +9 USDC，链上可查
- ✅ **旧版 LLM key 接入（历史记录）**：当时验证过真实 provider 路径；当前已切换为 GPT-4.1 运行主线，见第九轮记录。
- ✅ **全表面 smoke test 通过**（见下表）

| 表面 | 验证 | 结果 |
|---|---|---|
| 首页 | Hero / AdvisorPreview / Follow-up Chat / 商品目录 | ✅ |
| AI Advisor | 真 LLM 调用 + Token 扣减（现默认 GPT-5.5） | ✅ `−1,652` token/次 |
| 内部 top-up API | +10M Token | ✅ |
| /cart | 真 Devnet USDC tx + Explorer 按钮 | ✅ 链上确认 |
| /agent | 5 连击 + B2B 多渠道（真 LLM） | ✅ |
| /b2b | B2BCallNotice 实时计数 | ✅ `41 → 42` |
| Console | Live Ticker 跨表面同步 | ✅ 最新 `openai/gpt-4.1` debit 可见 |
| 多语言 | zh-CN ⇄ ja ⇄ en | ✅ |
| demo-runner | 驾驶舱 3 表面 + 6 步剧本 | ✅ |

- ✅ **演示叙事**：`story.md`（项目根）— 串场故事「一勺甜，背后一条链」+ 演示对照表 + 海报生成 prompt

---

## 1. 一句话状态

> HABA AI 健康食品电商 demo 端到端真实运转：4 个相关方独立部署；AI Advisor 默认走 GPT-4.1 并由 Netstars Token ledger 自动扣费，`/cart` 商品结算落真 Solana Devnet 链但不充值 Token，消费端与商户运营账本边界清晰。

---

## 2. 4-Actor 拓扑

| Actor | 角色 | 端口 / 部署 | 状态 |
|---|---|---|---|
| **HABA** | 商户 (实业 / 买 Token / 卖商品) | `haba-site` :3001 (独立 Next.js) | ✅ healthy |
| **Netstars** | x402 + Token 网关 | `token-api` :8080 + `x402-api` :8081 + `token-console` :3000 + `token-worker` | ✅ healthy |
| **WEA Japan** | x402 链上执行 | `wea-api` :8082 (Rust) | ✅ healthy |
| **Solana** | USDC SPL 公链 | Public Devnet RPC | ✅ settlement layer |

4 个表面：
- HABA 消费端 `http://localhost:3001/`
- Netstars Console `http://localhost:3000/`
- NetStars X402 Console `http://localhost:3002/`
- Wea Facilitator Console `http://localhost:3003/`
- 经营层简报 `claude/presentation.html`
- 演示驾驶舱 `claude/demo-runner.html` (给演示者用，不部署)

---

## 3. 已完成 (按层)

### 3.1 后端 services
- ✅ **token-api** (`netstars/token/api/`): HMAC verify · `/v1/balance` · `/v1/recent-activity` · `/v1/messages` (真 LLM 调用 + 预检余额 + debit ledger + stub fallback)
- ✅ **x402-api** (`netstars/x402/`): standard x402 protected resource · HTTP 402 requirements · `X-PAYMENT` decode/verify · resource binding · replay/expiry rejection · WEA settle orchestration
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
- ✅ **4 个公开路由**: `/` (Hero + Advisor + 商品 + 跨页 teaser) · `/resale` · `/b2b` · `/cart`；Token top-up 与 AI 调用保留为 server-only API 能力
- ✅ **真后端集成** (`src/lib/netstars/client.ts`): HMAC 签名 · INTERNAL DNS · `fetchBalance` / `fetchRecentActivity` / `createTokenPurchase` / `createMerchantCheckout` / `adminConfirm` / `chatCompletion`
- ✅ **5 个 server-only API 代理路由**: `/api/payment/{balance,topup,advise}` · `/api/checkout/order`
- ✅ **AI Advisor 真调用**: Advisor Desk → `/api/payment/advise` → `/v1/messages` → Netstars Token ledger debit；默认模型 GPT-4.1，消费端隐藏内部余额与调用成本
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
| Token 自充 (内部运营) | `/api/payment/topup` | legacy path removed; route returns 410 until protected x402 top-up lands | 不暴露给消费者 |
| AI Advisor 调用 | Advisor Desk 多轮追问 | /v1/messages (HMAC + GPT-4.1 或 stub + debit) | Token ledger debit / 真 AI 回复或 stub 回复 / Console Ticker debit |
| 消费者结账 (场景 B) | `/cart` "USDC 钱包结账" | HTTP 402 requirements + `X-PAYMENT` retry + WEA settle | 订单号 + 链上 tx_hash / 购物车自动清空；不 credit Token |
| 终端 Agent autopilot | `/agent` "Run #2" | 12 次连续调用 + autopilot topup | 中段累积扣 500 Token 触发自动充值 +10M |

token-api 的 `/v1/recent-activity` 可见 Token top-up 与 AI debit；商品结账保留在 x402 payment order + tx_hash 证据链中，不混入 Token ledger。

---

## 5. 待办 (优先级排序)

### P2 — ✅ 本轮完成
- [x] **B2B 调用计费实时化**: 新增 `GET /api/payment/b2b-stats` 路由（从 ledger 聚合当月 ai_call 次数）；新建 `B2BCallNotice.tsx` 组件替代 `AgentChatDemo` 内的静态文案，每次 `haba:balance-refresh` 事件后自动刷新。月度上限 50,000 次（growth 套餐演示值）。
- [x] **`.env` 创建**: 从 `.env.example` 复制，保留 DUMMY key 结构，docker-compose 可正常 `up`。当前运行模型为 GPT-4.1；填入真实 `OPENAI_API_KEY` 后 stub 模式自动切换为真实 LLM 调用。

### P2 — ✅ 本轮完成
- [x] **Solana Devnet 真实 USDC 支付**:
  - `netstars/x402/src/x402/tx_builder.py` — 构建 SPL TransferChecked + Memo 交易
  - x402-api `POST /v1/protected/checkout/order` — 标准 HTTP 402 → `X-PAYMENT` → WEA settle
  - HABA checkout 走真实链路；失败显示明确错误,不再使用旧确认捷径
  - 金额上限改为 MAX_USDC = $9（原错误值 10,000）
  - 成功页展示 "真实 Devnet 链上交易" 徽章 + "在 Solana Explorer 查看" 按钮
  - `SOLANA_RPC_URL` 默认改为 `https://api.devnet.solana.com`（不再依赖本地 validator）
  - `scripts/setup-devnet-wallet.py` — 一键生成演示钱包 + 充值指引

### P2 — 下次开工继续
- [x] **真 GPT-4.1 key 接入**: `OPENAI_API_KEY` 已存在，GPT-4.1 真实 provider 路径通过；GPT-5.5 Responses API 代码保留，待 OpenAI project 权限开通后可再切。
- [ ] **Devnet 钱包充值**: 在办公室运行 `python scripts/setup-devnet-wallet.py`，将输出填入 `.env`，然后从 https://faucet.circle.com 获取 devnet USDC。

### P3 — ✅ 本轮完成
- [x] `/agent` 第 3 个剧本: **B2B 多渠道频次场景** — 药局 / 医院营养科 / 独立营养师 / 合作电商 4 频道 × 3 轮 = 12 次调用，含自动充值触发。见 `AgentRunner.tsx: B2B_CHANNEL_PROMPTS`。
- [x] `/cart` **订单持久化**: 成功页写入 `localStorage`（key: `haba_last_order`，24h TTL）；再次进入 `/cart` 时顶部显示「上次订单」横幅，支持查看 / 忽略 / 新建订单三种操作。
- [x] **产品卡片视觉升级**: `ProductCard.tsx` 新增 h-40 渐变色图片区块（按 category 自动选色：液体甜味料=天空蓝、粉末=琥珀黄、料理辅助=橙色、果酱=玫瑰红、糖果=紫色），emoji 升至 text-6xl，`DemoBadge` 移至右上角。

### P3 — ✅ 本轮完成
- [x] **Demo 精品化 (耳目一新)**:
  - `HabaHero.tsx` 全面重写：双栏布局，左 = 标题/标语/分群 chip/实时指标；右 = `EcosystemFlowCard`（深森绿卡片，三方节点 + CSS 流动动画）
  - `EcosystemFlowCard.tsx` (NEW)：暗色主题，HABA → 支付协议 → Solana USDC，traveling-dot 连接线，三方状态实时点
  - 旧版 `LiveMetricsBar` / `TokenBalancePill` 已从消费者首页移除，避免前台暴露内部 Token 余额；运营证据回到 Netstars Console
  - `CheckoutFlow.tsx` 成功页分两态：devnet = 脉冲环确认动画 + 深色链上证明卡（tx高亮）+ 大号 Explorer 按钮；dev = 简洁版
  - `globals.css`：5 个 keyframes (haba-fade-up / pulse-ring / flow-dot / shimmer / breathe) + 8 个 utility 类
  - 全站 hover/入场动画：产品卡 `-translate-y-0.5 hover:shadow-e3`；Teaser 格同步；TopBar Logo 渐变升级
  - Footer 新增技术栈行：HABA · x402 Protocol · Solana USDC chip

### P2/P3 — 下次开工继续（第五轮 smoke test 新发现）
- [x] **AI Advisor system prompt 注入真实 MARVIE 目录**：已把 `marvieProducts` 的 SKU / 名称 / 卖点 / 卡路里 / 甜度 / 成分注入 `HABA_SYSTEM_PROMPT`，并要求只推真实 7 款。
- [x] **`/cart` 订单摘要 USDC 显示与实扣不一致**：已抽出共享 checkout policy，购物车摘要显示实际链上实扣金额与演示上限说明。
- [ ] **`/agent` B2B 多渠道剧本超时**：12 次调用 × 真 LLM（每次 2–3s）≈ 30s+，前端无硬超时但单页等待偏久。可缩短为 2 轮（8 次）或并发，或加进度提示。
- [ ] **ledger 重置工具**：topup 与 AI 调用会改变 HABA Token 余额，多轮演示后余额数字会滚动。需要一个 `make reset-ledger` 或脚本（重建 mysql / 清表），让演示从干净状态开始。
- [ ] 钱包 connect UI 真接 Phantom / Solflare (现在签名是 server-side mock)

### 第十轮自检待立项（按优先级）
- [ ] **[P1] 起本地栈跑整体 E2E 验收**：本轮修复（尤其 x402 AP4 委托 wea 的新路径）未经 `scripts/x402_protocol_e2e.py` 验证；本地 Docker 未起。
- [ ] **[P1] 部署配置补 `CONSOLE_MERCHANT_NAME` 等 env**：token console 去硬编码后依赖 env，缺失则显示默认占位。后续应实现 `GET /v1/merchant/profile` 让 console 动态读取。
- [ ] **[P1] token worker 落地**：reconciler / invoice_generator / usage_aggregator / anomaly_detector 仍为 heartbeat stub；`payment_orders_mirror` 表无任何写入路径（与 x402 支付状态同步缺失）。
- [ ] **[P1] x402 confirmer 链上读改委托 wea**：`main.py:557` confirmer loop 仍直连 Solana `get_signature_status`（AP4 读操作违规）；需 wea 先提供 `/tx/status/{sig}` 查询端点,跨模块改造。
- [ ] **[P0-prod] wea KMS 真实集成**：`api.rs:46` callback_secret 仍明文 stub；生产前必须接入 AWS KMS ap-northeast-1 direct（见 memory `feedback_kms_aws_direct`）。
- [ ] **[P2] token FX 汇率去硬编码**：`main.py` 硬编码 150 JPY/USDC（mock FX），`/v1/balance` 的 `jpy_equivalent` 对客户可见,需配置源或 FX 服务。
- [ ] **[P2] token per-key rate limiter**：`agent_keys` 有 `rate_limit_rpm/tpm` 字段但无中间件读取；`auth.py:130` `_touch_last_used()` 定义但从不调用（last_used_at 永不更新）。
- [ ] **[P2] wea depeg 守护接线**：`system_flags`（accepting_new_settlements / depeg_*）表存在但 worker 不读（DESIGN §8 缺失）。
- [ ] **[P3] wea 生产硬化**：mTLS（现 routes 无鉴权）、多 RPC failover（`rpc_endpoints` 表已 seed 未接线）、listen 端口 env 可配置（现硬编码 0.0.0.0:8080）。
- [ ] **[P3] 清理项**：x402 version 三处不一致(0.2/0.3/0.4)、poetry.lock 未提交、`signed_tx_hash` UNIQUE 仅 migration 有；haba `ProductGrid`/`DemoBadge` 死代码 + 注释 demo 字样；wea dead-code warnings。

### P4 — 范围外 / 长期
- [ ] Solana validator on Apple Silicon (需要 host-side solana-cli + Devnet RPC 转发)
- [ ] 真实 HABA 商品履约 (订单下完不发货，纯演示)
- [ ] HABA 自有用户体系 (现在没登录)

### 演示当天运维备忘
- payer 钱包 USDC 用一笔少 $9，余额低于 $9 时去 https://faucet.circle.com 补；SOL 手续费极省（每笔 0.000005），5 SOL 够上千次。
- 每次 `/cart` 真结算等 10–30s（真等 Solana 确认）——正常，是真实性的证据。
- 改 `.env` 后对应服务要 rebuild：`OPENAI_API_KEY` / `HABA_ADVISOR_MODEL` → `token-api` 与 HABA 运行环境；钱包/RPC → `x402-api`。

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
- **KMS**: 项目约定只用 AWS KMS ap-northeast-1 直接调，**禁** CloudHSM / Netstars 内部 KMS (见 memory: `feedback_kms_aws_direct`)。当前 demo 未涉及 KMS 调用；若 OpenAI key 进入托管 secret 存储，遵守该约束。
- **PR 审批**: 对外材料避免点名需 PR 审批的合作伙伴 (见 memory: `feedback_no_pr_exposure`)；presentation.html 与 demo-runner.html 是内部 demo 工具，已加 disclaimer。
- **演示语**: 中文为主，但术语保留英文 (x402 / USDC / Token / Solana / API)。
