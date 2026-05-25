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

echo "→ Starting Docker dependencies (postgres / valkey / ollama / chromadb / mailhog)..."
docker compose -f infra/docker/docker-compose.yml --env-file .env up -d

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

echo ""
echo "✓ Dev environment up."
echo "  Tail logs:   tail -f $LOGS/*.log"
echo "  Status:      ~/tietide-scripts/status.sh"
echo "  Stop all:    ~/tietide-scripts/stop-all.sh"
echo "  Public URL:  https://tietide.com"
