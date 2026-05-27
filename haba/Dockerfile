# =====================================================================
# HABA AI Commerce · Next.js 15 (standalone output) · multi-stage
# Mirrors netstars/token/console/Dockerfile but lives independently —
# HABA is a separate deployable per haba-technical-plan §0.
# =====================================================================
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
# --legacy-peer-deps: next@15.0.3 peer-pins react to ^18 || 19.0.0-rc, but
# we run on react@19 GA. The runtime is compatible; only npm's strict peer
# check disagrees. Same workaround as Console's Dockerfile.
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
# HOSTNAME=0.0.0.0: Next.js standalone reads $HOSTNAME and binds *only* to it.
# In docker the default is the container id, which makes the server reachable
# via the bridge IP but not 127.0.0.1 — breaking any in-container healthcheck.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
# wget needed for compose healthcheck
RUN apk add --no-cache wget && \
    addgroup -S app -g 10001 && adduser -S app -u 10001 -G app

# Standalone Next output — server.js + .next/standalone deps only.
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static

USER app
EXPOSE 3001
CMD ["node", "server.js"]
