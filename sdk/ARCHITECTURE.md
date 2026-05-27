# SDK — Architecture

> **属于**：[../ARCHITECTURE.md](../ARCHITECTURE.md)
> **基于**：[PRD.md](PRD.md)（v1.1 决策：Phase 1 仅 Python；MCP 放 Phase 2）
> **版本**：v1.0 · **日期**：2026-05-26

---

## 1. 设计目标（与 PRD 对齐）

- 5 分钟内首次接入：1 行 pip install，1 步配置，10 行示例代码跑通
- 透传 X402 协议复杂度：业务代码不感知 402、重试、签名
- 多 Provider 统一接口：同一 `client.chat(model=...)` 可路由到 4 家
- 故障可观测：trace_id 全程贯通

---

## 2. 模块内部组件（Component View）

```
┌─────────────────────────────────────────────────────────────┐
│                    netstars_sdk (Python package)             │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐   │
│  │              Client (Facade)                            │   │
│  │  - sync / async 双形态                                  │   │
│  │  - 自动 retry / timeout / circuit breaker               │   │
│  └─────┬────────┬────────────┬────────────┬───────────────┘   │
│        │        │            │            │                    │
│        ▼        ▼            ▼            ▼                    │
│  ┌────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐               │
│  │Tokens  │ │Chat /  │ │Wallet    │ │Errors    │               │
│  │API     │ │Messages│ │(Signer)  │ │(typed)   │               │
│  └────┬───┘ └────┬───┘ └────┬─────┘ └──────────┘               │
│       │          │          │                                  │
│       └────┬─────┘          │                                  │
│            ▼                ▼                                  │
│  ┌───────────────────┐  ┌────────────────────┐                 │
│  │ HTTP Client        │  │ Crypto / Signer    │                │
│  │ (httpx)            │  │ (pynacl, base58)   │                │
│  │ + HMAC signer      │  │ + KMS adapter      │                │
│  │ + retry policy     │  │ (AWS KMS-encrypted │                │
│  │ + trace injection  │  │  keypair, Phase 3) │                │
│  └─────────┬──────────┘  └──────────┬─────────┘                │
└────────────┼─────────────────────────┼──────────────────────────┘
             ▼                          ▼
       Netstars API                Solana network
       (token + x402)              (USDC SPL)

附属（Phase 2）:
- MCP Server (stdio) ── 暴露同样能力给 Agent
- LangChain / LlamaIndex 适配（按需）
```

---

## 3. 关键设计

### 3.1 Client Facade（统一入口）
```python
from netstars import Client, Wallet

client = Client(
    api_key=...,
    api_key_secret=...,           # for HMAC signing
    wallet=Wallet.from_keyfile(...),
    env="devnet",                 # devnet | mainnet
    base_url=None,                # 自动按 env 推断
    timeout=30.0,
    max_retries=5,
    on_event=callable,            # 可选 hook
)
```

内部：
- `_transport` = 统一 HTTP 客户端（httpx）
- `_signer` = HMAC + Wallet 签名抽象
- `_pricing_cache` = 模型单价短期缓存（5 分钟）
- `_circuit_breaker` = 防雪崩（失败率超阈值短路）

### 3.2 重试 / 超时 / 熔断
- **重试矩阵**：
  - 5xx + 429（带 Retry-After） + 网络异常 → 重试
  - 4xx → 不重试，直接抛异常
  - 402 → 不算"错"，进入支付流程（特殊处理）
- **指数退避 + jitter**：base 100ms × 2^n + random(0, 50ms)，max 5 次
- **超时**：connect 5s + read 30s（可配置）
- **熔断**：使用 pybreaker；失败率 > 50% / 1min 短路 30s

### 3.3 X402 自动协商
```python
# 业务代码（不感知 X402）
resp = client.chat(model="claude-opus-4-7", messages=[...])

# 内部展开伪代码：
def chat(self, model, messages):
    while True:
        try:
            return self._raw_call("/v1/messages", ...)
        except PaymentRequiredError as e:
            # 自动处理 402
            payment_intent = e.payment_intent
            signed_tx = self.wallet.sign_usdc_transfer(
                amount=payment_intent.amount,
                recipient=payment_intent.recipient,
                nonce=payment_intent.nonce,
            )
            self.tokens._submit_proof(payment_intent.order_id, signed_tx)
            self.tokens._wait_for_confirmation(payment_intent.order_id, timeout=30)
            # loop 一次重发原请求
```

可配置：`auto_purchase=False` 关闭自动；返回 402 让用户决定。

### 3.4 异常层级（typed errors）
```
NetstarsError                          (base)
├─ AuthenticationError                  401
├─ AuthorizationError                   403
├─ PaymentRequiredError                 402  (carries PaymentIntent)
├─ InsufficientBalanceError             402 subcase
├─ RateLimitError                       429  (carries retry_after)
├─ ValidationError                      400/422
├─ ServerError                          5xx (retryable subclass)
├─ NetworkError                          (httpx 异常包装)
├─ TimeoutError
├─ PaymentFailedError                    (链上失败)
├─ WalletError                           (签名问题)
└─ ConfigurationError                    (SDK 配置错)
```

所有异常都含：`trace_id`, `request_id`, `error_code`, `metadata`。

### 3.5 Wallet 抽象（可插拔 Signer）
```python
class Wallet(Protocol):
    def public_key(self) -> str: ...
    def sign(self, message: bytes) -> bytes: ...
    def sign_usdc_transfer(self, ...) -> bytes: ...

# 内置实现：
class FileWallet(Wallet): ...           # 从 JSON keypair 文件
class EnvWallet(Wallet): ...            # 从环境变量
class KMSWallet(Wallet): ...            # AWS KMS 加密 keypair（企业级，Phase 3）
```

### 3.6 MCP Server（Phase 2）
- 进程模式：stdio MCP server（Claude Desktop 风格）
- 工具集：`get_token_balance`, `purchase_tokens`, `list_available_models`, `call_model`, `get_usage_today`, `get_payment_status`
- 内部复用 `Client` 同一套逻辑（只换接口外壳）

---

## 4. 工程约定

### 4.1 项目结构
```
sdk/
├─ src/netstars/
│   ├─ __init__.py
│   ├─ client.py
│   ├─ tokens.py
│   ├─ chat.py
│   ├─ wallet.py
│   ├─ signer.py
│   ├─ errors.py
│   ├─ transport.py
│   ├─ models.py            (Pydantic dataclasses)
│   └─ mcp/                  (Phase 2)
├─ tests/
│   ├─ unit/
│   ├─ integration/          (against mock backend)
│   └─ e2e/                   (against devnet)
├─ docs/                       (Docusaurus or mkdocs)
├─ examples/
│   ├─ quickstart.py
│   ├─ async_usage.py
│   ├─ ec_agent_demo.py       (跨境电商 demo 场景)
│   └─ mcp_server.py          (Phase 2)
├─ pyproject.toml              (Poetry)
├─ Makefile                    (dev tasks)
└─ .github/workflows/
    ├─ ci.yml
    ├─ release.yml
    └─ e2e.yml
```

### 4.2 依赖
- **必装**：`httpx>=0.27`, `pynacl>=1.5`, `base58>=2.1`, `pydantic>=2.0`, `solders` (Solana primitives)
- **可选**：`pybreaker`（熔断器），`opentelemetry-api`（trace hook）
- 严禁：numpy, pandas, scipy（重型 + 拖慢冷启动）

### 4.3 版本与发布
- SemVer 严格
- main 分支永远可发；feature 分支前缀 `feat/`
- 发布通过 git tag `v0.1.0` 触发；自动发到 TestPyPI 后人工 promote 到 PyPI
- CHANGELOG.md 用 keep-a-changelog 格式

---

## 5. 测试架构

```
单元测试 (pytest)
├─ tests/unit/                     ≥85% 覆盖率
│   ├─ test_signer.py              加签 / 验签 / nonce 防重放
│   ├─ test_retry.py               重试矩阵（exp backoff / jitter）
│   ├─ test_errors.py              异常映射
│   └─ test_x402_handshake.py     402 自动协商

集成测试 (pytest + respx)
└─ tests/integration/
    └─ test_full_flow.py           mock x402-api / token-api 端到端

E2E 测试 (pytest + 真实 devnet)
└─ tests/e2e/
    └─ test_devnet.py              每日 CI；触发条件：cron 02:00 JST

兼容性矩阵 (CI matrix)
- Python: 3.9 / 3.10 / 3.11 / 3.12
- OS: ubuntu-latest / macos-latest（Windows Phase 2）
```

---

## 6. CI/CD 拓扑（详见 [.github/workflows/](.github/workflows/) — Tier 1 已交付样板）

```
PR opened
  ├─ ci.yml: lint (ruff) + types (mypy) + unit + integration + SAST (bandit) + dep audit (pip-audit)
  └─ 全绿才允许 merge

merge to main
  ├─ ci.yml 同上
  └─ build wheel + upload artifact

tag v*.*.*
  ├─ release.yml: build + sign + upload to TestPyPI
  └─ 人工 approve → upload to PyPI

cron 02:00 JST
  └─ e2e.yml: 真实 devnet 端到端测试
```

OIDC 模式：GitHub Actions → AWS（仅 e2e 需要 AWS 资源时）；PyPI publish 用 `pypa/gh-action-pypi-publish` trusted publishers，无 token。

---

## 7. 安全设计

| 威胁 | 缓解 |
|------|------|
| API Key 在日志中泄露 | logger filter 自动 mask；env 优先级配置 |
| 私钥在内存被 dump | `pynacl` 用 sealed bytearray；不 print；不进异常消息 |
| 中间人攻击 | 强制 TLS 验证；可选 cert pinning（企业版） |
| 重放攻击 | 每请求 timestamp + nonce；服务端 5 分钟窗口 |
| 依赖供应链攻击 | `pip-audit` CI 强制；lockfile 固定 |
| Pickling RCE | 严禁 `pickle.load` 用户输入 |

---

## 8. 可观测性

- 自动注入 W3C `traceparent` header
- 提供 `client.set_logger(logger)` 接入用户 logger
- `client.on_event(callback)` hook：`request_start / request_end / retry / payment_initiated / payment_confirmed`
- 默认静默；任何输出由用户显式启用

---

## 9. 性能指标（验收）

| 指标 | 目标 |
|------|------|
| `import netstars` cold start | < 200ms |
| `Client(...)` 实例化 | < 10ms |
| 单次签名（CPU） | < 50ms |
| 网络往返开销（不含 Provider） | < 30ms p99 |
| Wheel 大小（gzipped） | ≤ 5MB |

---

## 10. 与其他模块的接口契约（详见 token / x402 的 ARCHITECTURE.md）

| 上游 API | 用途 |
|---------|------|
| `POST /v1/messages` (token) | AI 调用 |
| `POST /v1/chat/completions` (token) | OpenAI 兼容 |
| `GET /v1/balance` (token) | 余额 |
| `POST /v1/token-purchase` (token) | 触发购买（内部转 x402） |
| `POST /v1/payments` (x402) | 创建支付订单 |
| `POST /v1/payments/{id}/proof` (x402) | 提交支付证明 |
| `GET /v1/payments/{id}` (x402) | 查询订单 |

---

## 11. 与未来 MCP 的接口契约（Phase 2 锁定）

详见 [PRD.md §4.3](PRD.md#43-mcp-serveragent-友好)；本节略。

---

## 12. 开放问题（设计阶段）

| # | 问题 | 默认 |
|---|------|------|
| ARCH-SDK-1 | 是否支持 sync + async 双客户端？ | 是（提供 `AsyncClient`） |
| ARCH-SDK-2 | 是否使用 `solders` 还是 `solana-py`？ | `solders`（更轻，Rust 内核） |
| ARCH-SDK-3 | 是否打包 CLI（`netstars-cli`）？ | Phase 2 加（balance / topup / call） |
| ARCH-SDK-4 | 是否提供 LangChain 适配？ | Phase 2 评估 |
