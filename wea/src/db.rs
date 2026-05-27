// MySQL pool init. Wraps sqlx so the rest of the codebase doesn't import it
// in five places. Connection params come from $DATABASE_URL — same convention
// as token-api / x402-api so docker-compose can wire all three uniformly.

use anyhow::{Context, Result};
use sqlx::mysql::{MySqlPool, MySqlPoolOptions};
use std::time::Duration;

pub async fn connect(url: &str) -> Result<MySqlPool> {
    // Note: docker-compose passes `mysql://wea_app:wea_app_dev@mysql:3306/wea_qa`.
    // Defaults below mirror what Aurora gives us in QA: 10 conns is plenty for
    // a single worker loop + handful of API calls.
    let pool = MySqlPoolOptions::new()
        .max_connections(10)
        .min_connections(1)
        .acquire_timeout(Duration::from_secs(5))
        .idle_timeout(Some(Duration::from_secs(300)))
        .connect(url)
        .await
        .with_context(|| format!("connect to {url}"))?;
    Ok(pool)
}
