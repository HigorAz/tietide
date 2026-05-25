#!/usr/bin/env bash
# Stop only the TEST stack (ports 3031 / 5174). Prod stack, shared Docker deps,
# and the Cloudflare tunnel are untouched.
#
# Mirrors stop-all.sh: services are started via setsid (own process group), so
# we group-kill the leader, also walk the descendant tree, and finally sweep by
# the TEST ports as a backstop — scoped to 3031/5174 so the prod stack on
# 3030/5173 is never touched.

set -euo pipefail

LOGS=~/tietide-scripts/logs
TEST_PORTS=(3031 5174)

# Kill a PID and every descendant, children-first, so nothing escapes.
kill_tree() {
  local pid=$1 sig=${2:-TERM} child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child" "$sig"
  done
  kill -"$sig" "$pid" 2>/dev/null || true
}

# Group-kill when the PID is a process-group leader (setsid launches), and
# always also walk the tree (covers non-setsid launches + reparented children).
stop_pid() {
  local pid=$1 sig=${2:-TERM} pgid
  pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ' || true)
  if [ -n "$pgid" ] && [ "$pgid" = "$pid" ]; then
    kill -"$sig" -- -"$pid" 2>/dev/null || true
  fi
  kill_tree "$pid" "$sig"
}

# --- Pass 1: tracked test-*.pid services (group + tree) ---
for service in api worker spa; do
  pidfile="$LOGS/test-$service.pid"
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      echo "→ Stopping test $service (PID $pid + group)..."
      stop_pid "$pid" TERM
      for i in 1 2 3 4 5; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 1
      done
      if kill -0 "$pid" 2>/dev/null; then
        echo "  Force-killing test $service..."
        stop_pid "$pid" KILL
      fi
    fi
    rm -f "$pidfile"
  else
    echo "  test $service not in pidfile (already stopped or never tracked)"
  fi
done

# --- Pass 2: port backstop, TEST ports only (no sudo for self-owned sockets) ---
echo "→ Sweeping anything still listening on test ports (${TEST_PORTS[*]})..."
for port in "${TEST_PORTS[@]}"; do
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

sleep 1
still_listening=$(ss -lntp 2>/dev/null | grep -E ':(3031|5174)' || true)
if [ -n "$still_listening" ]; then
  echo ""
  echo "⚠ Something is STILL listening on a test port:"
  echo "$still_listening"
fi

echo ""
read -p "Also stop the valkey-test container (isolated queue)? [y/N] " yn
case "$yn" in
  [yY]*)
    docker stop valkey-test 2>/dev/null || echo "  valkey-test was not running"
    ;;
  *)
    echo "  Leaving valkey-test running."
    ;;
esac

echo ""
echo "✓ Test stack stopped. Prod stack and shared Docker deps unchanged."
