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
COPY packages/eslint-config/package.json packages/eslint-config/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY packages packages
COPY apps/worker apps/worker

RUN pnpm --filter @tietide/shared run build \
    && pnpm --filter @tietide/sdk run build \
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

# Worker has no inbound port; declare it for tooling/uniformity.
EXPOSE 9100

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
