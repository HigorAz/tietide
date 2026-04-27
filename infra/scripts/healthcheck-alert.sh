#!/usr/bin/env bash
# healthcheck-alert.sh — poll the TieTide /v1/health endpoint and email on failure.
#
# Designed to be run from cron (e.g. every minute). Sends an SMTP notification
# when the health endpoint returns non-200 OR reports any disconnected dep.
#
# Required env vars:
#   HEALTH_URL          (default: http://localhost:3030/v1/health)
#   ALERT_FROM          (required — sender e.g. tietide-monitor@example.com)
#   ALERT_TO            (required — recipient(s), comma-separated)
#   SMTP_HOST           (required)
#   SMTP_PORT           (default: 587)
#   SMTP_USER           (optional — auth username)
#   SMTP_PASSWORD       (optional — auth password)
#
# Suppression: writes a marker file at $ALERT_STATE_FILE while the service is
# down so cron doesn't re-page every minute. Marker is cleared on recovery,
# triggering a single "recovered" email.

set -euo pipefail

HEALTH_URL="${HEALTH_URL:-http://localhost:3030/v1/health}"
ALERT_STATE_FILE="${ALERT_STATE_FILE:-/var/run/tietide-alert.state}"
SMTP_PORT="${SMTP_PORT:-587}"

if [[ -z "${ALERT_FROM:-}" || -z "${ALERT_TO:-}" || -z "${SMTP_HOST:-}" ]]; then
  echo "[alert] ERROR: ALERT_FROM, ALERT_TO and SMTP_HOST are required" >&2
  exit 2
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "[alert] ERROR: curl is required" >&2
  exit 2
fi

http_code="$(curl -sS -o /tmp/tietide-health.json -w '%{http_code}' --max-time 5 "$HEALTH_URL" || echo '000')"
body="$(cat /tmp/tietide-health.json 2>/dev/null || echo '{}')"

is_unhealthy=0
if [[ "$http_code" != "200" ]]; then
  is_unhealthy=1
elif echo "$body" | grep -q '"status":"fail"'; then
  is_unhealthy=1
elif echo "$body" | grep -q '"status":"disconnected"'; then
  is_unhealthy=1
fi

send_email() {
  local subject="$1"
  local payload="$2"
  local credentials=()
  if [[ -n "${SMTP_USER:-}" && -n "${SMTP_PASSWORD:-}" ]]; then
    credentials=(--user "${SMTP_USER}:${SMTP_PASSWORD}")
  fi

  local message_file
  message_file="$(mktemp -t tietide-alert.XXXXXX)"
  {
    echo "From: ${ALERT_FROM}"
    echo "To: ${ALERT_TO}"
    echo "Subject: ${subject}"
    echo "Content-Type: text/plain; charset=utf-8"
    echo
    echo "URL: ${HEALTH_URL}"
    echo "HTTP status: ${http_code}"
    echo "Body:"
    echo "${payload}"
  } > "$message_file"

  curl --silent --show-error --fail --ssl-reqd \
    --url "smtp://${SMTP_HOST}:${SMTP_PORT}" \
    "${credentials[@]}" \
    --mail-from "${ALERT_FROM}" \
    --mail-rcpt "${ALERT_TO}" \
    --upload-file "$message_file"

  rm -f "$message_file"
}

if [[ "$is_unhealthy" -eq 1 ]]; then
  if [[ ! -f "$ALERT_STATE_FILE" ]]; then
    send_email "[TieTide] health check FAILING" "$body"
    mkdir -p "$(dirname "$ALERT_STATE_FILE")"
    date -u +%FT%TZ > "$ALERT_STATE_FILE"
  fi
  echo "[alert] unhealthy (http=${http_code})"
  exit 1
fi

if [[ -f "$ALERT_STATE_FILE" ]]; then
  send_email "[TieTide] health check RECOVERED" "$body"
  rm -f "$ALERT_STATE_FILE"
fi

echo "[alert] healthy"
