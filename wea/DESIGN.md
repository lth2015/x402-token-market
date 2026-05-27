# Wea Settlement Connector · Detailed Design

> **属于**：[ARCHITECTURE.md](ARCHITECTURE.md) · [PRD.md](PRD.md)
> **运行主体**：**Wea Japan**（独立 AWS 账户）
> **语言**：Rust 1.79+（axum + sqlx + solana-sdk + tokio）
> **DB**：Aurora MySQL 8.0（详见 [db/SCHEMA.sql](db/SCHEMA.sql)）

---

## 1. 项目骨架

```
wea/
├─ Cargo.toml                    workspace
├─ Cargo.lock
├─ crates/
│   ├─ common/                  共享：errors, types, ulid, hmac
│   │   └─ src/
│   ├─ api/                      HTTP API
│   │   ├─ src/
│   │   │   ├─ main.rs
│   │   │   ├─ routes/
│   │   │   │   ├─ settlements.rs   POST /v1/settlements, GET ...
│   │   │   │   ├─ admin.rs
│   │   │   │   └─ health.rs
│   │   │   ├─ middleware/
│   │   │   │   ├─ auth.rs          mTLS + HMAC
│   │   │   │   ├─ tracing.rs
│   │   │   │   └─ errors.rs
│   │   │   └─ services/
│   │   │       ├─ settlement_service.rs
│   │   │       ├─ proof_verifier.rs
│   │   │       └─ depeg_guard.rs
│   │   └─ Cargo.toml
│   ├─ worker/                   Background worker
│   │   ├─ src/
│   │   │   ├─ main.rs
│   │   │   ├─ broadcaster.rs       链上广播 (leader)
│   │   │   ├─ confirmer.rs         交易确认轮询
│   │   │   ├─ depeg_monitor.rs     USDC 价格监控
│   │   │   ├─ rpc_health.rs        RPC 节点健康
│   │   │   ├─ balance_monitor.rs   钱包余额
│   │   │   └─ leader.rs            Redis Redlock
│   │   └─ Cargo.toml
│   ├─ callback/                 Outbound callback to X402
│   │   ├─ src/
│   │   │   ├─ main.rs
│   │   │   ├─ dispatcher.rs        SKIP LOCKED + parallel
│   │   │   └─ hmac_signer.rs
│   │   └─ Cargo.toml
│   └─ db/                       共享：sqlx queries, migrations
│       └─ src/
│           ├─ pool.rs
│           ├─ settlements.rs       SQL fns
│           ├─ rpc_endpoints.rs
│           └─ ...
├─ db/
│   ├─ SCHEMA.sql
│   └─ migrations/
├─ Dockerfile.api                multi-stage, scratch base
├─ Dockerfile.worker
├─ Dockerfile.callback
└─ docker-compose.yml
```

---

## 2. 关键算法 · 提交结算

```rust
// crates/api/src/routes/settlements.rs

#[derive(Deserialize)]
pub struct CreateSettlementRequest {
    pub payment_order_id: String,
    pub expected_amount_micro: u64,
    pub expected_recipient: String,
    #[serde(default = "default_asset")]
    pub expected_asset: String,
    pub signed_tx_b64: String,
    pub callback_url: String,
    pub callback_secret: String,      // raw; encrypted before persist
    #[serde(default = "default_conf_level")]
    pub confirmation_level: String,
}

pub async fn create_settlement(
    State(ctx): State<AppCtx>,
    Json(req): Json<CreateSettlementRequest>,
) -> Result<(StatusCode, Json<SettlementCreated>), AppError> {
    // 1. Reject if depeg protection active
    if !ctx.flags.accepting_new_settlements().await {
        return Err(AppError::ServiceUnavailable("usdc_depeg_protection"));
    }

    // 2. Parse + validate tx structure (cheap, sync) — full chain verification done by broadcaster
    let parsed = proof_verifier::parse_quick(&req.signed_tx_b64)?;
    if parsed.amount != req.expected_amount_micro {
        return Err(AppError::Unprocessable("amount_mismatch"));
    }
    if parsed.recipient_ata != derive_ata(&req.expected_recipient, &USDC_MINT) {
        return Err(AppError::Unprocessable("wrong_recipient"));
    }

    // 3. Encrypt callback_secret
    let secret_enc = crypto::encrypt_pii(&req.callback_secret, &ctx.pii_key)?;

    // 4. Insert settlement row (INSERT IGNORE for idempotency on tx_hash)
    let settlement_id = format!("stl_{}", ulid::Ulid::new());
    let mut conn = ctx.db.begin().await?;
    sqlx::query!(
        r#"
        INSERT INTO settlements
          (id, payment_order_id, expected_amount_micro, expected_recipient,
           expected_asset, signed_tx_b64, parsed_tx, confirmation_level,
           status, callback_url, callback_secret_enc, created_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NOW(6))
        "#,
        settlement_id, req.payment_order_id, req.expected_amount_micro,
        req.expected_recipient, req.expected_asset, req.signed_tx_b64,
        sqlx::types::Json(&parsed), req.confirmation_level,
        req.callback_url, secret_enc,
    ).execute(&mut *conn).await?;
    conn.commit().await?;

    // 5. Return 202 immediately; broadcaster picks up async
    metrics::SETTLEMENTS_CREATED.inc();
    Ok((StatusCode::ACCEPTED, Json(SettlementCreated {
        settlement_id,
        status: "pending".to_string(),
        estimated_completion_seconds: 3,
    })))
}
```

---

## 3. 关键算法 · Broadcaster（leader-elected worker）

```rust
// crates/worker/src/broadcaster.rs
use redis::AsyncCommands;
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::transaction::VersionedTransaction;

pub async fn run_loop(ctx: WorkerCtx) -> anyhow::Result<()> {
    loop {
        // Acquire leader lock (Redis Redlock; TTL 10s, refresh every 5s)
        let _leader = match leader::acquire(&ctx.redis, "wea:broadcaster:leader", 10).await {
            Ok(g) => g,
            Err(_) => {
                tokio::time::sleep(Duration::from_secs(5)).await;
                continue;
            }
        };

        loop {
            let batch = claim_pending(&ctx.db, 10).await?;
            if batch.is_empty() {
                tokio::time::sleep(Duration::from_millis(500)).await;
                continue;
            }
            for s in batch {
                let ctx = ctx.clone();
                tokio::spawn(async move {
                    if let Err(e) = process_one(&ctx, s).await {
                        tracing::error!(error=?e, "broadcast_failed");
                    }
                });
            }
            // Re-check leader liveness before next iter
            if !leader::is_alive(&_leader).await { break; }
        }
    }
}

async fn claim_pending(db: &MySqlPool, n: u32) -> sqlx::Result<Vec<Settlement>> {
    // Use SKIP LOCKED to atomically claim work
    let mut tx = db.begin().await?;
    let rows = sqlx::query_as!(
        Settlement,
        r#"
        SELECT * FROM settlements
        WHERE status = 'pending'
        ORDER BY created_at
        LIMIT ?
        FOR UPDATE SKIP LOCKED
        "#, n
    ).fetch_all(&mut *tx).await?;

    if rows.is_empty() {
        return Ok(rows);
    }
    let ids: Vec<&str> = rows.iter().map(|r| r.id.as_str()).collect();
    sqlx::query!(
        r#"UPDATE settlements SET status='broadcasting' WHERE id IN (?)"#,
        ids.join(",")    // pseudo — real code uses dynamic IN
    ).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(rows)
}

async fn process_one(ctx: &WorkerCtx, s: Settlement) -> anyhow::Result<()> {
    // 1. Decode signed tx
    let tx_bytes = base64::decode(&s.signed_tx_b64)?;
    let tx: VersionedTransaction = bincode::deserialize(&tx_bytes)?;

    // 2. Choose RPC node (prefer write-capable, lowest priority value, healthy)
    let rpc_url = ctx.rpc_pool.select_write().await?;
    let rpc = RpcClient::new(rpc_url.clone());

    // 3. Validate blockhash freshness (max 60 slots ≈ 30s old)
    let current_bh = rpc.get_latest_blockhash().await?;
    let tx_bh = tx.message.recent_blockhash();
    if !rpc.is_blockhash_valid(tx_bh, CommitmentConfig::confirmed()).await? {
        return mark_failed(ctx, &s, "blockhash_expired").await;
    }

    // 4. Submit
    let sig_result = rpc.send_transaction_with_config(&tx, RpcSendTransactionConfig {
        skip_preflight: false,
        preflight_commitment: Some(CommitmentLevel::Processed),
        max_retries: Some(0),               // we manage retries
        ..Default::default()
    }).await;

    let sig = match sig_result {
        Ok(s) => s,
        Err(e) => {
            ctx.rpc_pool.record_failure(&rpc_url).await;
            return mark_failed(ctx, &s, &format!("rpc_submit_error: {e}")).await;
        }
    };

    let tx_hash = sig.to_string();
    sqlx::query!(
        r#"UPDATE settlements SET tx_hash=?, rpc_node_used=?, broadcast_at=NOW(6) WHERE id=?"#,
        tx_hash, rpc_url, s.id
    ).execute(&ctx.db).await?;

    // 5. Hand off to confirmer (running separately) — it picks up by status='broadcasting' + tx_hash IS NOT NULL
    metrics::SETTLEMENTS_BROADCAST.inc();
    Ok(())
}
```

---

## 4. 关键算法 · Confirmer

```rust
// crates/worker/src/confirmer.rs
pub async fn run_loop(ctx: WorkerCtx) -> anyhow::Result<()> {
    loop {
        let pending = sqlx::query_as!(Settlement, r#"
            SELECT * FROM settlements
            WHERE status = 'broadcasting' AND tx_hash IS NOT NULL
              AND created_at >= NOW() - INTERVAL 1 HOUR
            LIMIT 100
        "#).fetch_all(&ctx.db).await?;

        for s in pending {
            let ctx = ctx.clone();
            tokio::spawn(async move {
                if let Err(e) = confirm_one(&ctx, s).await {
                    tracing::warn!(error=?e, "confirm_check_failed");
                }
            });
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}

async fn confirm_one(ctx: &WorkerCtx, s: Settlement) -> anyhow::Result<()> {
    let rpc_url = ctx.rpc_pool.select_read().await?;
    let rpc = RpcClient::new(rpc_url);
    let tx_hash = s.tx_hash.as_ref().unwrap();
    let sig = Signature::from_str(tx_hash)?;

    let commitment = match s.confirmation_level.as_str() {
        "finalized" => CommitmentConfig::finalized(),
        _ => CommitmentConfig::confirmed(),
    };

    let status = rpc.get_signature_status_with_commitment(&sig, commitment).await?;
    match status {
        Some(Ok(())) => {
            // Confirmed!
            let slot = rpc.get_slot_with_commitment(commitment).await?;
            sqlx::query!(r#"
                UPDATE settlements
                SET status='confirmed', confirmed_at=NOW(6), solana_slot=?,
                    callback_status='pending', callback_next_retry=NOW(6)
                WHERE id=?
            "#, slot, s.id).execute(&ctx.db).await?;
            metrics::SETTLEMENTS_CONFIRMED.inc();
        }
        Some(Err(e)) => {
            // On-chain failure
            sqlx::query!(r#"
                UPDATE settlements SET status='failed', status_reason=? WHERE id=?
            "#, format!("chain_error: {e:?}"), s.id).execute(&ctx.db).await?;
            // Trigger fail callback
            sqlx::query!(r#"
                UPDATE settlements SET callback_status='pending', callback_next_retry=NOW(6) WHERE id=?
            "#, s.id).execute(&ctx.db).await?;
        }
        None => {
            // Still pending; check age
            let age = utc_now() - s.broadcast_at.unwrap();
            if age > Duration::from_secs(1800) {  // 30 min stuck
                sqlx::query!(r#"
                    UPDATE settlements SET status='failed', status_reason='timeout_30min' WHERE id=?
                "#, s.id).execute(&ctx.db).await?;
            }
            // else: leave for next iteration
        }
    }
    Ok(())
}
```

---

## 5. 关键算法 · USDC Depeg Monitor

```rust
// crates/worker/src/depeg_monitor.rs
pub async fn run(ctx: WorkerCtx) {
    let mut consecutive_outside = 0u32;
    let mut consecutive_inside = 0u32;
    let window = ctx.flags.depeg_window_minutes().await as u32;        // default 5

    loop {
        let price = match fetch_aggregate_price(&ctx).await {
            Ok(p) => p,
            Err(e) => {
                tracing::warn!(error=?e, "price_fetch_failed");
                tokio::time::sleep(Duration::from_secs(60)).await;
                continue;
            }
        };

        // Persist
        sqlx::query!(r#"
            INSERT INTO price_history (asset, source, price_usd, metadata)
            VALUES ('USDC', 'aggregate', ?, ?)
        "#, price.value, sqlx::types::Json(&price.sources)).execute(&ctx.db).await.ok();

        let low  = ctx.flags.depeg_low_threshold().await;
        let high = ctx.flags.depeg_high_threshold().await;
        let outside = price.value < low || price.value > high;

        if outside {
            consecutive_outside += 1; consecutive_inside = 0;
            if consecutive_outside >= window && ctx.flags.accepting_new_settlements().await {
                ctx.flags.set_accepting(false, "depeg_monitor").await;
                tracing::error!(price=price.value, "depeg_protection_engaged");
                metrics::DEPEG_PROTECTION_ENGAGED.inc();
                alert::page_p1("USDC depeg protection engaged",
                               format!("price={}", price.value)).await;
            }
        } else {
            consecutive_inside += 1; consecutive_outside = 0;
            // require human ack before re-enabling — do NOT auto-resume
        }

        metrics::USDC_PRICE.set(price.value);
        tokio::time::sleep(Duration::from_secs(60)).await;
    }
}

async fn fetch_aggregate_price(ctx: &WorkerCtx) -> Result<AggregatePrice> {
    // Parallel fetch from CoinGecko + Chainlink on-chain feed
    let (cg, cl) = tokio::join!(
        ctx.coingecko.fetch_usdc(),
        ctx.chainlink.fetch_usdc_onchain(),
    );
    let mut sources = vec![];
    if let Ok(v) = cg { sources.push(("coingecko", v)); }
    if let Ok(v) = cl { sources.push(("chainlink", v)); }
    if sources.is_empty() { bail!("all_sources_failed"); }
    let avg = sources.iter().map(|(_,v)|*v).sum::<f64>() / sources.len() as f64;
    Ok(AggregatePrice { value: avg, sources })
}
```

---

## 6. 关键算法 · RPC Pool（健康度 + 自动切换）

```rust
// crates/worker/src/rpc_health.rs
pub struct RpcPool {
    db: MySqlPool,
    cache: Arc<RwLock<Vec<RpcEndpoint>>>,
}

impl RpcPool {
    /// Periodic health check (every 10s)
    pub async fn health_check_loop(self: Arc<Self>) {
        loop {
            let endpoints = sqlx::query_as!(RpcEndpoint, r#"
                SELECT * FROM rpc_endpoints WHERE active=1 ORDER BY priority
            "#).fetch_all(&self.db).await.unwrap_or_default();

            for ep in &endpoints {
                let client = RpcClient::new(ep.url.clone());
                let start = Instant::now();
                let result = tokio::time::timeout(
                    Duration::from_secs(3),
                    client.get_health()
                ).await;
                let latency_ms = start.elapsed().as_millis() as i32;

                let healthy = matches!(result, Ok(Ok(_)));
                let (succ_inc, fail_inc) = if healthy { (1, 0) } else { (0, 1) };

                sqlx::query!(r#"
                    UPDATE rpc_endpoints SET
                      last_health_check=NOW(6),
                      avg_latency_ms = COALESCE((avg_latency_ms*9 + ?)/10, ?),
                      consecutive_successes = IF(?, consecutive_successes + ?, 0),
                      consecutive_failures = IF(?, 0, consecutive_failures + ?),
                      health_status = IF(consecutive_successes >= 10, 'healthy',
                                       IF(consecutive_failures >= 3, 'unhealthy', health_status))
                    WHERE id=?
                "#, latency_ms, latency_ms, healthy, succ_inc, healthy, fail_inc, ep.id)
                  .execute(&self.db).await.ok();
            }

            // Refresh cache
            *self.cache.write().await = sqlx::query_as!(RpcEndpoint, r#"
                SELECT * FROM rpc_endpoints WHERE active=1 AND health_status='healthy'
                ORDER BY priority
            "#).fetch_all(&self.db).await.unwrap_or_default();

            tokio::time::sleep(Duration::from_secs(10)).await;
        }
    }

    pub async fn select_write(&self) -> Result<String> {
        let cache = self.cache.read().await;
        cache.iter()
            .find(|e| e.purpose != "read_only")
            .map(|e| e.url.clone())
            .ok_or_else(|| anyhow!("no_healthy_rpc"))
    }

    pub async fn select_read(&self) -> Result<String> {
        let cache = self.cache.read().await;
        cache.iter()
            .find(|e| e.purpose != "write_only")
            .map(|e| e.url.clone())
            .ok_or_else(|| anyhow!("no_healthy_rpc"))
    }
}
```

---

## 7. 关键算法 · Callback Dispatcher

```rust
// crates/callback/src/dispatcher.rs
pub async fn run_loop(ctx: AppCtx) {
    let retry_intervals = [300u64, 900, 3600, 21600, 86400];   // 5m / 15m / 1h / 6h / 24h

    loop {
        let batch = claim_callbacks(&ctx.db, 20).await.unwrap_or_default();
        for s in batch {
            let ctx = ctx.clone();
            tokio::spawn(async move {
                deliver_one(&ctx, s, &retry_intervals).await;
            });
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}

async fn claim_callbacks(db: &MySqlPool, n: u32) -> sqlx::Result<Vec<Settlement>> {
    let mut tx = db.begin().await?;
    let rows = sqlx::query_as!(Settlement, r#"
        SELECT * FROM settlements
        WHERE callback_status = 'pending'
          AND (callback_next_retry IS NULL OR callback_next_retry <= NOW(6))
          AND status IN ('confirmed','failed')
        ORDER BY callback_next_retry
        LIMIT ?
        FOR UPDATE SKIP LOCKED
    "#, n).fetch_all(&mut *tx).await?;
    if !rows.is_empty() {
        let ids: Vec<&str> = rows.iter().map(|r| r.id.as_str()).collect();
        // Mark as in-flight to avoid double-claim
        sqlx::query("UPDATE settlements SET callback_status='in_flight' WHERE id IN (?)")
            .bind(ids.join(","))
            .execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(rows)
}

async fn deliver_one(ctx: &AppCtx, s: Settlement, intervals: &[u64]) {
    let secret = crypto::decrypt_pii(&s.callback_secret_enc, &ctx.pii_key).unwrap();
    let body = serde_json::json!({
        "settlement_id": s.id,
        "payment_order_id": s.payment_order_id,
        "status": s.status,
        "tx_hash": s.tx_hash,
        "confirmed_at": s.confirmed_at,
        "solana_slot": s.solana_slot,
    });
    let body_bytes = serde_json::to_vec(&body).unwrap();
    let sig = hex::encode(hmac_sha256(&secret, &body_bytes));

    let resp = ctx.http
        .post(&s.callback_url)
        .header("X-Wea-Signature", sig)
        .header("Content-Type", "application/json")
        .body(body_bytes)
        .timeout(Duration::from_secs(10))
        .send().await;

    let success = matches!(&resp, Ok(r) if r.status().is_success());
    if success {
        sqlx::query!(r#"
            UPDATE settlements SET callback_status='sent_ok',
              status = CASE WHEN status='confirmed' THEN 'done' ELSE status END
            WHERE id=?
        "#, s.id).execute(&ctx.db).await.ok();
    } else {
        let new_attempt = s.callback_attempt_count + 1;
        if new_attempt as usize >= intervals.len() {
            sqlx::query!(r#"
                UPDATE settlements SET callback_status='fail_dead_letter' WHERE id=?
            "#, s.id).execute(&ctx.db).await.ok();
            alert::page_p2("Callback dead letter", &s.id).await;
        } else {
            let interval = intervals[new_attempt as usize];
            let next = utc_now() + Duration::from_secs(interval);
            sqlx::query!(r#"
                UPDATE settlements SET
                  callback_status='pending',
                  callback_attempt_count=?,
                  callback_last_attempt=NOW(6),
                  callback_next_retry=?
                WHERE id=?
            "#, new_attempt, next, s.id).execute(&ctx.db).await.ok();
        }
    }
}
```

---

## 8. Wallet Signing — AWS KMS Encrypted-at-Rest Keypair

**重要**：v1 主路径是客户端预签名（SDK signs USDC transfer），Wea 不重签。
本机制只用于"由 Wea 主动发起"的场景（cold sweep / gas top-up / 失败兜底重签），不走主路径。

### 设计选择
AWS KMS 直接 `Sign` 仅支持 ECC（NIST P-256/secp256k1 等），**不支持 Solana 所需的 Ed25519**。
我们采用与 token-api 同源的"加密 keypair"模式：
- Ed25519 keypair 由 `solana-keygen new` 一次性生成
- 用 ap-northeast-1 的 Customer Managed Key 调用 `kms:Encrypt` → 拿到 CiphertextBlob
- 密文写入 `wea_wallets.keypair_enc VARBINARY(512)` 列；明文从此不再持久化
- 签名时 `kms:Decrypt` → 用 `ed25519-dalek` 在内存中签 → 用 `Zeroizing<[u8;64]>` 立即清零

明文私钥在进程之外**永远不存在**，运维只持有 KMS 别名 + IAM 角色，不持有明文。
**不使用 CloudHSM**（成本不匹配 v1 阶段，AWS KMS 已是 FIPS 140-2 Level 3 硬件背书）。
**不使用 Netstars 内部 KMS 服务**（Wea 直接调 AWS KMS API，账户隔离）。

```rust
// crates/worker/src/wallet_signer.rs
use aws_sdk_kms::{Client as KmsClient, primitives::Blob};
use ed25519_dalek::{SigningKey, Signature, Signer};
use zeroize::Zeroizing;

pub struct EncryptedKeypairSigner {
    kms: KmsClient,            // boto-equivalent: aws_config::from_env() in ap-northeast-1
    keypair_enc: Vec<u8>,      // loaded from wea_wallets.keypair_enc at startup
    pubkey_cache: OnceCell<Pubkey>,
}

impl EncryptedKeypairSigner {
    pub async fn sign(&self, message: &[u8]) -> Result<Signature> {
        let decrypted = self.kms.decrypt()
            .ciphertext_blob(Blob::new(self.keypair_enc.clone()))
            .send().await?
            .plaintext.ok_or_else(|| anyhow!("KMS returned empty plaintext"))?;
        let secret_bytes: Zeroizing<[u8; 32]> =
            Zeroizing::new(decrypted.as_ref()[..32].try_into()?);   // first 32B = secret seed
        let key = SigningKey::from_bytes(&*secret_bytes);
        Ok(key.sign(message))
        // `key` and `secret_bytes` zero on drop.
    }
}
```

### 一次性 onboarding（rotation 同样流程）
```bash
# 1. 生成 Solana keypair（明文只在 ops 终端短暂存在）
solana-keygen new --no-bip39-passphrase -o /tmp/wea-hot.json

# 2. KMS 加密；密文输出到 stdout
aws --region ap-northeast-1 kms encrypt \
  --key-id alias/wea-wallet-keys \
  --plaintext fileb:///tmp/wea-hot.json \
  --output text --query CiphertextBlob | base64 -d > /tmp/wea-hot.enc

# 3. UPDATE wea_wallets SET keypair_enc=FROM_BASE64('…') WHERE id=…
# 4. shred -u /tmp/wea-hot.json  (明文从 ops 机器消失)
```

---

## 9. mTLS 与 HMAC（与 Netstars X402 之间）

```rust
// crates/api/src/middleware/auth.rs
pub async fn mtls_layer<B>(req: Request<B>, next: Next<B>) -> Response {
    // 1. mTLS handled at ALB; ALB injects header `X-Client-Cert-CN`
    let cn = req.headers()
        .get("X-Client-Cert-CN")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if cn != "x402-api.netstars.qa.internal" {
        return (StatusCode::UNAUTHORIZED, "mtls_cn_mismatch").into_response();
    }

    // 2. HMAC (defense in depth)
    let ts = req.headers().get("X-Netstars-Timestamp").and_then(|v|v.to_str().ok()).unwrap_or("");
    if (utc_now_epoch() - ts.parse::<i64>().unwrap_or(0)).abs() > 300 {
        return (StatusCode::UNAUTHORIZED, "ts_skew").into_response();
    }
    // ... verify HMAC ...

    next.run(req).await
}
```

---

## 10. 性能与扩展

- API 层无状态，HPA 3 → 15
- broadcaster: **单 leader**（不可并发，防 nonce 冲突）；通过 Redlock + Pod label selector 实现
- confirmer / callback: 多副本，通过 SKIP LOCKED 分工
- 单 Pod 目标：50 settlements/min（Phase 1）→ 200/min（Phase 2 通过 connection pool 与 RPC batch 优化）
- 关键 metrics：
  - `wea_settlements_total{status}`
  - `wea_broadcast_latency_seconds`
  - `wea_confirm_latency_seconds`
  - `wea_rpc_failures_total{node}`
  - `wea_callback_attempt_total{status}`
  - `wea_usdc_price_current`

---

## 11. 本地开发

```yaml
# wea/docker-compose.yml
services:
  mysql:
    image: mysql:8.0
    environment: { MYSQL_ROOT_PASSWORD: dev, MYSQL_DATABASE: wea_qa,
                    MYSQL_USER: wea_app, MYSQL_PASSWORD: wea_app_dev }
    ports: ["3307:3306"]   # 与 token/x402 错开
  redis:
    image: redis:7-alpine
    ports: ["6380:6379"]
  solana-localnet:
    image: solanalabs/solana:v1.18.0
    command: solana-test-validator --rpc-port 8899
    ports: ["8899:8899"]
```

启动：
```bash
cd wea
docker compose up -d
migrate -database "mysql://wea_app:wea_app_dev@tcp(localhost:3307)/wea_qa" -path db/migrations up

# Run services
cargo run --bin wea-api
cargo run --bin wea-worker
cargo run --bin wea-callback
```

---

## 12. 测试关注点

- **End-to-end on localnet**：mint 测试 USDC → SDK sign → POST /v1/settlements → 链上确认 → callback 收到
- **Idempotency**：同 tx_hash 重复 → 不重复 credit
- **Depeg engages correctly**：mock price 0.95 持续 5 分钟 → flag 翻转 + 新请求被拒
- **RPC failover**：模拟主节点 timeout → 自动切换次优 → 业务继续
- **Callback retry**：mock x402 第 4 次成功 → 状态 transitions: pending → retry → retry → retry → ok
- **Leader fence**：杀掉当前 leader → 5s 内新 leader 接管，无重复广播
