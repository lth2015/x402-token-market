# =====================================================================
# Wea · Rust + axum  ·  multi-stage build → tiny runtime image
# =====================================================================
# rust:1.85 (Feb 2025) is the floor — sqlx 0.7 + reqwest 0.12 transitively
# pull in idna_adapter 1.2.x which uses edition 2024 (stabilized in 1.85).
FROM rust:1-slim AS builder

WORKDIR /app

# Cache deps first via a stub main.
COPY Cargo.toml ./
RUN mkdir src && echo "fn main(){}" > src/main.rs && \
    cargo build --release --bin wea-api && \
    rm -rf src \
           target/release/wea-api target/release/wea-api.d \
           target/release/deps/wea_api-* target/release/deps/wea-* \
           target/release/.fingerprint/wea-*
# Wiping the fingerprints above is critical: Docker COPY preserves host
# mtimes, which can be OLDER than the stub build, so cargo would otherwise
# decide "binary is newer than sources" and skip the real rebuild — leaving
# us with the empty stub. Touching src/ below double-belts it.

# Real source
COPY src/ ./src/
RUN find src -type f -exec touch {} + && \
    cargo build --release --bin wea-api


# ── Runtime ───────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates wget \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 10001 app && useradd -u 10001 -g app -d /app -s /bin/false app

WORKDIR /app
COPY --from=builder /app/target/release/wea-api /app/wea-api

USER app
EXPOSE 8080
CMD ["/app/wea-api"]
