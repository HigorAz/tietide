#!/usr/bin/env bash
# Stop the 3 TieTide Node services (api / worker / spa). Prompts whether to also
# stop the Docker dependencies. The Cloudflare tunnel is a systemd service —
# stop it separately with `sudo systemctl stop cloudflared`.
#
# The actual listener runs as `node dist/main` — a GRANDCHILD of the pidfile PID
# (bash -c → pnpm → node). The old script killed only the wrapper + its direct
# child, orphaning the listener (it reparented to init and kept the port). It
# also tried to sweep orphans by the absolute path `tietide/apps/api/dist/main`,
# which never matches a relative `node dist/main` argv.
#
# start-dev.sh / start-prod.sh now launch each service via `setsid`, so the
# tracked PID is a process-group leader and we can kill the whole group. We also
# walk the descendant tree and kill by listening port as belt-and-suspenders.

set -euo pipefail

REPO=~/tietide
LOGS=~/tietide-scripts/logs
PROD_PORTS=(3030 5173)   # TEST stack (3031/5174) is handled by stop-test.sh

# Kill a PID and every descendant, children-first, so nothing gets reparented
# and escapes.
kill_tree() {
  local pid=$1 sig=${2:-TERM} child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child" "$sig"
  done
  kill -"$sig" "$pid" 2>/dev/null || true
}

# Stop one service PID as thoroughly as possible:
#   - if it's a process-group leader (services started via setsid), signal the
#     whole group in one shot;
#   - always also walk the descendant tree (covers non-setsid launches and any
#     child that switched process group).
stop_pid() {
  local pid=$1 sig=${2:-TERM} pgid
  pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ' || true)
  if [ -n "$pgid" ] && [ "$pgid" = "$pid" ]; then
    kill -"$sig" -- -"$pid" 2>/dev/null || true
  fi
  kill_tree "$pid" "$sig"
}

# --- Pass 1: stop tracked services (group + tree) ---
for service in api worker spa; do
  pidfile="$LOGS/$service.pid"
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      echo "→ Stopping $service (PID $pid + group)..."
      stop_pid "$pid" TERM
      for i in 1 2 3 4 5; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 1
      done
      if kill -0 "$pid" 2>/dev/null; then
        echo "  Force-killing $service..."
        stop_pid "$pid" KILL
      fi
    fi
    rm -f "$pidfile"
  else
    echo "  $service not in pidfile (already stopped or never tracked)"
  fi
done

# --- Pass 2: port backstop ---
# Catches an orphaned listener (relative argv → unmatchable by name) and any
# straggler from earlier runs. Scoped to the PROD ports, so a running TEST stack
# on 3031/5174 is left untouched. No sudo needed — these sockets are owned by
# the current user, so plain `ss -lntp` shows their PIDs.
echo "→ Sweeping anything still listening on prod ports (${PROD_PORTS[*]})..."
for port in "${PROD_PORTS[@]}"; do
  pids=$(ss -lntp "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u || true)
  for pid in $pids; do
    echo "  Killing leftover PID $pid on :$port"
    stop_pid "$pid" TERM
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
      stop_pid "$pid" KILL
    fi
  done
done

# --- Report (plain ss; no sudo for self-owned sockets) ---
sleep 1
still_listening=$(ss -lntp 2>/dev/null | grep -E ':(3030|5173)' || true)
if [ -n "$still_listening" ]; then
  echo ""
  echo "⚠ Something is STILL listening on a prod port:"
  echo "$still_listening"
  echo "  (Investigate manually: ss -lntp 'sport = :3030')"
fi

echo ""
# Prompt only when attached to a terminal. Under automation (the deploy timer,
# CI, or `echo n | stop-all.sh`) there's no TTY, so default to keeping Docker
# deps up rather than blocking on a read that would hang or abort under `set -e`.
if [ -t 0 ]; then
  read -p "Also stop Docker dependencies (postgres / valkey / ollama / chromadb)? [y/N] " yn
else
  yn=n
fi
case "$yn" in
  [yY]*)
    cd "$REPO"
    docker compose -f infra/docker/docker-compose.yml down
    ;;
  *)
    echo "  Leaving Docker dependencies running."
    ;;
esac

echo ""
echo "✓ Stopped."
