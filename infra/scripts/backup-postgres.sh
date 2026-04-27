#!/usr/bin/env bash
# backup-postgres.sh — daily encrypted PostgreSQL dump for TieTide.
#
# Produces a timestamped, gzip-compressed, gpg-symmetric-encrypted dump:
#   ${BACKUP_DIR}/tietide-YYYYMMDD-HHMMSS.sql.gz.gpg
#
# Required env vars:
#   POSTGRES_HOST            (default: localhost)
#   POSTGRES_PORT            (default: 5432)
#   POSTGRES_USER            (default: tietide)
#   POSTGRES_PASSWORD        (required — passed to pg_dump via PGPASSWORD)
#   POSTGRES_DB              (default: tietide)
#   BACKUP_DIR               (default: /var/backups/tietide)
#   BACKUP_ENCRYPTION_KEY    (required — symmetric passphrase for gpg)
#   BACKUP_RETENTION_DAYS    (default: 14)
#
# Exits non-zero on any failure so cron / monitoring can alert.

set -euo pipefail

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-tietide}"
POSTGRES_DB="${POSTGRES_DB:-tietide}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/tietide}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
  echo "[backup] ERROR: POSTGRES_PASSWORD is not set" >&2
  exit 2
fi
if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
  echo "[backup] ERROR: BACKUP_ENCRYPTION_KEY is not set" >&2
  exit 2
fi

for tool in pg_dump gzip gpg; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "[backup] ERROR: required tool '$tool' is not installed" >&2
    exit 2
  fi
done

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%d-%H%M%S)"
target="${BACKUP_DIR}/tietide-${timestamp}.sql.gz.gpg"
tmp_dump="$(mktemp -t tietide-dump.XXXXXX.sql.gz)"

cleanup() {
  rm -f "$tmp_dump"
}
trap cleanup EXIT

echo "[backup] starting pg_dump for ${POSTGRES_DB}@${POSTGRES_HOST}:${POSTGRES_PORT}"
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
  --host="$POSTGRES_HOST" \
  --port="$POSTGRES_PORT" \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --no-owner --no-privileges --format=plain \
  | gzip -9 > "$tmp_dump"

echo "[backup] encrypting dump to ${target}"
gpg --batch --yes --quiet --symmetric \
  --cipher-algo AES256 \
  --passphrase "$BACKUP_ENCRYPTION_KEY" \
  --output "$target" \
  "$tmp_dump"

chmod 600 "$target"

bytes="$(wc -c < "$target" | tr -d ' ')"
if [[ "$bytes" -lt 100 ]]; then
  echo "[backup] ERROR: encrypted backup is suspiciously small (${bytes} bytes)" >&2
  rm -f "$target"
  exit 3
fi

echo "[backup] retention sweep: deleting *.sql.gz.gpg older than ${BACKUP_RETENTION_DAYS} days"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'tietide-*.sql.gz.gpg' \
  -mtime +"$BACKUP_RETENTION_DAYS" -print -delete || true

echo "[backup] done: ${target} (${bytes} bytes)"
