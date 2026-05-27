# SDK · Detailed Design

> **属于**：[ARCHITECTURE.md](ARCHITECTURE.md) · [PRD.md](PRD.md)
> **范围**：实现层的关键算法、状态管理、伪代码、边界处理
> **目标读者**：动手写 SDK 的工程师；要让他们看完能直接动键盘

---

## 1. 项目骨架

```
sdk/
├─ src/netstars/
│   ├─ __init__.py              公开 API: Client, AsyncClient, Wallet, errors
│   ├─ client.py                Client / AsyncClient facade
│   ├─ transport.py             HTTP 客户端 + 重试 + HMAC 签名
│   ├─ x402.py                  402 协议握手 + 支付协调
│   ├─ tokens.py                Token 操作（balance, purchase, usage）
│   ├─ chat.py                  AI 调用（chat, messages, streaming）
│   ├─ models.py                Pydantic dataclasses（请求/响应模型）
│   ├─ wallet/
│   │   ├─ base.py              Wallet Protocol
│   │   ├─ file.py              FileWallet（从 JSON keypair 加载）
│   │   ├─ env.py               EnvWallet
│   │   └─ kms.py               KMSWallet（企业）
│   ├─ signer.py                Solana USDC transfer 构造 + 签名
│   ├─ errors.py                异常层级
│   ├─ retry.py                 重试策略
│   ├─ tracing.py               W3C TraceContext 注入
│   ├─ mcp/                     (Phase 2)
│   │   ├─ server.py
│   │   └─ tools.py
│   └─ _internal/
│       ├─ logging.py           内部 logger（默认静默）
│       └─ utils.py
├─ tests/
│   ├─ unit/
│   ├─ integration/             用 respx mock backend
│   └─ e2e/                     真实 devnet
├─ pyproject.toml
└─ Makefile
```

---

## 2. Client Facade — 完整接口

```python
from typing import Any, AsyncIterator, Callable, Iterator, Literal, Optional
import httpx
from .wallet import Wallet
from .errors import NetstarsError

class Client:
    """Synchronous client. Thread-safe."""

    def __init__(
        self,
        api_key: str,
        api_key_secret: str,
        wallet: Wallet,
        env: Literal["devnet", "mainnet"] = "devnet",
        base_url: Optional[str] = None,           # auto-derived from env if None
        timeout: float = 30.0,
        max_retries: int = 5,
        auto_purchase: bool = True,
        on_event: Optional[Callable[[dict], None]] = None,
        http_client: Optional[httpx.Client] = None,
    ):
        ...

    # Sub-resources
    @property
    def tokens(self) -> "TokensAPI": ...
    @property
    def models(self) -> "ModelsAPI": ...

    # Convenience: AI calls
    def chat(self, model: str, messages: list[dict], **kw) -> "ChatResponse": ...
    def chat_stream(self, model: str, messages: list[dict], **kw) -> Iterator["ChatChunk"]: ...

    # Diagnostics
    def healthz(self) -> dict: ...
    def close(self) -> None: ...
    def __enter__(self): return self
    def __exit__(self, *exc): self.close()


class AsyncClient:
    """Async variant. Same API surface."""
    async def chat(...) -> "ChatResponse": ...
    async def chat_stream(...) -> AsyncIterator["ChatChunk"]: ...
    ...
```

---

## 3. HTTP Transport · 关键算法

### 3.1 请求签名（HMAC-SHA256）
```python
import hmac, hashlib, secrets, time

def sign_request(
    method: str, path: str, body_bytes: bytes,
    api_key_id: str, api_key_secret: str,
) -> dict[str, str]:
    ts = str(int(time.time()))
    nonce = secrets.token_hex(16)
    body_sha = hashlib.sha256(body_bytes).hexdigest()
    string_to_sign = f"{method}\n{path}\n{ts}\n{nonce}\n{body_sha}"
    sig = hmac.new(
        api_key_secret.encode(), string_to_sign.encode(), hashlib.sha256
    ).hexdigest()
    return {
        "Authorization":         f"Bearer {api_key_id}",
        "X-Netstars-Timestamp":  ts,
        "X-Netstars-Nonce":      nonce,
        "X-Netstars-Signature":  sig,
    }
```

服务端用相同算法重组 string_to_sign 并比对 HMAC。时间戳偏移 > 5 分钟拒绝。

### 3.2 重试矩阵
```python
RETRY_ON_STATUS = {408, 429, 500, 502, 503, 504}
RETRY_ON_EXCEPTION = (
    httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout,
    httpx.RemoteProtocolError,
)

def should_retry(exc: Exception | None, response: httpx.Response | None, attempt: int) -> bool:
    if attempt >= 5:
        return False
    if exc and isinstance(exc, RETRY_ON_EXCEPTION):
        return True
    if response and response.status_code in RETRY_ON_STATUS:
        return True
    return False

def compute_backoff(attempt: int, response: httpx.Response | None) -> float:
    # honor Retry-After if present
    if response and (ra := response.headers.get("Retry-After")):
        try:
            return float(ra)
        except ValueError:
            pass
    # exp backoff with jitter
    base_ms = 100 * (2 ** attempt)              # 100 / 200 / 400 / 800 / 1600
    jitter_ms = secrets.randbelow(50)
    return min((base_ms + jitter_ms) / 1000.0, 30.0)
```

### 3.3 熔断器（防雪崩）
```python
class CircuitBreaker:
    def __init__(self, failure_threshold=0.5, window_seconds=60, recovery_seconds=30):
        ...
    def record_success(self): ...
    def record_failure(self): ...
    def is_open(self) -> bool:
        # open if rolling-failure-rate > threshold AND last_state_change > recovery
        ...
```

每个 Client 实例持有一个熔断器（不跨实例共享）。

---

## 4. X402 自动协商 · 核心状态机

```python
class X402Coordinator:
    """Handles the 402 retry dance transparently for any call."""

    def __init__(self, client: "Client"):
        self._client = client
        self._wallet = client._wallet
        self._tokens = client.tokens

    def execute(self, method: str, path: str, json_body: dict) -> httpx.Response:
        """
        Pseudocode:
        1. Send request normally
        2. If 200 → return
        3. If 402 → extract payment_intent
           3a. If auto_purchase=False → raise PaymentRequiredError
           3b. Else:
               - sign USDC transfer locally
               - POST /v1/payments/{order_id}/proof
               - poll GET /v1/payments/{order_id} until status='token_credited' (max 30s)
               - retry original request once
               - if still 402 → raise PaymentFailedError (won't loop)
        4. Other errors → propagate
        """
        attempts_with_402 = 0
        while True:
            resp = self._client._transport.request(method, path, json=json_body)
            if resp.status_code != 402:
                resp.raise_for_status()
                return resp
            attempts_with_402 += 1
            if attempts_with_402 > 1:
                raise PaymentFailedError(
                    "Got 402 after just paying — possible balance race"
                )
            if not self._client._auto_purchase:
                raise PaymentRequiredError.from_response(resp)
            self._handle_402(resp)
            # loop continues to retry original request

    def _handle_402(self, resp: httpx.Response):
        intent = PaymentIntent.parse(resp.json())
        signed_tx = self._wallet.sign_usdc_transfer(
            amount_usdc_micro=intent.amount_usdc_micro,
            recipient=intent.recipient,
            nonce=intent.nonce,
        )
        order = self._client._transport.post(
            f"/v1/payments/{intent.order_id}/proof",
            json={"signed_tx_base64": signed_tx, "tx_hash": signed_tx_hash(signed_tx)},
        ).json()
        self._wait_for_credit(intent.order_id, timeout=30.0)

    def _wait_for_credit(self, order_id: str, timeout: float):
        deadline = time.time() + timeout
        while time.time() < deadline:
            order = self._tokens.get_payment(order_id)
            if order.status == "token_credited":
                return
            if order.status in {"failed", "expired", "canceled"}:
                raise PaymentFailedError(f"Order ended in {order.status}", order=order)
            time.sleep(0.5)
        raise TimeoutError(f"Payment {order_id} not credited in {timeout}s")
```

**关键不变式**：`_handle_402` 在单次 `execute` 中**最多调用一次**。第二次 402 直接抛错（防止无限循环）。

---

## 5. Wallet 抽象与 USDC 签名

### 5.1 Wallet Protocol
```python
from typing import Protocol

class Wallet(Protocol):
    def public_key(self) -> str: ...                          # base58
    def sign_message(self, msg: bytes) -> bytes: ...           # raw 64-byte signature
    def sign_usdc_transfer(
        self, amount_usdc_micro: int, recipient: str, nonce: str,
    ) -> str: ...                                              # base64-encoded signed tx
```

### 5.2 FileWallet 实现
```python
import json, base58, nacl.signing
from pathlib import Path

class FileWallet:
    def __init__(self, keypair_path: str | Path):
        data = json.loads(Path(keypair_path).read_text())
        # Solana keypair file is a 64-byte array: [private(32), public(32)]
        seed = bytes(data[:32])
        self._signing_key = nacl.signing.SigningKey(seed)
        self._verify_key = self._signing_key.verify_key
        self._pubkey_b58 = base58.b58encode(bytes(self._verify_key)).decode()

    def public_key(self) -> str:
        return self._pubkey_b58

    def sign_message(self, msg: bytes) -> bytes:
        return self._signing_key.sign(msg).signature

    def sign_usdc_transfer(self, amount_usdc_micro, recipient, nonce) -> str:
        return build_and_sign_spl_transfer(
            from_pubkey=self.public_key(),
            to_pubkey=recipient,
            mint=USDC_MINT[self._env],
            amount_micro=amount_usdc_micro,
            signer=self,                              # use sign_message
            recent_blockhash=fetch_recent_blockhash(),
            nonce_memo=nonce,
        )
```

### 5.3 SPL Token Transfer 构造（用 solders）
```python
from solders.transaction import VersionedTransaction
from solders.message import MessageV0
from spl.token.instructions import transfer_checked, TransferCheckedParams
from spl.token.constants import TOKEN_PROGRAM_ID
from solders.instruction import Instruction
from solders.system_program import ID as SYSTEM_PROGRAM_ID

def build_and_sign_spl_transfer(
    from_pubkey: str, to_pubkey: str, mint: str,
    amount_micro: int, signer: "Wallet",
    recent_blockhash: str, nonce_memo: str,
) -> str:
    from_ata = get_associated_token_address(from_pubkey, mint)
    to_ata   = get_associated_token_address(to_pubkey,   mint)

    ix_transfer = transfer_checked(TransferCheckedParams(
        program_id=TOKEN_PROGRAM_ID,
        source=from_ata,
        mint=Pubkey.from_string(mint),
        dest=to_ata,
        owner=Pubkey.from_string(from_pubkey),
        amount=amount_micro,
        decimals=6,
    ))
    # Memo instruction to carry nonce — prevents replay
    ix_memo = Instruction(
        program_id=MEMO_PROGRAM_ID,
        accounts=[],
        data=nonce_memo.encode(),
    )
    msg = MessageV0.try_compile(
        payer=Pubkey.from_string(from_pubkey),
        instructions=[ix_memo, ix_transfer],
        address_lookup_table_accounts=[],
        recent_blockhash=Hash.from_string(recent_blockhash),
    )
    tx = VersionedTransaction(msg, [])
    # Sign manually using our Wallet abstraction (so AWS-KMS-encrypted Wallet works too)
    sig_bytes = signer.sign_message(bytes(tx.message))
    tx.signatures = [Signature.from_bytes(sig_bytes)]
    return base64.b64encode(bytes(tx)).decode()
```

> **关键**：用 `transfer_checked`（不是 `transfer`），强制 decimals 校验防错误 token。

---

## 6. AI 调用 · 统一接口

```python
class ChatAPI:
    def chat(
        self, model: str, messages: list[dict],
        max_tokens: int = 4096,
        temperature: float = 1.0,
        stream: bool = False,
        provider_options: dict | None = None,
        timeout: float | None = None,
    ) -> "ChatResponse | Iterator[ChatChunk]":
        body = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": stream,
        }
        if provider_options:
            body["provider_options"] = provider_options

        if stream:
            return self._client._x402.execute_streaming("POST", "/v1/messages", body)
        resp = self._client._x402.execute("POST", "/v1/messages", body)
        return ChatResponse.parse(resp.json())
```

### 6.1 流式响应处理（SSE）
```python
def stream_chat(self, model, messages, **kw) -> Iterator[ChatChunk]:
    """
    服务端用 Server-Sent Events 格式（与 OpenAI/Anthropic 一致）：
        event: message_delta
        data: {"delta":{"text":"..."}, "usage":{...}}

        event: message_stop
        data: {"usage":{"tokens_consumed":423,"balance_after":11999577}}
    """
    with self._client._transport.stream("POST", "/v1/messages", json=body) as resp:
        if resp.status_code == 402:
            # Even for streaming, handle 402 once
            self._client._x402._handle_402(resp)
            yield from self.stream_chat(model, messages, **kw)   # one retry
            return
        resp.raise_for_status()
        for line in resp.iter_lines():
            if line.startswith("data: "):
                payload = json.loads(line[6:])
                yield ChatChunk.parse(payload)
```

---

## 7. 异常映射

```python
def map_response_to_exception(resp: httpx.Response) -> NetstarsError:
    body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
    code = body.get("error_code") or "UNKNOWN"
    trace_id = body.get("trace_id") or resp.headers.get("X-Trace-Id")
    ctx = {"trace_id": trace_id, "request_id": body.get("instance"), **body.get("metadata", {})}

    cls = {
        401: AuthenticationError,
        403: AuthorizationError,
        402: PaymentRequiredError,
        429: RateLimitError,
        400: ValidationError,
        422: ValidationError,
        408: TimeoutError,
    }.get(resp.status_code) or (ServerError if resp.status_code >= 500 else NetstarsError)

    if cls is PaymentRequiredError:
        return PaymentRequiredError(intent=PaymentIntent.parse(body), **ctx)
    if cls is RateLimitError:
        return RateLimitError(retry_after=int(resp.headers.get("Retry-After", "60")), **ctx)
    return cls(body.get("detail", body.get("title", "")), code=code, **ctx)
```

---

## 8. 可观测性 hook

```python
class Client:
    def __init__(self, ..., on_event: Callable[[dict], None] | None = None):
        self._on_event = on_event or (lambda _: None)

    def _emit(self, event_name: str, **fields):
        try:
            self._on_event({"event": event_name, "ts": time.time(), **fields})
        except Exception:
            pass  # never let user callback break SDK
```

emit events:
- `request_start { trace_id, method, path }`
- `request_end   { trace_id, status, latency_ms }`
- `retry         { trace_id, attempt, reason }`
- `payment_initiated  { order_id, amount_usdc_micro }`
- `payment_confirmed  { order_id, tx_hash }`

---

## 9. MCP Server（Phase 2 设计）

```python
# src/netstars/mcp/server.py
from mcp.server import Server, NotificationOptions
from mcp.server.models import InitializationOptions
from mcp import types

app = Server("netstars-sdk")

@app.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="get_token_balance",
            description="Get current Netstars AI Token balance (in tokens and USDC equivalent)",
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        types.Tool(
            name="purchase_tokens",
            description="Purchase AI Tokens via X402 + USDC. Returns when payment is confirmed.",
            inputSchema={
                "type": "object",
                "properties": {
                    "amount_usdc": {"type": "number", "description": "Amount in USDC, e.g. 10.0"}
                },
                "required": ["amount_usdc"],
            },
        ),
        types.Tool(
            name="list_available_models",
            description="List AI models accessible via this account, with per-1k token pricing",
            inputSchema={"type": "object"},
        ),
        types.Tool(
            name="call_model",
            description="Call an AI model. Returns model response and usage.",
            inputSchema={
                "type": "object",
                "properties": {
                    "model": {"type": "string"},
                    "messages": {"type": "array"},
                },
                "required": ["model", "messages"],
            },
        ),
        types.Tool(name="get_usage_today", description="...", inputSchema={"type": "object"}),
        types.Tool(name="get_payment_status", description="...", inputSchema={
            "type": "object", "properties": {"payment_order_id": {"type": "string"}},
            "required": ["payment_order_id"],
        }),
    ]

@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    client = _get_or_create_client()
    if name == "get_token_balance":
        b = await client.tokens.balance()
        return [types.TextContent(type="text", text=json.dumps(b.model_dump()))]
    elif name == "purchase_tokens":
        order = await client.tokens.purchase(amount_usdc=arguments["amount_usdc"])
        return [types.TextContent(type="text", text=json.dumps(order.model_dump()))]
    # ... rest
```

---

## 10. 测试策略

### 10.1 Unit
```python
# tests/unit/test_signer.py
def test_hmac_signature_matches_server_algorithm():
    headers = sign_request("POST", "/v1/payments", b'{"amount":10}', "ak_test", "secret")
    assert headers["X-Netstars-Signature"] == \
        hmac.new(b"secret", b"POST\n/v1/payments\n...", hashlib.sha256).hexdigest()

def test_signature_includes_body_hash():
    h1 = sign_request("POST", "/p", b"a", "k", "s")
    h2 = sign_request("POST", "/p", b"b", "k", "s")
    assert h1["X-Netstars-Signature"] != h2["X-Netstars-Signature"]
```

### 10.2 Integration (respx)
```python
# tests/integration/test_x402_handshake.py
import respx, httpx

@respx.mock
def test_402_triggers_purchase_and_retry():
    # 1st call → 402
    respx.post("https://api/v1/messages").mock(side_effect=[
        httpx.Response(402, json={
            "error_code": "INSUFFICIENT_BALANCE",
            "payment_intent": {...},
        }),
        httpx.Response(200, json={"content": "...", "usage": {...}}),
    ])
    respx.post("https://api/v1/payments/pmt_xx/proof").mock(return_value=httpx.Response(200, json={}))
    respx.get("https://api/v1/payments/pmt_xx").mock(return_value=httpx.Response(200, json={
        "status": "token_credited",
    }))
    client = Client(api_key="k", api_key_secret="s", wallet=MockWallet(), env="devnet")
    resp = client.chat(model="claude-opus-4-7", messages=[...])
    assert resp.content == "..."
```

### 10.3 E2E (devnet)
```python
# tests/e2e/test_devnet.py
@pytest.mark.e2e
def test_full_purchase_and_call_on_devnet():
    client = Client(
        api_key=os.environ["NETSTARS_TEST_KEY"],
        api_key_secret=os.environ["NETSTARS_TEST_SECRET"],
        wallet=FileWallet("./test-wallet.json"),
        env="devnet",
    )
    # ensure 0 balance
    client.tokens.purchase(amount_usdc=1.0)
    resp = client.chat(model="claude-haiku-4-5", messages=[{"role":"user","content":"hi"}])
    assert resp.content
    assert resp.usage.tokens_consumed > 0
```

---

## 11. 性能优化

### 11.1 冷启动 < 200ms
- 延迟 import：`solders` / `spl.token` 等大依赖只在第一次 sign 时 import
- Pydantic v2 + `model_config = ConfigDict(frozen=True)` 减少 metaclass 开销
- 不在 `__init__` 做任何 IO

### 11.2 连接池
- httpx Client 内部 keepalive，复用 connection
- 同一进程多 Client 实例不共享 connection pool（避免 cross-tenant 串）

### 11.3 签名加速
- pynacl 已是 C 实现；50ms 内
- 如果 KMS：批量签名（KMS BatchInvoke 不支持，必须串行）

---

## 12. 安全 review checklist

- [ ] API Key 永不出现在日志（logger filter 强制 mask）
- [ ] 异常 message 不含 secret
- [ ] 私钥不传入异常 ctx
- [ ] 强制 TLS（dev 模式 opt-in 允许 http://localhost）
- [ ] Trivy 镜像扫描通过（无 HIGH/CRITICAL CVE）
- [ ] pip-audit 通过
- [ ] 任何 user input 走 Pydantic 校验
