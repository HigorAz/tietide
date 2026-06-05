#!/usr/bin/env bash
# Bring up the parallel TEST stack on 3031/5174 alongside the prod stack on 3030/5173.
# Uses tietide_test DB + valkey-test container so it shares no state with prod.
# All three services run in dev mode (HMR enabled) for fast iteration.
#
# Prereq: ~/tietide-scripts/setup-test-env.sh must have been run once.

set -euo pipefail

REPO=~/tietide
LOGS=~/tietide-scripts/logs
mkdir -p "$LOGS"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

if [ ! -f "$REPO/.env.test" ]; then
  echo "✗ $REPO/.env.test missing. Run ~/tietide-scripts/setup-test-env.sh first."
  exit 1
fi

cd "$REPO"

# Prod docker deps must be up (test stack shares Postgres + Ollama + Chroma with prod)
echo "→ Ensuring shared Docker dependencies are up..."
docker compose -f infra/docker/docker-compose.yml --env-file .env up -d

# Test stack uses its own Valkey for isolated BullMQ queues
if ! docker ps --format '{{.Names}}' | grep -q '^valkey-test$'; then
  echo "→ Starting valkey-test (isolated Valkey on port 6380)..."
  if docker ps -a --format '{{.Names}}' | grep -q '^valkey-test$'; then
    docker start valkey-test
  else
    docker run -d --name valkey-test --restart unless-stopped -p 6380:6379 valkey/valkey:8-alpine
  fi
fi

# Regenerate the Prisma client so dev-mode nest/vite compile against the current
# schema (the client lives in node_modules, shared by prod + test).
echo "→ Generating Prisma client from the schema..."
pnpm --filter @tietide/api exec prisma generate

start_test_service() {
  local name=$1; shift
  local pidfile="$LOGS/test-$name.pid"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "  test $name already running (PID $(cat "$pidfile"))"
    return
  fi
  echo "→ Starting test $name (dev mode with HMR)..."
  # bash -c runs the command in a subshell. We:
  #   1. `set -a` so subsequent `source` auto-exports each var
  #   2. `source .env.test` populates process.env with test values
  #   3. cd into the repo so pnpm finds workspaces
  #   4. run the command (e.g. `pnpm --filter @tietide/api dev`)
  # NestJS ConfigModule and Vite both prefer process.env over .env files, so the
  # test values win even though .env (the prod file) is still in the directory.
  # setsid → each service gets its OWN process group so stop-test.sh can
  # group-kill the whole tree (wrapper + pnpm + node) instead of orphaning the
  # node grandchild. Also detaches from the controlling terminal.
  setsid bash -c "
    set -a
    source $REPO/.env.test
    set +a
    cd $REPO
    $*
  " > "$LOGS/test-$name.log" 2>&1 &
  echo $! > "$pidfile"
}

start_test_service api    "pnpm --filter @tietide/api dev"
start_test_service worker "pnpm --filter @tietide/worker dev"
# Vite needs the port passed via CLI — .env doesn't drive its bind port.
start_test_service spa    "pnpm --filter @tietide/spa exec vite --port 5174"

echo ""
echo "✓ Test environment up."
echo "  URL:    http://localhost:5174    (Vite dev, HMR — localhost-only)"
echo "  API:    http://localhost:3031"
echo "  Logs:   tail -f $LOGS/test-*.log"
echo "  Status: ~/tietide-scripts/status.sh"
echo "  Stop:   ~/tietide-scripts/stop-test.sh"
echo ""
echo "Prod stack is unaffected — still on localhost:5173 / https://tietide.com."
echo ""
echo "Note: it takes ~5-15 seconds for nest + vite to actually bind their ports."
echo "Re-run status.sh after a moment if checks show the test stack as unreachable."
