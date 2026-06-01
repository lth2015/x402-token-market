# X402 Token Market — System Architecture（Master）

> **文档定位**：基于 [prd.md](prd.md) v1.1 的系统级架构设计；为各模块 `<module>/ARCHITECTURE.md` 提供顶层约束
> **方法论**：C4 模型（Context / Container / Component） + AWS Well-Architected + 12-Factor
> **版本**：v1.1 · **日期**：2026-06-01 · **状态**：Draft
> **下层文档**：[infra/ARCHITECTURE.md](infra/ARCHITECTURE.md) · 各模块 `ARCHITECTURE.md`

---

## 1. 架构原则（先于设计的承诺）

| # | 原则 | 落地体现 |
|---|------|---------|
| AP1 | **模块独立部署，独立扩缩容，独立 CI/CD** | 每模块自己的 `.github/workflows/`、自己的 ECR repo、自己的 EKS Deployment |
| AP2 | **数据库不共享** | 每模块独立 RDS instance（或 logical DB）；模块间只通过 API 通信 |
| AP3 | **失败隔离 / Bulkhead** | 一个模块 down 不能传染整个系统；非关键路径降级 |
| AP4 | **链上行为完全隔离在 Wea** | Netstars 永不直接调 Solana；保持 Web2 PSP 监管定位 |
| AP5 | **可观测性优先** | 任何模块新增功能必须带 metrics + trace + structured log |
| AP6 | **API 向后兼容 ≥ 12 个月** | 主版本破坏性变更须经经营层 sign-off |
| AP7 | **资源声明在仓库** | 所有 K8s 资源声明在 `infra/k8s/` 里、走 PR；AWS 侧资源用 console + 文档化（暂不引入 Terraform）|
| AP8 | **Secrets 不入仓库** | 全部走 AWS Secrets Manager + External Secrets Operator |
| AP9 | **最小权限（Least Privilege）** | IAM Role 按模块拆分；K8s ServiceAccount 1:1 映射 IAM Role（IRSA） |
| AP10 | **每个模块都有 runbook** | 任何 Sev1/2 告警都必须能在 runbook 找到响应步骤 |

---

## 2. C4 — Level 1: System Context（系统上下文）

```
                          ┌──────────────────────────┐
                          │   Merchant Application   │
                          │   / AI Agent             │
                          │   (Customer)             │
                          └────────────┬─────────────┘
                                       │ HTTPS + API Key + HMAC
                                       │ (via SDK)
                                       ▼
        ┌──────────────────────────────────────────────────────────┐
        │     X402 Token Market Platform (Netstars + Wea Japan)     │
        │                                                            │
        │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐  │
        │   │  SDK     │  │  X402    │  │  Token   │  │  Wea    │  │
        │   │ (Library)│  │ Gateway  │  │  System  │  │ Connect │  │
        │   └──────────┘  └──────────┘  └──────────┘  └─────────┘  │
        └────────────────┬────────────────────┬────────────────────┘
                         │                    │
                         ▼                    ▼
                ┌─────────────────┐  ┌──────────────────┐
                │  AI Providers   │  │  Solana Network  │
                │  (External)     │  │  + USDC SPL      │
                │  Anthropic /    │  │                  │
                │  OpenAI / xAI / │  │                  │
                │  Google         │  │                  │
                └─────────────────┘  └──────────────────┘
                         │                    │
                         └────────────────────┴───── Netstars 与 Wea Japan 共建生态闭环
                                                     （Netstars: Web2 PSP 定位；Wea: 链上执行方）
```

**外部依赖**：
| 系统 | 关系 | 失败影响 | 备用 |
|------|------|---------|------|
| Solana RPC | 链上结算 | 链上不可用 | 多 RPC 节点冗余（QuickNode / Helius / 自建） |
| AI Providers | 业务调用 | 该 Provider 调用失败 | 多 Provider 路由（Phase 2） |
| AWS | 基础设施 | 全局不可用 | 多 AZ；DR 计划 |
| Netstars 既有发票系统 | 月度发票渲染 | 发票延迟，不影响主链路 | 离线生成 |
| Netstars 既有 SSO | Console 登录 | Console 不可登录，API 可用 | break-glass admin token |
| Wea Japan | 链上结算执行 | 支付链路中断 | 无（核心依赖） |

---

## 3. C4 — Level 2: Container View（容器/模块视图）

```
                                       ┌─────────────────┐
                                       │  Cloudflare /   │
                                       │  AWS Route 53   │
                                       └────────┬────────┘
                                                │
                              ┌─────────────────┼─────────────────┐
                              ▼                 ▼                 ▼
                       ┌──────────┐      ┌──────────┐      ┌──────────┐
                       │api.netst.│      │app.netst.│      │dev.netst.│
                       │   .jp    │      │   .jp    │      │   .jp    │
                       └────┬─────┘      └────┬─────┘      └────┬─────┘
                            │ ALB + WAF       │                  │
                            ▼                 ▼                  ▼
            ┌───────────────────────────────────────────────────────────────┐
            │              AWS EKS Cluster (ap-northeast-1)                  │
            │                                                                 │
            │  Namespace: x402         Namespace: token       Namespace: wea  │
            │  ┌──────────────┐        ┌──────────────┐       ┌────────────┐ │
            │  │ x402-api     │◄──────►│ token-api    │       │ wea-api    │ │
            │  │ x402-worker  │        │ token-worker │       │ wea-worker │ │
            │  └──────┬───────┘        │ token-console│       │ wea-callbk │ │
            │         │                └──────┬───────┘       └────┬───────┘ │
            │         │ mTLS                  │                    │ mTLS    │
            │         └──────────────────────►│◄───────────────────┘         │
            │                                 │                                │
            │                 ┌───────────────┼──────────────────┐            │
            │                 │ External      │ Secrets          │ IRSA       │
            │                 │  Secrets      │  Manager  ◄──────┤ IAM Role  │
            │                 └───────────────┘                  │            │
            └─────────────────┬───────────────┬──────────────────┴────────────┘
                              │               │                    
                              ▼               ▼                    
                       ┌──────────────┐ ┌──────────────┐  ┌──────────────┐
                       │ RDS Postgres │ │ ElastiCache  │  │ MSK (Phase2) │
                       │  per module  │ │   Redis      │  │  Kafka       │
                       └──────────────┘ └──────────────┘  └──────────────┘
                              │
                              ▼
                       ┌──────────────┐
                       │ AWS Backup   │
                       │  RDS snapsh. │
                       └──────────────┘

    ┌──────────────────────────────────────────────────────────────────────┐
    │  Wea Japan 独立账户（VPC Peering 或公网 + mTLS）                       │
    │  ┌────────────┐    ┌────────────┐    ┌──────────────────────────┐    │
    │  │ wea-api    │───►│ wea-worker │───►│  Solana RPC (multi-node) │    │
    │  └────────────┘    └────────────┘    └──────────────────────────┘    │
    └──────────────────────────────────────────────────────────────────────┘

观测层（独立 Namespace: observability）：
- OTel Collector → AWS X-Ray (traces) + CloudWatch (metrics/logs) + Grafana Cloud (dashboards)
- Prometheus（kube-state-metrics + node-exporter）→ Grafana
```

### 3.1 模块到容器/Pod 的映射

| 模块 | Pod 类型 | 副本数（prod） | 资源（每 Pod，prod） |
|------|---------|--------------|------------------|
| sdk | （Library，无 Pod） | — | — |
| netstars/x402 | `x402-api` | 3+ (HPA) | 0.5 CPU / 512Mi |
| netstars/x402 | `x402-worker`（过期扫描 / webhook 重试） | 1 (leader) + 2 (workers) | 0.5 CPU / 512Mi |
| netstars/token | `token-api` | 5+ (HPA) | 1 CPU / 1Gi |
| netstars/token | `token-worker`（发票/对账/告警） | 2 | 1 CPU / 1Gi |
| netstars/token | `token-console`（Web UI BFF + 静态文件 served by CloudFront） | 2+ | 0.5 CPU / 512Mi |
| wea | `wea-api` | 3+ (HPA) | 0.5 CPU / 512Mi |
| wea | `wea-worker`（广播 / 确认轮询） | 1 (leader) | 1 CPU / 1Gi |
| wea | `wea-callback`（回调发送） | 2+ | 0.5 CPU / 512Mi |

> HPA 策略：CPU 60% target + custom metric（待 Tier 2 定义具体业务指标）。

---

## 4. C4 — Level 3: Component View（模块内部组件）

详见各模块 `ARCHITECTURE.md`：
- [sdk/ARCHITECTURE.md](sdk/ARCHITECTURE.md)
- [netstars/x402/ARCHITECTURE.md](netstars/x402/ARCHITECTURE.md)
- [netstars/x402/console/README.md](netstars/x402/console/README.md)
- [netstars/token/ARCHITECTURE.md](netstars/token/ARCHITECTURE.md)
- [wea/ARCHITECTURE.md](wea/ARCHITECTURE.md)
- [wea/console/README.md](wea/console/README.md)

---

## 5. 技术栈选型矩阵（ADR 摘要）

| 选型项 | 选择 | 备选 | 决策理由 | ADR |
|--------|------|------|---------|-----|
| **后端语言** | Python (FastAPI) + Rust（Wea 链上模块） | Go / Node | Python 已是 AI 生态共识；Rust 用于 Wea 高安全场景 | ADR-001 |
| **前端框架** | Next.js 15（App Router）+ shadcn/ui | Remix / Vue | 与 SDK 文档站点统一栈；shadcn 与 Tailwind 配合最快出原型 | ADR-002 |
| **关系库** | **Aurora MySQL 8.0**（AWS RDS Multi-AZ） | RDS PostgreSQL | 团队既有 MySQL 经验；Aurora MySQL 兼容 8.0 全特性（JSON / CHECK / 分区 / SKIP LOCKED）| ADR-003 |
| **缓存** | Redis 7（ElastiCache） | Memcached | 支持 pub/sub、stream、lua 脚本 | ADR-004 |
| **消息队列** | Phase 1 无；Phase 2 SQS（简单场景）+ MSK Kafka（事件流） | RabbitMQ / NATS | AWS 原生；按需引入避免 v1 过早复杂 | ADR-005 |
| **K8s 部署** | **纯手写 YAML**（单一 QA 环境）| Kustomize / Helm | 环境只有一套，不需要 overlay；保持透明易读 | ADR-006 |
| **IaC** | **暂不用**（K8s YAML in Git，AWS 用 console + 文档）| Terraform / CDK | 团队未用过 Terraform，避免增加学习成本 | ADR-007 |
| **CI** | GitHub Actions | CircleCI / GitLab CI | 与代码同源；丰富 marketplace | ADR-008 |
| **CD** | GitHub Actions 直推 EKS（v1） | ArgoCD（v2） | 简单优先 | ADR-008 |
| **Tracing** | OpenTelemetry → X-Ray + Grafana Tempo | Datadog / NewRelic | 开放标准避免 vendor lock | ADR-009 |
| **Metrics** | Prometheus + Grafana Cloud | CloudWatch only | 行业通用 PromQL；保留迁出可能 | ADR-009 |
| **Logging** | CloudWatch Logs + S3 归档 | ELK | AWS 原生省运维 | ADR-009 |
| **Container Registry** | AWS ECR | DockerHub | 同 AWS 账号免出口流量 | ADR-010 |
| **Secrets** | AWS Secrets Manager + External Secrets Operator | HashiCorp Vault | AWS 原生 + K8s 集成成熟 | ADR-011 |
| **API 文档** | OpenAPI 3.1 + Redocly | Swagger UI | 现代标准；SDK 可基于 OpenAPI 自动生成 | ADR-012 |

> 每条 ADR 的完整论证将在 Tier 2 输出到 `docs/adr/ADR-NNN-*.md`。

---

## 6. 关键流程的架构视图

### 6.1 支付黄金路径(成功 case · v0.4.0 标准 x402 协议)

整条路径严格遵循 [x402.org](https://x402.org) 的 HTTP 402 + `X-PAYMENT` header 重试规范。Solana USDC 作为结算资产。

```
[Client / Customer Agent]
   │
   │ ① POST /v1/protected/checkout/order  (no X-PAYMENT)
   ▼
[ALB] ──► [x402-api Gateway]  (NetStars)
              │
              │ ② 402 Payment Required
              │    WWW-Authenticate: X402
              │    Body: { x402Version, accepts: [paymentRequirements] }
              │    requirements 含:scheme/network/maxAmountRequired/payTo
              │      /resource(URL binding)/asset(USDC mint)
              │      /extra: { nonce, decimals, facilitator, expiresAt }
              ▼
[Client] reads requirements
   │
   │ ③ 客户端签名(production: 浏览器钱包 Phantom/Solflare;
   │   demo: x402-api 提供 /internal/build-payment-payload 用 demo wallet 代签)
   │   → 得到 X-PAYMENT header (base64 of PaymentPayload JSON)
   │   payload 含 signedTxBase64 + WebAuthn userVerification(可选)
   │
   │ ④ POST /v1/protected/checkout/order  X-PAYMENT: <base64>
   ▼
[x402-api Gateway]
   │
   ├─ 解码 X-PAYMENT → PaymentPayload
   ├─ assert_payload_matches_requirements:
   │    payload.scheme/network/resource ⇄ requirements ⇄ actual URL
   ├─ resource binding(payload.resource = 实际请求 URL,防跨资源复用)
   ├─ expiry check(requirements.expiresAt 未过期)
   ├─ replay protection(SHA256(signed_tx_b64) 在 payment_proofs UNIQUE)
   ├─ 本地预验(proof.py 解析 SPL TransferChecked:mint/decimals/recipient/amount/memo nonce 全部对照)
   │
   │ ⑤ POST {facilitator}/facilitator/verify  (WEA, mTLS in prod)
   ▼
        [wea-api Facilitator]
              │
              │ verify:re-check requirements ⇄ payload
              │   委托 x402-api/internal/verify-payment-payload(SPL 强校验)
              │ → { isValid: true, payer, signature }
              ▼
   ⑥ POST {facilitator}/facilitator/settle
        [wea-api Facilitator]
              │
              │ Solana JSON-RPC sendTransaction(signed_tx_b64)
              │ poll getSignatureStatuses 直到 confirmed/finalized
              │ → { success, transaction, network, payer }
              ▼
[x402-api Gateway]
   │
   ├─ payment_orders FSM: created → pending → broadcasting → confirmed
   ├─ tx_hash UNIQUE 写库
   │
   │ ⑦ 200 OK + 业务 body
   │    X-PAYMENT-RESPONSE: <base64 settlement receipt>
   ▼
[Client] 拿到资源 + 链上结算凭证

观测:trace_id 贯穿 client → gateway → facilitator → Solana → gateway → client
合规要点 |x402.org spec| ✓全部实现:
  HTTP 402 / WWW-Authenticate / paymentRequirements / X-PAYMENT header
  / resource binding / verify before unlock / settlement receipt / replay
  / expiry / wrong-amount/network/recipient 拒绝
```

**角色边界**:

| 组件 | 角色 | 是否持密钥 | Solana 直连 |
|---|---|---|---|
| HABA | 业务消费方(MCP + 商品 + 顾问) | demo 期通过 `/internal/build` 调用 demo wallet;production 用浏览器钱包 | 否 |
| x402-api | NetStars Gateway(资源服务器) | 否(v0.4.0 起 demo wallet 移到 internal-only 端点) | 否(只本地解析,链上工作给 WEA) |
| wea-api | x402 Facilitator(Web3 payment provider) | 否(只 broadcast 不签名) | 是,直连 Solana JSON-RPC |
| Solana Devnet | USDC settlement layer | — | — |

**Legacy v0.3.0 removed paths**(kept here only as migration notes, not user-facing API):
- The old gateway-side signed checkout shortcut was removed because it made the resource server hold the demo wallet path.
- The old manual confirmation shortcut was removed because it skipped the x402 verify-before-unlock contract.
- HABA's old internal top-up proxy now returns 410 Gone until a protected standard x402 top-up resource is added.

### 6.2 反向路径与对账（详见各模块 ARCHITECTURE.md）

- **支付超时**：x402-api 发出 PaymentRequirements 后等待客户端重试；过期后订单收敛为 expired,资源不会解锁。
- **Wea settlement 失败**：x402-api 将订单保持在 failed / pending 可观测状态,控制台显示 facilitator reason 与 trace_id。
- **链上已确认但业务响应失败**：tx_hash 与 payment proof 以 UNIQUE 约束入库；客户端可用同一幂等键查询/重试业务响应,避免重复扣款。
- **Token ledger 边界**：商品 checkout 只写 x402 payment order 与 settlement proof；AI usage debit 仍由 token-api `/v1/messages` 单独计量。

---

## 7. NFR 的架构落地（怎么实现 prd.md §6 的目标）

### 7.1 安全
| PRD NFR | 架构落地 |
|---------|---------|
| TLS 1.3 | ALB 终止 TLS；ACM 管理证书；旧 TLS 版本拒绝（ALB 配置） |
| API Key + HMAC | token-api 共享 Auth Service；Redis 缓存 hash 校验；时钟偏移 5min 容忍 |
| 私钥不入服务端 | SDK 在客户端签名；Wea 钱包用 AWS KMS（envelope encryption + 强制 IAM 审批） |
| 幂等性 | Redis idempotency + MySQL UNIQUE constraint 双保险 |
| 审计日志 | append-only `audit_log` 表（按月 RANGE 分区）+ MySQL `REVOKE UPDATE,DELETE` + CloudTrail（AWS 操作） |
| PII 加密 | 应用层 AES-256-GCM + KMS-managed data key（envelope encryption；不依赖数据库扩展） |

### 7.2 合规
| PRD NFR | 架构落地 |
|---------|---------|
| 数据 region 限定 | RDS / S3 / EKS 全部 ap-northeast-1（東京）；ap-northeast-3（大阪）DR；不出日本 |
| 个人情報保護 | PII 字段独立加密（pgcrypto + KMS-managed key）；删除 API |
| Wea 边界 | Wea Japan 独立 AWS 账户；与 Netstars 通过 VPC Peering + mTLS；合规事件分离 |
| 7 年保留 | RDS 流水表分区；冷数据 S3 Glacier Deep Archive |

### 7.3 性能 SLO
| 指标 | 架构手段 |
|------|---------|
| API p99 < 500ms (Phase 1) → < 200ms (Phase 3) | EKS HPA + Redis cache + Aurora MySQL reader endpoint + ProxySQL（Phase 2 引入连接池） |
| 50 TPS → 500+ TPS | 水平扩展 + 异步 worker 解耦 |
| 99.5% → 99.9% 可用性 | Multi-AZ + 多副本 + healthz/readyz + PDB |
| 链上确认 < 1s | Solana confirmed level + 多 RPC 节点 |

### 7.4 可观测
| PRD NFR | 架构落地 |
|---------|---------|
| 全链路 trace_id | OpenTelemetry SDK 自动注入；ALB X-Forwarded-Trace header 透传 |
| 关键指标 metrics | Prometheus scrape `/metrics`（每 Pod 暴露）；Grafana 仪表盘 |
| 异常告警 | Alertmanager → PagerDuty (P0/P1) + Slack (P2/P3) |
| 客户可查 trace | Console 集成 trace_id 检索 → Grafana Tempo query |

### 7.5 容灾
| PRD NFR | 架构落地 |
|---------|---------|
| RPO ≤ 5min | Aurora MySQL 连续备份（PITR）+ binlog 持续传输到 S3 |
| RTO ≤ 30min | runbook + Aurora snapshot restore；K8s YAML 在 Git 可直接 `kubectl apply` 重建（Tier 3） |
| 多 RPC | Wea 配置 ≥ 3 个 Solana RPC + 健康检查 + 自动切换 |
| USDC 脱锚保护 | Wea worker 每分钟拉价 → 阈值触发 K8s ConfigMap 翻转 → 拒绝新 settlement |

---

## 8. 安全架构（Defense in Depth）

```
┌─ Layer 7 ── AWS WAF（OWASP Top 10 规则 + rate limit + Geo block）
│
├─ Layer 7 ── ALB（TLS 1.3 终止；HSTS；strict transport）
│
├─ Layer 4 ── Security Group（Pod 级；最小开放）
│
├─ App   ── API Key + HMAC（每请求） + 时间戳 nonce
│
├─ App   ── mTLS（模块间）；ServiceAccount → IAM Role（IRSA）
│
├─ App   ── 输入校验（Pydantic / Zod）；输出脱敏
│
├─ Data  ── RDS at-rest 加密（KMS CMK）+ in-transit TLS
│
├─ Data  ── PII field-level 加密（pgcrypto + KMS data key）
│
├─ Secrets ── AWS Secrets Manager；自动轮换；Audit by CloudTrail
│
├─ Network ── VPC 私网 + NAT；公网入口仅 ALB；出站 Egress 白名单
│
├─ Monitor ── GuardDuty + Security Hub + CloudTrail；异常实时告警
│
└─ Process ── 每 PR 必跑：SAST (Bandit/Semgrep) + 依赖审计 (pip-audit/npm audit)
              + 镜像扫描 (Trivy)；CVE 高危阻断 merge
```

---

## 9. 部署拓扑摘要（详见 [infra/ARCHITECTURE.md](infra/ARCHITECTURE.md)）

```
AWS Account: netstars-prod                      AWS Account: wea-prod
├─ ap-northeast-1 (Tokyo)                       ├─ ap-northeast-1
│  ├─ VPC: vpc-netstars                          │  ├─ VPC: vpc-wea
│  │  ├─ Public Subnets (ALB)                    │  │  ├─ Public Subnets
│  │  ├─ Private Subnets (EKS nodes)             │  │  ├─ Private Subnets
│  │  └─ DB Subnets (RDS, multi-AZ)              │  │  └─ DB Subnets
│  ├─ EKS cluster: netstars-prod                 │  ├─ EKS cluster: wea-prod
│  ├─ RDS: per-module                            │  ├─ RDS: wea-prod
│  ├─ ElastiCache: redis-shared                  │  ├─ KMS: wea-wallet-keys (CMK, ap-ne-1)
│  ├─ ECR: 4 repos                               │  ├─ ECR: 1 repo
│  ├─ Secrets Manager                             │  └─ Secrets Manager
│  └─ VPC Peering ──────────────────────────────►│
│                                                 │
└─ ap-northeast-3 (Osaka) — DR                   └─ ap-northeast-3 — DR
```

环境拆分（v1.2 决策 · 简化为单一 QA）：
- **local**：开发者本机 docker-compose（MySQL + Redis + 各服务）；Solana Devnet
- **qa**：唯一上线环境，AWS EKS；Solana Devnet（接 Devnet faucet 测试）
- ~~staging / prod~~：暂不开；待业务决定上 mainnet 时再加 `prod` env

---

## 10. 跨模块约定（必须遵守）

### 10.1 命名规范
- K8s namespace = 模块名（`x402` / `token` / `wea`）
- ECR repo = `<account>/x402-token-market/<module>/<service>`（例：`...x402/x402-api`）
- Secrets path = `/<env>/<module>/<purpose>`（例：`/prod/token/db-credentials`）
- ConfigMap key 采用 SCREAMING_SNAKE_CASE
- 环境变量 12-factor 风格

### 10.2 API 版本管理
- URL 中带 major 版本：`/v1/...`、`/v2/...`
- minor 版本通过 `Accept-Version: 1.3` header（可选）
- Deprecated endpoint 至少存活 12 个月，并在 response header 中标注 `Sunset: <date>`

### 10.3 错误响应统一格式（参考 RFC 9457 Problem Details）
```json
{
  "type": "https://errors.netstars.jp/insufficient-balance",
  "title": "Token balance is insufficient",
  "status": 402,
  "detail": "Required: 1000 token, available: 500",
  "instance": "/v1/messages",
  "trace_id": "00-...-...-01",
  "error_code": "INSUFFICIENT_BALANCE",
  "metadata": { "balance": 500, "required": 1000 }
}
```

### 10.4 日志结构（JSON Lines）
```json
{
  "ts": "2026-05-26T12:00:00.123Z",
  "level": "info",
  "service": "x402-api",
  "trace_id": "...",
  "span_id": "...",
  "request_id": "...",
  "merchant_id": "mch_...",
  "msg": "payment confirmed",
  "payment_order_id": "pmt_...",
  "tx_hash": "5KJp...",
  "latency_ms": 234
}
```

### 10.5 健康检查约定
- `GET /healthz` — liveness：进程活着即可（返回 200）
- `GET /readyz` — readiness：所有依赖（DB / Redis / 外部 API）就绪才返回 200
- `GET /metrics` — Prometheus 格式 metrics

---

## 11. 路径与未来演进

### 11.1 Phase 1 → Phase 3 架构演进
| 阶段 | 架构变化 |
|------|---------|
| Phase 1 (Demo) | 单 cluster `dev`；HTTP 同步；无消息队列 |
| Phase 2 (试点) | 加 `staging` cluster；引入 SQS（webhook 重试 / 异步任务）；多 Provider 路由 |
| Phase 3 (产品化) | `prod` cluster；MSK Kafka（事件流）；ArgoCD GitOps；X402 → Token 系统合并 |
| Phase 4 (生态) | 跨 region 多活；跨链；Service Mesh（Istio）按需引入 |

### 11.2 X402 → Token 合并的架构准备
- v1 阶段 x402 与 token 数据库 schema 中 PaymentOrder 字段对齐（命名、ID 格式、类型）
- v1 引入"事件总线"概念（Phase 1 用 HTTP，Phase 2 用 Kafka）；合并时 token 接管 x402 的事件
- 共享 Auth Service 提前抽取（避免两套鉴权）

---

## 12. 仍待决策（影响架构 Spec）

| # | 决策项 | 默认假设（本文档基于此） | 影响 |
|---|--------|------------------|------|
| **D3** | Token 定价模型 | 混合（套餐 + 按量） | Token 计费引擎复杂度 + Console 设计 |
| **D4** | Wea 部署位置 | **独立 AWS 账户 + VPC Peering**（推荐）/ 备选公网 + mTLS | 网络拓扑 + 合规审计便利性 |
| **D5** | 失败支付的 Token 处理 | 严格"先确认、后 credit"，永不"乐观 credit" | 状态机复杂度（详见 §6.2） |

> ⚠️ 若上述任一项实际选择与默认不同，需重审本文档对应章节并通知各模块 ARCHITECTURE.md 调整。

## 13. v1.2 变更摘要

- 数据库：PostgreSQL → **Aurora MySQL 8.0**（user decision）
- 环境：dev/staging/prod → **单一 QA 环境**（local 用 docker-compose）
- IaC：移除 Terraform；**只用手写 K8s YAML in Git**
- ENUM type / 物化视图 / pgcrypto 等 PG 特性已用 MySQL 等效方案替代（详见各模块 SCHEMA.sql）

---

## 13. 参考资料

- [Master PRD](prd.md)
- [infra/ARCHITECTURE.md](infra/ARCHITECTURE.md) — AWS 基础设施详细架构
- 各模块 `ARCHITECTURE.md`
- AWS Well-Architected Framework
- C4 Model（[c4model.com](https://c4model.com)）
- 12-Factor App（[12factor.net](https://12factor.net)）
- RFC 9457 Problem Details for HTTP APIs
