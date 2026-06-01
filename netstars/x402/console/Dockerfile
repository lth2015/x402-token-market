# NetStars X402 Console — Next.js 15 standalone build.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund --omit=optional --legacy-peer-deps

FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3002 HOSTNAME=0.0.0.0
RUN addgroup -S app -g 10001 && adduser -S app -u 10001 -G app
RUN apk add --no-cache wget
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3002
HEALTHCHECK --interval=10s --timeout=3s --retries=10 \
  CMD wget -qO- http://localhost:3002/ || exit 1
CMD ["node", "server.js"]
