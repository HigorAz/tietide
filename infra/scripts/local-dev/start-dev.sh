#!/usr/bin/env bash
# Bring TieTide up in dev mode: Docker compose + 3 backgrounded pnpm dev processes.
# Idempotent — re-running it skips services that are already up.

set -euo pipefail

REPO=~/tietide
LOGS=~/tietide-scripts/logs
mkdir -p "$LOGS"

# nvm-managed Node isn't on $PATH for fresh shells / systemd / cron — source it explicitly
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$REPO"

echo "→ Starting Docker dependencies (postgres / valkey / ollama / chromadb / mailhog / ai)..."
# --build keeps the locally-built `ai` image in sync with apps/ai source. The
# expensive pip layer is cached, so subsequent starts only re-copy the source.
docker compose -f infra/docker/docker-compose.yml --env-file .env up -d --build

start_service() {
  local name=$1; shift
  local pidfile="$LOGS/$name.pid"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "  $name already running (PID $(cat "$pidfile"))"
    return
  fi
  echo "→ Starting $name..."
  # setsid puts each service in its OWN session/process group, so the recorded
  # PID is the group leader. stop-all.sh can then terminate the whole group
  # (wrapper + pnpm + node) at once instead of orphaning the `node dist/main`
  # grandchild. setsid also detaches from the controlling terminal (which is
  # what nohup used to provide).
  setsid "$@" > "$LOGS/$name.log" 2>&1 &
  echo $! > "$pidfile"
}

start_service api    bash -c "cd $REPO && pnpm --filter @tietide/api dev"
start_service worker bash -c "cd $REPO && pnpm --filter @tietide/worker dev"
start_service spa    bash -c "cd $REPO && pnpm --filter @tietide/spa dev"

# --- Wait for services to actually bind before returning -----------------------
# start_service launches each service via `setsid ... &` and returns immediately.
# If this script's process exits before a child finishes detaching into its own
# session, that child can be torn down — which is why the LAST-launched service
# (spa) sometimes died with an empty log while api/worker survived. Blocking here
# until the ports answer keeps the parent alive past that race and turns a silent
# failure into a clear, actionable report. Dev timeouts are generous because
# `nest start --watch` compiles before it binds on a cold start.
wait_for_port() {
  local label=$1 port=$2 tries=${3:-120} i
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
wait_for_port api 3030 180 || ready=1
wait_for_port spa 5173 120 || ready=1
# AI docs service (FastAPI, in Docker) — publishes :8000.
wait_for_port ai 8000 120 || ready=1
# worker exposes no port — confirm its tracked process is still alive
if [ -f "$LOGS/worker.pid" ] && kill -0 "$(cat "$LOGS/worker.pid")" 2>/dev/null; then
  echo "  ✓ worker process alive"
else
  echo "  ✗ worker is not running — check $LOGS/worker.log"
  ready=1
fi

echo ""
if [ "$ready" -eq 0 ]; then
  echo "✓ Dev environment up."
else
  echo "⚠ Some services did not come up — see the ✗ lines above and the logs."
fi
echo "  Tail logs:   tail -f $LOGS/*.log"
echo "  Status:      ~/tietide-scripts/status.sh"
echo "  Stop all:    ~/tietide-scripts/stop-all.sh"
echo "  Public URL:  https://tietide.com"

exit "$ready"
