# =====================================================================
# Token Console · Next.js 15 (standalone output)  ·  multi-stage build
# =====================================================================
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
# Lockfile may not exist on first build; fall back to install.
# --legacy-peer-deps: next@15.0.3 peer-pins react to ^18 || 19.0.0-rc, but
# we run on react@19 GA. The runtime is compatible; only npm's strict peer
# check disagrees. Drop this flag once we bump next to >=15.1.
RUN npm install --no-audit --no-fund --omit=optional --legacy-peer-deps

# ── Build ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000

# Non-root
RUN addgroup -S app -g 10001 && adduser -S app -u 10001 -G app

# Copy standalone output (Next bundles only what's needed).
# No public/ COPY: this app has no static assets yet, and Dockerfile COPY
# doesn't support shell `|| true`. Add an unconditional COPY here once
# console/public/ exists.
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static

USER app
EXPOSE 3000
CMD ["node", "server.js"]
