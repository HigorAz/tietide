# syntax=docker/dockerfile:1.7
# ---- Builder stage ---------------------------------------------------------
FROM node:20-alpine AS builder

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0 \
    CI=true

RUN apk add --no-cache openssl libc6-compat \
    && corepack enable

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
COPY apps/worker/package.json apps/worker/
COPY apps/spa/package.json apps/spa/
COPY packages/shared/package.json packages/shared/
COPY packages/sdk/package.json packages/sdk/
COPY packages/crypto/package.json packages/crypto/
COPY packages/eslint-config/package.json packages/eslint-config/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY packages packages
COPY apps/worker apps/worker

RUN pnpm --filter @tietide/shared run build \
    && pnpm --filter @tietide/sdk run build \
    && pnpm --filter @tietide/crypto run build \
    && pnpm --filter @tietide/worker run build \
    && pnpm --filter @tietide/worker --prod deploy --legacy /out

# ---- Runtime stage ---------------------------------------------------------
FROM node:20-alpine AS runtime

ENV NODE_ENV=production

RUN apk add --no-cache openssl libc6-compat tini \
    && addgroup -S tietide \
    && adduser -S -G tietide -u 1001 tietide

WORKDIR /app

COPY --from=builder --chown=tietide:tietide /out/dist ./dist
COPY --from=builder --chown=tietide:tietide /out/node_modules ./node_modules
COPY --from=builder --chown=tietide:tietide /out/package.json ./package.json

USER tietide

# Worker exposes a tiny HTTP server for /metrics and liveness/readiness probes
# (W3.6/W3.7) on METRICS_PORT (default 9091).
EXPOSE 9091

# Liveness probe: the process answers on /live. Uses node (always present) so no
# curl/wget dependency is required in the runtime image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.METRICS_PORT||9091)+'/live',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
