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
COPY packages/eslint-config/package.json packages/eslint-config/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source and build the API + its workspace deps.
COPY packages packages
COPY apps/api apps/api

RUN pnpm --filter @tietide/shared run build \
    && pnpm --filter @tietide/sdk run build \
    && pnpm --filter @tietide/api run build

# Strip dev dependencies for the runtime stage.
RUN pnpm --filter @tietide/api --prod deploy --legacy /out

# ---- Runtime stage ---------------------------------------------------------
FROM node:20-alpine AS runtime

ENV NODE_ENV=production \
    API_PORT=3030

RUN apk add --no-cache openssl libc6-compat tini \
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
