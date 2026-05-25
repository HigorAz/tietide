#!/usr/bin/env bash
# One-time setup for the parallel TEST stack alongside prod.
#
# Does four things:
#   1. Creates a `tietide_test` Postgres DB on the existing container
#   2. Applies migrations to it
#   3. Starts a second Valkey container `valkey-test` on host port 6380
#      so the test BullMQ queue is isolated from prod's queue
#   4. Generates ~/tietide/.env.test by copying .env and overriding ports/URLs/DB
#
# Safe to re-run — every step is idempotent.

set -euo pipefail

REPO=~/tietide
cd "$REPO"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Single source of truth for the test DB connection string. This is the local
# dev credential (same `tietide:tietide_secret` pair used in .env and
# docker-compose) — not a production secret. Kept in one variable so it isn't
# duplicated below.
TEST_DB_URL="postgresql://tietide:tietide_secret@localhost:5432/tietide_test?schema=public"

# --- 1. Create tietide_test database if absent ---
echo "→ Ensuring tietide_test database exists..."
if docker compose -f infra/docker/docker-compose.yml exec -T postgres \
     psql -U tietide -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='tietide_test'" \
     | grep -q 1; then
  echo "  tietide_test already exists"
else
  docker compose -f infra/docker/docker-compose.yml exec -T postgres \
    psql -U tietide -d postgres -c "CREATE DATABASE tietide_test;"
  echo "  Created tietide_test"
fi

# --- 2. Apply migrations to tietide_test ---
echo "→ Applying migrations to tietide_test..."
DATABASE_URL="$TEST_DB_URL" \
  pnpm --filter @tietide/api exec prisma migrate deploy

# --- 3. Start the isolated valkey-test container (port 6380) ---
if docker ps --format '{{.Names}}' | grep -q '^valkey-test$'; then
  echo "→ valkey-test already running"
elif docker ps -a --format '{{.Names}}' | grep -q '^valkey-test$'; then
  echo "→ Restarting existing valkey-test container..."
  docker start valkey-test
else
  echo "→ Creating valkey-test container (port 6380)..."
  docker run -d \
    --name valkey-test \
    --restart unless-stopped \
    -p 6380:6379 \
    valkey/valkey:8-alpine
fi

# --- 4. Generate .env.test (only if absent) ---
if [ -f "$REPO/.env.test" ]; then
  echo "→ .env.test already exists — leaving it untouched (delete the file and re-run to regenerate)"
else
  echo "→ Generating .env.test from .env with test-specific overrides..."
  cp "$REPO/.env" "$REPO/.env.test"
  sed -i \
    -e "s|^DATABASE_URL=.*|DATABASE_URL=$TEST_DB_URL|" \
    -e "s|^REDIS_PORT=.*|REDIS_PORT=6380|" \
    -e "s|^API_PORT=.*|API_PORT=3031|" \
    -e "s|^CORS_ORIGIN=.*|CORS_ORIGIN=http://localhost:5174|" \
    -e "s|^SPA_BASE_URL=.*|SPA_BASE_URL=http://localhost:5174|" \
    -e "s|^VITE_API_URL=.*|VITE_API_URL=http://localhost:3031/v1|" \
    -e "s|^GOOGLE_OAUTH_REDIRECT_URI=.*|GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3031/v1/connections/oauth/callback?provider=google|" \
    -e "s|^MS_OAUTH_REDIRECT_URI=.*|MS_OAUTH_REDIRECT_URI=http://localhost:3031/v1/connections/oauth/callback?provider=microsoft|" \
    -e "s|^SLACK_OAUTH_REDIRECT_URI=.*|SLACK_OAUTH_REDIRECT_URI=http://localhost:3031/v1/connections/oauth/callback?provider=slack|" \
    -e "s|^NOTION_OAUTH_REDIRECT_URI=.*|NOTION_OAUTH_REDIRECT_URI=http://localhost:3031/v1/connections/oauth/callback?provider=notion|" \
    -e "s|^HUBSPOT_OAUTH_REDIRECT_URI=.*|HUBSPOT_OAUTH_REDIRECT_URI=http://localhost:3031/v1/connections/oauth/callback?provider=hubspot|" \
    "$REPO/.env.test"
  echo "  Wrote $REPO/.env.test"
fi

echo ""
echo "✓ Test environment setup complete."
echo ""
echo "Next steps:"
echo "  ~/tietide-scripts/start-test.sh    # bring up the test stack (parallel to prod)"
echo "  ~/tietide-scripts/stop-test.sh     # tear down just the test stack"
echo "  ~/tietide-scripts/status.sh        # see both stacks"
echo ""
echo "Test stack endpoints (localhost-only, NOT publicly exposed):"
echo "  SPA:  http://localhost:5174   (Vite dev mode with HMR)"
echo "  API:  http://localhost:3031"
echo ""
echo "Prod stack is untouched at https://tietide.com / localhost:5173."
