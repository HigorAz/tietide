#!/usr/bin/env bash
# Bring TieTide up in production mode: Docker compose + pnpm build for every package
# (in dependency order, auto-detected) + the built artifacts (NODE_ENV=production).
# Used for final-demo runs to validate that the build output works under the public
# URL, mirroring an eventual VPS deploy.

set -euo pipefail

REPO=~/tietide
LOGS=~/tietide-scripts/logs
mkdir -p "$LOGS"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$REPO"

echo "→ Starting Docker dependencies..."
docker compose -f infra/docker/docker-compose.yml --env-file .env up -d

# SKIP_BUILD=1 launches the existing build without recompiling — used by
# deploy-production.sh, which rebuilds artifacts while the old services stay up
# and then restarts with SKIP_BUILD=1 so the only downtime is the restart itself.
if [ "${SKIP_BUILD:-0}" = "1" ]; then
  echo "→ SKIP_BUILD=1 — using already-built artifacts (no recompile)"
else
  echo "→ Building every workspace package in dependency order (this takes a few minutes)..."
  # pnpm -r --filter "./packages/**" build  → builds shared/sdk/crypto/etc. in topological
  # order regardless of how many packages exist. Then build the apps separately so a
  # rebuild here keeps the api/worker/spa dist dirs in sync.
  pnpm -r --filter "./packages/**" build
  pnpm --filter @tietide/api build
  pnpm --filter @tietide/worker build
  pnpm --filter @tietide/spa build
fi

start_service() {
  local name=$1; shift
  local pidfile="$LOGS/$name.pid"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "  $name already running (PID $(cat "$pidfile"))"
    return
  fi
  echo "→ Starting $name (prod)..."
  # setsid puts each service in its OWN session/process group so stop-all.sh can
  # kill the whole group (wrapper + pnpm + node) instead of orphaning the
  # `node dist/main` grandchild. Also detaches from the controlling terminal
  # (which is what nohup used to provide).
  setsid env NODE_ENV=production "$@" > "$LOGS/$name.log" 2>&1 &
  echo $! > "$pidfile"
}

# Each app's package.json may use a different prod start script. Adjust if these don't exist:
# - api / worker: typically `pnpm --filter <name> start` or `start:prod`
# - spa: `vite preview` serves the dist/ bundle on the same port the dev server used
start_service api    bash -c "cd $REPO && pnpm --filter @tietide/api start"
start_service worker bash -c "cd $REPO && pnpm --filter @tietide/worker start"
start_service spa    bash -c "cd $REPO && pnpm --filter @tietide/spa exec vite preview --host 0.0.0.0 --port 5173"

# --- Wait for services to actually bind before returning -----------------------
# start_service launches each service via `setsid ... &` and returns immediately.
# If this script's process exits before a child finishes detaching into its own
# session, that child can be torn down — which is why the LAST-launched service
# (spa) sometimes died with an empty log while api/worker survived. Blocking here
# until the ports answer keeps the parent alive past that race and turns a silent
# failure into a clear, actionable report.
wait_for_port() {
  local label=$1 port=$2 tries=${3:-60} i
  for ((i = 1; i <= tries; i++)); do
    if ss -lnt "sport = :$port" 2>/dev/null | grep -q LISTEN; then
      echo "  ✓ $label listening on :$port"
      return 0
    fi
    sleep 0.5
  done
  echo "  ✗ $label did NOT bind :$port within $((tries / 2))s — check $LOGS/$label.log"
  return 1
}

echo ""
echo "→ Waiting for services to come up..."
ready=0
wait_for_port api 3030 || ready=1
wait_for_port spa 5173 || ready=1
# worker exposes no port — confirm its tracked process is still alive
if [ -f "$LOGS/worker.pid" ] && kill -0 "$(cat "$LOGS/worker.pid")" 2>/dev/null; then
  echo "  ✓ worker process alive"
else
  echo "  ✗ worker is not running — check $LOGS/worker.log"
  ready=1
fi

echo ""
if [ "$ready" -eq 0 ]; then
  echo "✓ Prod environment up."
else
  echo "⚠ Some services did not come up — see the ✗ lines above and the logs."
fi
echo "  Tail logs:   tail -f $LOGS/*.log"
echo "  Status:      ~/tietide-scripts/status.sh"
echo "  Stop all:    ~/tietide-scripts/stop-all.sh"
echo "  Public URL:  https://tietide.com"

exit "$ready"
