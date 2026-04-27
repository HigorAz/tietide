#!/usr/bin/env bash
# restore-postgres.sh — restore an encrypted TieTide backup into a target database.
#
# Usage:
#   restore-postgres.sh <backup-file.sql.gz.gpg>
#
# Required env vars:
#   POSTGRES_HOST            (default: localhost)
#   POSTGRES_PORT            (default: 5432)
#   POSTGRES_USER            (default: tietide)
#   POSTGRES_PASSWORD        (required)
#   POSTGRES_DB              (default: tietide_restore — DO NOT default to prod)
#   BACKUP_ENCRYPTION_KEY    (required — same passphrase used for backup)
#
# By design POSTGRES_DB defaults to a non-prod name so a typo doesn't overwrite
# live data. Override it explicitly when restoring to production after a verified
# disaster-recovery decision.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <backup-file.sql.gz.gpg>" >&2
  exit 2
fi

backup_file="$1"

if [[ ! -f "$backup_file" ]]; then
  echo "[restore] ERROR: backup file not found: $backup_file" >&2
  exit 2
fi

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-tietide}"
POSTGRES_DB="${POSTGRES_DB:-tietide_restore}"

if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
  echo "[restore] ERROR: POSTGRES_PASSWORD is not set" >&2
  exit 2
fi
if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
  echo "[restore] ERROR: BACKUP_ENCRYPTION_KEY is not set" >&2
  exit 2
fi

for tool in psql gunzip gpg; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "[restore] ERROR: required tool '$tool' is not installed" >&2
    exit 2
  fi
done

echo "[restore] target: ${POSTGRES_DB}@${POSTGRES_HOST}:${POSTGRES_PORT}"
echo "[restore] decrypting and streaming into psql..."

gpg --batch --quiet --decrypt \
    --passphrase "$BACKUP_ENCRYPTION_KEY" \
    "$backup_file" \
  | gunzip \
  | PGPASSWORD="$POSTGRES_PASSWORD" psql \
      --host="$POSTGRES_HOST" \
      --port="$POSTGRES_PORT" \
      --username="$POSTGRES_USER" \
      --dbname="$POSTGRES_DB" \
      --set ON_ERROR_STOP=on \
      --quiet

echo "[restore] done"
