#!/usr/bin/env bash
# Show what's running for both PROD and TEST stacks + Docker + tunnel.

LOGS=~/tietide-scripts/logs

show_services() {
  local label=$1
  local prefix=$2
  echo "$label services:"
  for service in api worker spa; do
    pidfile="$LOGS/${prefix}${service}.pid"
    if [ -f "$pidfile" ]; then
      pid=$(cat "$pidfile")
      if kill -0 "$pid" 2>/dev/null; then
        echo "  ✓ $service running (PID $pid)"
      else
        echo "  ✗ $service crashed (stale PID $pid). Check $LOGS/${prefix}${service}.log"
      fi
    else
      echo "  - $service stopped"
    fi
  done
}

show_services "PROD" ""
echo ""
show_services "TEST" "test-"

echo ""
echo "Docker dependencies:"
docker compose -f ~/tietide/infra/docker/docker-compose.yml ps \
  --format "  {{.Service}}: {{.State}}" 2>/dev/null \
  || echo "  (docker compose not reachable)"

if docker ps --format '{{.Names}}\t{{.Status}}' | grep -q '^valkey-test'; then
  status=$(docker ps --format '{{.Names}}\t{{.Status}}' | grep '^valkey-test' | cut -f2)
  echo "  valkey-test: $status"
else
  echo "  valkey-test: not running"
fi

echo ""
echo "Cloudflare tunnel:"
if systemctl is-active --quiet cloudflared 2>/dev/null; then
  echo "  ✓ cloudflared (systemd service) running"
elif pgrep -f "cloudflared tunnel run" > /dev/null; then
  echo "  ✓ cloudflared running (foreground)"
else
  echo "  ✗ cloudflared not running"
fi

echo ""
echo "Sanity checks:"
echo "  PROD"
curl -fsS -m 3 http://localhost:3030/v1/health/live 2>/dev/null \
  | sed 's/^/    API local: /' \
  || echo "    API local: unreachable"
if curl -fsS -m 3 -I http://localhost:5173/ 2>/dev/null | head -1 | grep -q "200"; then
  echo "    SPA local: HTTP/1.1 200"
else
  echo "    SPA local: unreachable"
fi
curl -fsS -m 5 https://tietide.com/v1/health/live 2>/dev/null \
  | sed 's/^/    Public:    /' \
  || echo "    Public:    unreachable"

echo "  TEST"
curl -fsS -m 3 http://localhost:3031/v1/health/live 2>/dev/null \
  | sed 's/^/    API local: /' \
  || echo "    API local: unreachable"
if curl -fsS -m 3 -I http://localhost:5174/ 2>/dev/null | head -1 | grep -q "200"; then
  echo "    SPA local: HTTP/1.1 200"
else
  echo "    SPA local: unreachable"
fi
