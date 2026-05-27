# SDK — Module PRD

> **模块**：`sdk/`
> **层级**：Layer 1 · ACCESS（接入层）
> **属于 Master PRD**：[../prd.md](../prd.md)
> **版本**：v1.0  ·  **日期**：2026-05-26  ·  **状态**：Draft

---

## 1. 目的与定位

为商户应用与 AI Agent 提供**最少代码量、最佳错误处理**的接入封装，让客户：

- 无需理解 X402 协议细节
- 无需理解区块链概念
- 无需自己实现签名 / 重试 / 幂等
- 通过统一接口调用 Claude / GPT / Grok / Gemini

**衡量好用的标准**：让首次接入开发者在 ≤ 5 分钟完成首次 Token 购买 + 首次 AI 调用。

---

## 2. 范围（Scope）

### In Scope
- Python SDK（Phase 1 优先）
- Node.js SDK（Phase 2）
- MCP Server（Phase 2，让 AI Agent 能"自我发现"并调用）
- 客户端钱包签名（不持有私钥）
- 自动 X402 协议握手（402 → 支付 → 重试）
- 多 AI Provider 的统一调用接口
- 错误统一封装（403/429/网络/链上）

### Out of Scope
- 不实现 X402 服务端（那是 netstars/x402 的事）
- 不持有任何业务状态（无服务端）
- 不提供 UI 组件（Console 在 netstars/token 中）
- 不实现钱包托管（私钥由客户保管）
- Java / Go / Rust SDK（Phase 4+）

---

## 3. 用户故事（User Stories）

### US-SDK-1（开发者首次集成）
> **作为**应用开发者，**我希望**安装 SDK 后 5 分钟内能完成"购买 1 USDC 等值 Token 并调用 Claude"，**这样**我能快速评估是否采用。

**验收**：
- 安装命令 1 行：`pip install netstars-sdk` 或 `npm install @netstars/sdk`
- 配置 1 步：环境变量 `NETSTARS_API_KEY` + `NETSTARS_WALLET_PRIVATE_KEY`（或文件路径）
- 完整示例代码 ≤ 10 行

### US-SDK-2（生产环境调用）
> **作为**生产服务，**我希望**SDK 能自动处理瞬时错误（网络抖动、429 限流、链上拥堵），**这样**我的业务代码不用写 try-except 包裹每次调用。

**验收**：
- 默认重试策略：指数退避（base 100ms，max 5 次，jitter 启用）
- 重试只针对幂等且明确瞬时的错误（5xx / 429 / 网络）
- 不重试的错误：4xx 业务错误、签名失败、余额不足

### US-SDK-3（统一多模型调用）
> **作为**应用开发者，**我希望**用同一个 SDK 调用 Claude 或 GPT，参数差异最小，**这样**我能基于成本/能力切换 Provider。

**验收**：
- 接口签名相同：`client.chat(model="claude-opus-4-7", messages=[...])` / `client.chat(model="gpt-4.1", messages=[...])`
- 返回数据结构归一化（content / usage / cost）
- Provider 特有参数通过 `provider_options={...}` 传入

### US-SDK-4（Agent 通过 MCP 自治）
> **作为**AI Agent，**我希望**通过 MCP 协议发现可用工具（balance / purchase / chat），**这样**我能在不重启的情况下自主决策何时充值。

**验收**：
- MCP server 暴露至少 5 个工具：`get_balance`, `purchase_tokens`, `list_models`, `chat`, `get_usage_today`
- 工具 schema 严格符合 MCP 规范（JSON Schema）
- 可作为 stdio MCP server 直接被 Claude Desktop / Cursor 调用

### US-SDK-5（本地开发不花真钱）
> **作为**开发者，**我希望**有明确的"测试网模式"，能用 Devnet USDC 反复试错，**这样**我能在 Sandbox 中验证集成。

**验收**：
- 环境变量切换：`NETSTARS_ENV=devnet | mainnet`
- Devnet 模式下，API endpoint、链路、Provider 全部用测试环境
- 文档明确告知"Devnet 数据不保留 / 不计费"

### US-SDK-6（可观测性）
> **作为**开发者排障，**我希望**能拿到每次请求的 trace_id，并在 Netstars Console 中按 trace_id 检索完整链路。

**验收**：
- 每次请求 SDK 自动生成 W3C TraceContext（或继承调用方）
- trace_id 作为响应字段返回 + 日志输出
- SDK 提供 hook `on_request` / `on_response` 让用户接入自己的 logger

---

## 4. 公开接口（Public API · 概念级）

### 4.1 Python SDK

```python
from netstars import Client

client = Client(
    api_key=os.environ["NETSTARS_API_KEY"],
    wallet=Wallet.from_keypair_file("~/.netstars/wallet.json"),
    env="devnet",  # or "mainnet"
)

# Token operations
balance = client.tokens.balance()
order = client.tokens.purchase(amount_usdc=10.0)
# order.status: "pending" | "succeeded" | "failed"
# order.tx_hash: Solana TX hash (after succeeded)

# AI call (Token deducted automatically)
resp = client.chat(
    model="claude-opus-4-7",
    messages=[{"role": "user", "content": "翻译以下文本..."}],
)
# resp.content, resp.usage.tokens_consumed, resp.usage.cost_usdc

# Streaming
for chunk in client.chat(model="...", stream=True, messages=[...]):
    print(chunk.delta)

# Async variant
async with AsyncClient(...) as client:
    resp = await client.chat(...)
```

### 4.2 Node.js SDK

```javascript
import { Client } from "@netstars/sdk";

const client = new Client({
  apiKey: process.env.NETSTARS_API_KEY,
  wallet: Wallet.fromKeypairFile("~/.netstars/wallet.json"),
  env: "devnet",
});

const balance = await client.tokens.balance();
const order = await client.tokens.purchase({ amountUsdc: 10.0 });
const resp = await client.chat({
  model: "claude-opus-4-7",
  messages: [{ role: "user", content: "..." }],
});
```

### 4.3 MCP Server（Agent 友好）

启动方式：
```bash
netstars-mcp serve --api-key $KEY --wallet ~/.netstars/wallet.json
```

暴露的 MCP tools（命名遵循动词_名词风格，便于 LLM 理解）：

| Tool | 描述 | 必需参数 |
|------|------|---------|
| `get_token_balance` | 查询当前 Token 余额 | - |
| `purchase_tokens` | 购买 Token（自动 X402 + USDC 支付） | `amount_usdc` |
| `list_available_models` | 列出可用 AI 模型及单价 | - |
| `call_model` | 调用 AI 模型（同步） | `model`, `messages` |
| `get_usage_today` | 当日消耗汇总 | - |
| `get_payment_status` | 查询订单状态 | `payment_order_id` |

---

## 5. 关键设计决策

| # | 决策 | 选择 | 理由 |
|---|------|------|------|
| SDK-D1 | 同步还是异步优先 | 同步主，异步可选 | 大部分 Python 应用同步；async 用 `AsyncClient` 显式选择 |
| SDK-D2 | 错误传递方式 | 自定义异常层级 + error code | 比 dict 返回更符合 SDK 惯例；带 trace_id 便于排障 |
| SDK-D3 | 钱包加载方式 | 文件路径 / Keypair 对象 / 自定义 Signer 接口 | 兼容企业级"AWS KMS 加密 keypair"场景 |
| SDK-D4 | HTTP 客户端 | Python: `httpx`（同步/异步兼容）；Node: `undici` | 现代标准，性能好，无历史包袱 |
| SDK-D5 | 是否内置缓存 | 否（v1） | 避免余额过期问题；客户自行缓存可选 |
| SDK-D6 | 日志输出 | 默认静默，hook 暴露 | 不污染客户日志；可通过 `client.set_logger(...)` 启用 |
| SDK-D7 | 版本兼容策略 | SemVer；major 版本至少支持 12 个月 | 企业客户升级周期长 |

---

## 6. 非功能性需求

| 类别 | 要求 |
|------|------|
| **包大小** | Python wheel ≤ 5MB；Node.js bundle ≤ 2MB（gzipped） |
| **冷启动** | Python `from netstars import Client` ≤ 200ms |
| **依赖** | 最小化（Python: httpx, pynacl, base58；Node: undici, @solana/web3.js）；不引入 numpy/pandas 等重型依赖 |
| **签名性能** | 单次签名 < 50ms（不依赖外部硬件） |
| **线程安全** | Client 实例线程安全；Wallet 实例线程安全（内部 lock） |
| **可测试性** | 提供 `MockClient`；HTTP 调用可被 mock |
| **兼容性** | Python 3.9+；Node.js 18+ |

---

## 7. 与其他模块的依赖

### 7.1 上游（SDK 依赖）
| 模块 | 用途 | 通信方式 |
|------|------|---------|
| [netstars/x402](../netstars/x402/PRD.md) | 发起支付、收 402 应答 | HTTPS REST |
| [netstars/token](../netstars/token/PRD.md) | 查余额、调用 AI、获使用记录 | HTTPS REST |
| Solana network | 签名后广播 USDC 转账（也可由 Wea 代提交） | 通过 Wea 代理 |

### 7.2 下游（依赖 SDK 的）
- 商户应用代码
- AI Agent 框架（通过 MCP）
- Demo 客户端（用于演示场景）

---

## 8. 部署与发布

### 8.1 部署形态
- Python: PyPI 包 `netstars-sdk`
- Node.js: npm 包 `@netstars/sdk`
- MCP server: 同包内 binary（`netstars-mcp` 命令）

### 8.2 CI/CD
独立的 `.github/workflows/`：
- `ci.yml`: 每 PR 跑 lint + 单元测试 + 集成测试（mock backend）
- `release.yml`: tag 触发发布到 PyPI / npm（自动版本号）
- `e2e.yml`: 每日跑端到端测试（连真实 Devnet）

### 8.3 文档站点
独立域名（如 `developer.netstars.jp`），由 SDK 仓库的 `docs/` 生成（Docusaurus 或 mkdocs）。

---

## 9. 失败模式与降级

| 失败 | SDK 行为 | 用户体验 |
|------|---------|---------|
| Netstars API 5xx | 指数退避重试 5 次 | 透明，业务无感 |
| Netstars API 429 限流 | 等待 `Retry-After` 后重试 | 透明 |
| 网络抖动 / DNS 错误 | 重试（同上） | 透明 |
| 401（API Key 失效） | 立即抛出 `AuthenticationError`，不重试 | 明确错误 + 修复指引 |
| 402（余额不足触发支付） | SDK 内自动走支付流程 | 透明 |
| 支付链上失败 | 抛出 `PaymentFailedError` 含 `tx_hash` | 用户可链上自查 |
| AI Provider 失败 | 透传 Provider 错误 + Netstars 错误码包装 | 错误信息可读 |
| Wallet 签名错误 | 抛出 `WalletError` 含具体原因 | 不重试，立即停 |

---

## 10. 安全要求

- **私钥处理**：默认不读取也不打印；提供 `Wallet` 抽象避免裸传私钥
- **API Key 处理**：禁止打印到日志（mask 中间字符）；支持环境变量与配置文件优先级
- **HTTPS 强制**：拒绝非 https endpoint（dev 模式可显式 opt-in）
- **请求签名**：HMAC-SHA256(api_key_secret, body + timestamp + nonce)
- **响应验证**：服务端响应签名（防中间人）
- **依赖审计**：CI 跑 `pip-audit` / `npm audit`，高危依赖必须修复后才能发布

---

## 11. 可观测性要求

- 自动注入 trace_id（W3C）
- 所有 HTTP 请求/响应可通过 hook 拿到（用户自行接入 logger / metrics）
- 提供 `client.debug()` 输出当前配置（脱敏后）
- 错误包含完整上下文：trace_id, request_id, endpoint, status, error_code, retry_count

---

## 12. 测试要求

| 测试类型 | 覆盖率目标 | 备注 |
|---------|----------|------|
| 单元测试 | ≥ 85% | 重点：签名、重试、错误映射 |
| 集成测试（mock backend） | 关键路径 100% | 用 respx / nock |
| E2E（Devnet） | 黄金路径 + 反向路径 | 每日 CI 跑 |
| 兼容性测试 | Python 3.9/3.10/3.11/3.12; Node 18/20/22 | matrix CI |

---

## 13. 开放问题（与本模块相关）

### 13.1 ✅ 已决策（v1.1）
| # | 问题 | 最终选择 |
|---|------|---------|
| SDK-Q1 | Phase 1 Python only 还是 Python+Node 并行？ | **Phase 1 仅 Python**（= Master D1） |
| SDK-Q2 | MCP 接口优先级 | **Phase 2 交付**（= Master D7） |

### 13.2 ⏳ 待决策
| # | 问题 | 默认假设 | 待决策方 |
|---|------|---------|---------|
| SDK-Q3 | 是否支持"代签"模式（Netstars 托管轻量钱包供小客户使用）？ | 否（v1 完全 self-custody） | 安全 + 合规 |
| SDK-Q4 | 是否提供 LangChain / LlamaIndex / DSPy 集成包？ | Phase 2 评估 | 社区 / 商务 |
| SDK-Q5 | 错误信息是否日英双语？ | 仅英语 v1，日语 Phase 2 | PM |

---

## 14. 参考资料

- [Master PRD](../prd.md)
- [netstars/x402/PRD.md](../netstars/x402/PRD.md) — SDK 对接的支付协议
- [netstars/token/PRD.md](../netstars/token/PRD.md) — SDK 对接的 Token API
- [MCP 规范](https://modelcontextprotocol.io)
- [Anthropic SDK 设计](https://github.com/anthropics/anthropic-sdk-python) — 风格参考
