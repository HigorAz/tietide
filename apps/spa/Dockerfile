# syntax=docker/dockerfile:1.7
# ---- Builder stage ---------------------------------------------------------
FROM node:20-alpine AS builder

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0 \
    CI=true

RUN apk add --no-cache libc6-compat \
    && corepack enable

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/spa/package.json apps/spa/
COPY packages/shared/package.json packages/shared/
COPY packages/sdk/package.json packages/sdk/
COPY packages/eslint-config/package.json packages/eslint-config/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY packages packages
COPY apps/spa apps/spa

ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

RUN pnpm --filter @tietide/shared run build \
    && pnpm --filter @tietide/spa run build

# ---- Runtime stage (nginx serves static assets) ----------------------------
FROM nginx:1.27-alpine AS runtime

# Drop the default config and replace with one tuned for an SPA.
RUN rm /etc/nginx/conf.d/default.conf
COPY apps/spa/nginx.conf /etc/nginx/conf.d/default.conf

# Run nginx as non-root: relocate pid + cache dirs and grant access to nginx user.
RUN sed -i 's|^pid .*|pid /tmp/nginx.pid;|' /etc/nginx/nginx.conf \
    && sed -i 's|^user .*|# user directive removed for non-root execution|' /etc/nginx/nginx.conf \
    && mkdir -p /var/cache/nginx /var/run \
    && chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx/conf.d /tmp

COPY --from=builder --chown=nginx:nginx /repo/apps/spa/dist /usr/share/nginx/html

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
