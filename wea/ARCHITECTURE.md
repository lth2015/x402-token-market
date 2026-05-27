# Wea Settlement Connector — Architecture

> **属于**：[../ARCHITECTURE.md](../ARCHITECTURE.md)
> **基于**：[PRD.md](PRD.md)
> **版本**：v1.0 · **日期**：2026-05-26
> **特别**：本模块由 **Wea Japan 独立运营**（独立 AWS 账户）；下文是双方共同遵守的架构约定。

---

## 1. 模块内部组件

```
┌─────────────────────────────────────────────────────────────────────────┐
│            wea/  (deployed in wea-prod AWS account)                      │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  wea-api (Rust + axum / actix-web; stateless)                     │   │
│  │  Routers:                                                          │   │
│  │   POST /v1/settlements           (创建结算请求)                    │   │
│  │   GET  /v1/settlements/{id}      (查询)                            │   │
│  │   GET  /v1/settlements           (列表/对账)                        │   │
│  │   POST /v1/settlements/{id}/retry                                  │   │
│  │   GET  /healthz /readyz /metrics                                   │   │
│  │   GET  /v1/system/status                                           │   │
│  │                                                                     │   │
│  │  Middleware: mTLS verify + HMAC verify + rate-limit                │   │
│  └──────────┬────────────────────────────────────────────────────────┘   │
│             │                                                              │
│  ┌──────────▼──────────────────────────────────────────────────────┐    │
│  │  wea-worker (long-running; leader-elected)                        │    │
│  │  - tx-broadcaster      (从 pending 队列取，签名 → 广播)           │    │
│  │  - tx-confirmer        (持续轮询交易状态)                          │    │
│  │  - depeg-monitor       (USDC 价格 + 系统 flag 翻转)                │    │
│  │  - rpc-health-monitor  (节点健康度，自动切换)                       │    │
│  │  - balance-monitor     (接收钱包余额)                              │    │
│  └──────────┬──────────────────────────────────────────────────────┘    │
│             │                                                               │
│  ┌──────────▼──────────────────────────────────────────────────────┐    │
│  │  wea-callback (callback sender)                                   │    │
│  │  - 从 DB SKIP LOCKED 取 pending callbacks                         │    │
│  │  - 重试策略：5min / 15min / 1h / 6h / 24h（max 5）                │    │
│  │  - HMAC + mTLS sign 出站                                          │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  External Connections:                                                       │
│   - Solana RPC nodes (≥3, multi-provider: QuickNode / Helius / 自建)         │
│   - Price Oracle (CoinGecko REST + Chainlink on-chain)                       │
│   - AWS KMS (ap-northeast-1, CMK) for wallet-keypair encrypt-at-rest         │
│                                                                              │
│  Data Stores:                                                                │
│   - RDS PostgreSQL (wea-prod, in wea AWS account)                            │
│   - ElastiCache Redis (leader election / RPC health cache)                   │
│                                                                              │
│  Wallet Architecture:                                                        │
│   - Hot wallet  (接收支付) ─ low balance, frequent rotation                   │
│   - Warm wallet (gas)      ─ medium balance                                  │
│   - Cold wallet (vault)    ─ multi-sig, manual ops                           │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 为什么 Rust（不是 Python）
- 钱包/签名/交易序列化路径要求**确定性、内存安全、零 panic**
- Solana 官方 `solana-program` + `solders` 等 Rust 生态成熟
- 编译型避免 runtime 依赖意外
- Wea 团队既有 Rust 工程经验

> 内部业务逻辑（worker / callback dispatcher）可以 Rust，也可以 Go；按团队偏好决定。Tier 2 在 wea 团队评审后定稿。

---

## 3. 关键设计

### 3.1 状态机
```
[POST /v1/settlements]
        │
        ▼
   pending  ──verify fail──► failed (terminal)
        │
        ▼
   broadcasting  ──RPC 失败 (final)──► failed
        │
        │ tx confirmed
        ▼
   confirmed  ──回调成功──► done (terminal)
        │
        │ 回调失败 5 次
        ▼
   callback_failed (人工介入；但状态保留 confirmed 事实)
```

### 3.2 链上交易广播流程
```rust
// 伪代码
async fn broadcast(settlement: Settlement) -> Result<Signature> {
    // 1. 从 KMS 获取钱包签名能力（不取出私钥）
    let signer = KmsSigner::new(KMS_KEY_ID);

    // 2. 反序列化客户端提交的 signed_tx
    let mut tx: VersionedTransaction = bincode::deserialize(&settlement.signed_tx)?;

    // 3. 客户端已经签好；wea 不再加 signer（如果 transaction 设计为单签）
    // 或者 wea 也是 cosigner（按 USDC transfer 设计；通常是 client sole signer）

    // 4. 获取最新 blockhash 更新（避免过期）
    let latest = rpc.get_latest_blockhash()?;
    if tx.message.recent_blockhash != latest {
        // 拒绝重发；让客户端重做（更安全）
        return Err(BlockhashExpired);
    }

    // 5. 广播
    let sig = rpc.send_transaction_with_config(
        &tx,
        RpcSendTransactionConfig {
            skip_preflight: false,           // preflight 检查
            preflight_commitment: Some(CommitmentLevel::Processed),
            max_retries: Some(0),            // 我们自己控制
            ..Default::default()
        }
    )?;
    Ok(sig)
}
```

### 3.3 RPC 节点冗余
- 维护 RPC 节点池（DB 表 `rpc_endpoints`）
- 健康检查：每 10s `getHealth` + slot lag
- 主节点：`active=true, priority asc`
- 切换策略：连续 3 次失败 → 标记 unhealthy，主切到次优
- 恢复策略：连续 10 次成功 → 重新 active
- 用于读（轮询确认）与写（广播）分别有不同的节点偏好

### 3.4 USDC 脱锚保护
```
depeg-monitor 每 60s 跑：
  价格 = avg(CoinGecko USDC/USD, Chainlink on-chain feed)
  if 价格 < 0.97 || 价格 > 1.03 (持续 5min):
    SET system_flag accepting_new_payments = false
    告警 P1
  if 价格回到 [0.99, 1.01] (持续 10min):
    SET system_flag accepting_new_payments = true (人工 confirm 后)

API 行为：
  if !accepting_new_payments:
    POST /v1/settlements → 503 + reason: "usdc_depeg_protection"
    已 in-flight 的 settlement 继续完成
```

### 3.5 钱包架构
```
Hot Wallet（接收）：
  - 由 KMS 管理的多 key；客户端支付的 USDC 到这里
  - 余额阈值：每日清算到 cold（保留 buffer 1万 USDC）
  - 失活检测：超过 1h 无入账 + 系统 healthy → 告警（可能客户中断）

Warm Wallet（gas）：
  - 仅持 SOL 用于 priority fee
  - 阈值低于 10 SOL → 自动从 cold 补 100 SOL

Cold Wallet（vault）：
  - 多签 m-of-n（如 3-of-5）
  - 离线签名设备
  - 仅每日清算 + 季度审计接触
  - 私钥碎片地理分散（Vault A / B / C）
```

### 3.6 回调可靠性
同 X402 的 webhook 设计；详见 wea/PRD.md §3。

---

## 4. API 详细路由

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | /v1/settlements | mTLS + HMAC | 创建结算（异步执行） |
| GET | /v1/settlements/{id} | mTLS | 查询 |
| GET | /v1/settlements | mTLS | 列表 + filter |
| POST | /v1/settlements/{id}/retry | admin 2FA | 手动重试 |
| POST | /internal/x402/callback-ack | mTLS | （未来）x402 ack 回执（v1 不需要） |
| GET | /v1/system/status | none | 状态页用 |
| GET | /healthz /readyz /metrics | none | 标准 |

---

## 5. 数据库 schema（详见 [db/SCHEMA.sql](db/SCHEMA.sql)）

核心表：
- `settlements` — 主表 + 状态机
- `rpc_endpoints` — RPC 节点池
- `system_flags` — 运维开关
- `price_history` — USDC 价格历史（debug）
- `callbacks` — 出站回调记录
- `wallet_events` — 钱包余额事件（接收 / 清算）

---

## 6. 失败模式

| 失败 | wea 行为 |
|------|---------|
| 主 RPC 失败 | 切次优；连续切失败 → P0 |
| Blockhash 过期 | 失败 settlement；客户端必须用新 blockhash 重签（不在 wea 层重签） |
| Solana 拥堵 | 提高 priority fee（上限）；超时后失败 |
| 链上未确认 30min | 后台 worker 继续轮询；24h 仍未上链 → 标记 failed + 告警 |
| KMS 不可用 | 拒绝 new settlements (P0)；in-flight 失败 |
| Postgres 主库失败 | RDS 自动故障转移；API 503 ~30s |
| 回调失败 5 次 | 状态 `callback_failed`；告警；通过 GET 接口被动同步 |

---

## 7. 性能与吞吐

| 指标 | Phase 1 | Phase 3 |
|------|---------|---------|
| API submit → 202 Accepted | < 200ms p95 | < 100ms |
| Submit → broadcast | < 500ms p95 | < 300ms |
| Submit → confirmed callback | < 3s p95 (Solana confirmed) | < 2s |
| 吞吐 | 100 settlements/min | 1000+/min |

**扩展**：
- API 层无状态，水平扩展
- worker leader 1，扩展通过任务并行（多 worker 抢任务）
- DB 写吞吐：分区 + 适当 sharding（Phase 3 评估）

---

## 8. 安全实现

| 威胁 | 缓解 |
|------|------|
| 钱包私钥泄露 | Ed25519 keypair 以 AWS KMS（ap-northeast-1 CMK）Encrypt 后存库；签名时 Decrypt 到进程内存、立即清零；任何运维不可见明文；IRSA 限定 `kms:Decrypt` 权限 |
| 多签绕过 | Cold wallet 多签设备隔离 + 多人审批流 |
| RPC 节点恶意（返回伪造数据） | 多节点交叉验证 + Slot 一致性检查 |
| Replay attack | 单 nonce + 拒绝重复 tx_hash |
| 中间人攻击 | mTLS（与 X402）+ HMAC |
| 内部账户失误转账 | 所有 admin 操作 2FA + 审计 + cooling period |
| 依赖 supply chain | Cargo.lock 固定；定期 `cargo audit` |

---

## 9. 可观测性

### 9.1 关键 metrics
- `wea_settlements_total{status}` (counter)
- `wea_settlement_duration_seconds{phase}` (histogram: receive / broadcast / confirm / callback)
- `wea_rpc_call_duration_seconds{node,method}` (histogram)
- `wea_rpc_failures_total{node}` (counter)
- `wea_usdc_price_current` (gauge)
- `wea_hot_wallet_balance_usdc` (gauge)
- `wea_callback_attempt_total{status}` (counter)

### 9.2 告警
- P0: KMS 不可用 / 主+备 RPC 同时失败 / 主库 down
- P1: USDC 脱锚已触发 / hot wallet 余额低 / settle 失败率 > 5%
- P2: 单 RPC 节点故障 / callback 失败率 > 1%

---

## 10. CI/CD（详见 [.github/workflows/](.github/workflows/)）

Wea 独立 CI/CD（独立 GitHub repo / AWS 账户）。但与 Netstars 保持一致的标准：
- Rust：cargo fmt + clippy + test + audit + tarpaulin（覆盖率）
- Docker image: musl static build；scratch base；< 20MB
- 部署到 Wea EKS cluster；接口契约对 Netstars 保证

---

## 11. 与 Netstars 的协作约定（架构层面）

| 项 | 约定 |
|----|------|
| 网络 | VPC Peering（D4 默认）；CIDR 不重叠 |
| 鉴权 | mTLS（cert-manager + AWS PCA）+ HMAC 双重 |
| 接口契约 | OpenAPI 3.1 公开存档；变更 30 天前通知 |
| 版本 | API major 至少 12 个月兼容 |
| 监控 | Metrics export 同标准 Prometheus；Netstars 可消费 wea metrics 做端到端 SLO |
| 应急 | P0/P1 共享 PagerDuty 频道 |

---

## 12. 开放问题

| # | 问题 | 默认 |
|---|------|------|
| ARCH-WEA-1 | Rust 还是 Go？ | Rust（与 Solana 生态匹配） |
| ARCH-WEA-2 | KMS 类型？ | AWS KMS ap-northeast-1（Customer Managed Key，用于加密 Ed25519 keypair；不用 CloudHSM，不走 Netstars 内部 KMS） |
| ARCH-WEA-3 | 是否做"代签"模式给小客户？ | 否（保持纯执行边界） |
| ARCH-WEA-4 | Multi-region active-active？ | 否；prod ap-northeast-1 主；ap-northeast-3 DR 备 |
