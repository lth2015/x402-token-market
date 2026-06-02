// RPC endpoint pool — reads active endpoints from `rpc_endpoints` table and
// provides ordered failover for both broadcast and query operations.
//
// Production note (Task 4):
//   - Endpoints are loaded from DB ordered by `priority ASC` (lower = preferred).
//   - `pick()` returns the first healthy URL; `pick_all()` returns all ordered so
//     callers can try each in sequence until one succeeds.
//   - Health status in the DB is updated by a future health-check loop (DESIGN §6).
//     For now we optimistically treat all `active=1` rows as usable.
//   - Placeholder / unroutable URLs (containing "REPLACE" or ending with ".internal")
//     are filtered out at load time so local-dev seed rows never block traffic.
//     When all table rows are placeholder-only the pool falls back to the
//     env-configured URL (SOLANA_RPC_URL_DEVNET).
//
// TODO (production): add periodic health-check loop that PINGs each node and
//   updates `health_status`, `consecutive_failures`, `avg_latency_ms` per DESIGN §6.

use anyhow::Result;
use sqlx::MySqlPool;
use std::time::Duration;

/// Ordered list of RPC URLs loaded from DB. Refreshed periodically.
#[derive(Clone, Debug)]
pub struct RpcPool {
    db:       MySqlPool,
    fallback: String,   // env-configured URL used if table is empty or DB unavailable
}

/// Returns true if the URL is a known placeholder / unroutable seed row that
/// should never be selected as an actual RPC target.
///
/// Criteria (conservative — keep false-positive rate near zero for production):
///   - URL contains the literal string "REPLACE" (migration seed placeholder convention).
///   - Host ends with ".internal" and we are not running inside a cluster where
///     that name resolves (we cannot test DNS here so we filter it unconditionally;
///     production operators that run self-hosted nodes inside a k8s cluster should
///     use a real hostname like `solana-rpc.svc.cluster.local` or an IP).
fn is_placeholder_url(url: &str) -> bool {
    if url.contains("REPLACE") {
        return true;
    }
    // Parse the host portion to test for ".internal" suffix.
    // We accept "http://host", "https://host", etc.
    if let Some(host_part) = url
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .split('/')
        .next()
    {
        // Strip optional port.
        let host = host_part.split(':').next().unwrap_or(host_part);
        if host.ends_with(".internal") {
            return true;
        }
    }
    false
}

impl RpcPool {
    pub fn new(db: MySqlPool, fallback: String) -> Self {
        Self { db, fallback }
    }

    /// Return the highest-priority active endpoint URL.
    pub async fn pick(&self) -> Option<String> {
        self.load_ordered().await.into_iter().next()
    }

    /// Return all active endpoint URLs ordered by priority (best first).
    /// Used by callers that want to try each in sequence until one succeeds.
    pub async fn pick_all(&self) -> Vec<String> {
        self.load_ordered().await
    }

    /// Load ordered URLs from DB, skipping placeholder / unroutable rows.
    ///
    /// Priority:
    ///   1. Active + healthy (health_status != 'unhealthy'), placeholder-filtered.
    ///   2. All active (including unhealthy), placeholder-filtered.
    ///   3. Absolute fallback: env-configured URL (SOLANA_RPC_URL_DEVNET).
    async fn load_ordered(&self) -> Vec<String> {
        // 1. Prefer active + not-unhealthy.
        if let Ok(v) = sqlx::query_scalar::<_, String>(
            r#"SELECT url FROM rpc_endpoints
               WHERE active = 1
                 AND health_status != 'unhealthy'
               ORDER BY priority ASC"#,
        )
        .fetch_all(&self.db)
        .await
        {
            let usable: Vec<String> = v.into_iter().filter(|u| !is_placeholder_url(u)).collect();
            if !usable.is_empty() { return usable; }
        }

        // 2. All active (including unhealthy), still skip placeholders.
        if let Ok(v) = sqlx::query_scalar::<_, String>(
            r#"SELECT url FROM rpc_endpoints
               WHERE active = 1
               ORDER BY priority ASC"#,
        )
        .fetch_all(&self.db)
        .await
        {
            let usable: Vec<String> = v.into_iter().filter(|u| !is_placeholder_url(u)).collect();
            if !usable.is_empty() { return usable; }
        }

        // 3. Absolute fallback: env-configured URL.
        tracing::debug!(
            fallback = %self.fallback,
            "rpc_pool: no usable DB endpoints (all placeholder/unroutable); using env fallback"
        );
        vec![self.fallback.clone()]
    }
}

// ── Unit tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::is_placeholder_url;

    #[test]
    fn placeholder_detection() {
        // Migration seed placeholders — must be filtered.
        assert!(is_placeholder_url("https://REPLACE.quiknode.pro"));
        assert!(is_placeholder_url("https://REPLACE.helius.dev"));
        assert!(is_placeholder_url("http://solana-rpc.internal"));
        assert!(is_placeholder_url("https://solana-rpc.internal:8899"));

        // Real production URLs — must not be filtered.
        assert!(!is_placeholder_url("https://api.devnet.solana.com"));
        assert!(!is_placeholder_url("https://mainnet.helius-rpc.com/?api-key=abc123"));
        assert!(!is_placeholder_url("https://nd-abc.quiknode.pro/xyz/"));
        assert!(!is_placeholder_url("http://192.168.1.5:8899"));
        // k8s FQDN — operators should use this form, not .internal shorthand.
        assert!(!is_placeholder_url("http://solana-rpc.svc.cluster.local:8899"));
    }
}

/// Attempt `f` against each RPC URL in order; return first success.
/// `f` receives the URL and returns Result<T>.
///
/// TODO(phase2): used by the real broadcast/confirm path in DESIGN §3-§4.
/// The facilitator settle endpoint will use this instead of a single rpc_url.
#[allow(dead_code)]
pub async fn with_failover<T, F, Fut>(
    pool: &RpcPool,
    f: F,
) -> Result<T>
where
    F: Fn(String) -> Fut,
    Fut: std::future::Future<Output = Result<T>>,
{
    let urls = pool.pick_all().await;
    let mut last_err = anyhow::anyhow!("rpc_pool: no endpoints");
    for url in urls {
        match f(url).await {
            Ok(v)  => return Ok(v),
            Err(e) => {
                tracing::warn!(error=?e, "rpc_pool.failover: endpoint failed, trying next");
                last_err = e;
                // Brief back-off before trying the next node.
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
        }
    }
    Err(last_err)
}
