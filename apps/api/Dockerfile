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

# Copy workspace manifests first to leverage layer caching.
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

# Copy source and build the API + its workspace deps.
COPY packages packages
COPY apps/api apps/api

RUN pnpm --filter @tietide/shared run build \
    && pnpm --filter @tietide/sdk run build \
    && pnpm --filter @tietide/crypto run build \
    && pnpm --filter @tietide/api run build

# Strip dev dependencies for the runtime stage.
RUN pnpm --filter @tietide/api --prod deploy --legacy /out

# ---- Runtime stage ---------------------------------------------------------
FROM node:20-alpine AS runtime

ENV NODE_ENV=production \
    API_PORT=3030

# Patch OS packages to the latest Alpine security releases (e.g. libcrypto3)
# before installing runtime deps, so the published image carries no known
# fixable HIGH/CRITICAL OS CVEs.
RUN apk upgrade --no-cache \
    && apk add --no-cache openssl libc6-compat tini \
    && addgroup -S tietide \
    && adduser -S -G tietide -u 1001 tietide

WORKDIR /app

COPY --from=builder --chown=tietide:tietide /out/dist ./dist
COPY --from=builder --chown=tietide:tietide /out/node_modules ./node_modules
COPY --from=builder --chown=tietide:tietide /out/package.json ./package.json
COPY --from=builder --chown=tietide:tietide /repo/apps/api/prisma ./prisma

USER tietide

EXPOSE 3030

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]

# ---- Migrate stage ---------------------------------------------------------
# Lean, non-root image for one-shot `prisma migrate deploy` (prod compose
# `migrate` profile). It extends the slim runtime — which already carries
# @prisma/client, the prisma schema, the query engine, and the unprivileged
# `tietide` user — and adds ONLY a version-pinned prisma CLI. This avoids
# publishing the full builder image (entire repo source + dev deps, root) just
# to run migrations. Keep PRISMA_VERSION in lockstep with apps/api/package.json
# `prisma` / `@prisma/client`.
FROM runtime AS migrate

# Pin the CLI to the same minor as @prisma/client (apps/api/package.json ^6.10.1)
# so the migration engine matches the generated client.
ARG PRISMA_VERSION=6.10.1

USER root
# Install ONLY the prisma CLI into an isolated /cli prefix so it never reconciles
# or prunes the pnpm-deployed /app/node_modules (which carries @prisma/client +
# the query engine). The CLI auto-discovers @prisma/client from /app via Node's
# upward node_modules resolution at runtime. Chown to the unprivileged user.
RUN mkdir -p /cli \
    && npm install --prefix /cli --omit=dev --no-audit --no-fund "prisma@${PRISMA_VERSION}" \
    && chown -R tietide:tietide /cli

USER tietide

# `prisma migrate deploy` is the production-safe command: never resets, never
# prompts. The schema + migrations live at ./prisma (copied in the runtime stage).
CMD ["/cli/node_modules/.bin/prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"]
