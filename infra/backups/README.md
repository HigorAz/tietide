# Backups & Health Monitoring (S9)

Operational runbook for the TieTide self-hosted deployment. Covers daily PostgreSQL
backups, restore drills, and SMTP alerting wired to `/v1/health`.

## 1. Daily PostgreSQL backup

`infra/scripts/backup-postgres.sh` runs `pg_dump`, gzip-compresses the output, then
encrypts it with `gpg --symmetric` (AES-256). Backups are written to `BACKUP_DIR`
with names like `tietide-20260427-030000.sql.gz.gpg`. Old files past
`BACKUP_RETENTION_DAYS` are deleted.

### Required environment

| Var                     | Purpose                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `POSTGRES_HOST`         | Hostname of the live database (default `localhost`)                                   |
| `POSTGRES_PORT`         | Default `5432`                                                                        |
| `POSTGRES_USER`         | Default `tietide`                                                                     |
| `POSTGRES_PASSWORD`     | Required — used for `pg_dump`                                                         |
| `POSTGRES_DB`           | Default `tietide`                                                                     |
| `BACKUP_DIR`            | Where encrypted dumps land. Default `/var/backups/tietide`                            |
| `BACKUP_ENCRYPTION_KEY` | **Symmetric passphrase**. Treat like a master secret — without it you cannot restore. |
| `BACKUP_RETENTION_DAYS` | Default `14`                                                                          |

### Cron entry (run as a user with read access to PG and write access to `BACKUP_DIR`)

```cron
# /etc/cron.d/tietide-backup
0 3 * * *  tietide  /opt/tietide/infra/scripts/backup-postgres.sh >> /var/log/tietide-backup.log 2>&1
```

The script `set -euo pipefail`s and exits non-zero on any failure, so cron's
`MAILTO` (or your alerting layer) will notice. A failed encryption produces no
artifact — partial files are cleaned up via `trap`.

## 2. Restoring from a backup

Use `infra/scripts/restore-postgres.sh <backup-file.sql.gz.gpg>`.

Defaults are deliberately **not** the production database. `POSTGRES_DB` defaults
to `tietide_restore` so a typo cannot overwrite live data — set it explicitly
when you really mean to restore over prod.

### Standard drill (run monthly, document the result)

```bash
# 1. Pick the most recent encrypted backup
backup="$(ls -1t /var/backups/tietide/tietide-*.sql.gz.gpg | head -n1)"

# 2. Create a clean target database
PGPASSWORD="$POSTGRES_PASSWORD" psql -h localhost -U tietide -c \
  "DROP DATABASE IF EXISTS tietide_restore; CREATE DATABASE tietide_restore;"

# 3. Restore
BACKUP_ENCRYPTION_KEY="$BACKUP_ENCRYPTION_KEY" \
POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
POSTGRES_DB=tietide_restore \
  /opt/tietide/infra/scripts/restore-postgres.sh "$backup"

# 4. Smoke test
PGPASSWORD="$POSTGRES_PASSWORD" psql -h localhost -U tietide -d tietide_restore \
  -c 'SELECT count(*) FROM "User";'
```

If step 4 returns the expected row counts, the backup is good. Record the date
and dump file in your DR log.

### Production restore (disaster recovery)

1. Stop the API and Worker (`docker compose stop api worker`).
2. Snapshot the current database directory just in case.
3. Run `restore-postgres.sh` with `POSTGRES_DB=tietide` (the live name).
4. Restart services.

## 3. Health monitoring

The API exposes two endpoints:

| Endpoint              | Purpose                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/health`      | Aggregate readiness — checks PostgreSQL, Valkey (Redis) and the AI service. Returns 200 when `ok` or `degraded`, 503 when `fail` (DB or Valkey down). |
| `GET /v1/health/live` | Liveness — returns 200 as long as the Node process can serve a response. Use as your container `HEALTHCHECK` and the Kubernetes liveness probe.       |

Status semantics:

- `ok` — all three deps connected.
- `degraded` — DB and Valkey up, AI service unreachable. Workflows still run; doc generation is the only feature affected.
- `fail` — DB or Valkey down. Returns HTTP 503; treat as a page.

### SMTP alerting

`infra/scripts/healthcheck-alert.sh` is a cron-friendly probe that emails on
state changes (down → email, up → recovery email). Suppression is via a state
file at `ALERT_STATE_FILE` (default `/var/run/tietide-alert.state`) so a long
outage does not flood the inbox.

```cron
# /etc/cron.d/tietide-health-alert
*/1 * * * *  tietide  ALERT_FROM=tietide-monitor@example.com \
                       ALERT_TO=oncall@example.com \
                       SMTP_HOST=smtp.example.com \
                       SMTP_PORT=587 \
                       SMTP_USER=tietide-monitor@example.com \
                       SMTP_PASSWORD='REDACTED' \
                       HEALTH_URL=https://tietide.example.com/v1/health \
                       /opt/tietide/infra/scripts/healthcheck-alert.sh \
                       >> /var/log/tietide-health-alert.log 2>&1
```

Behaviour:

- HTTP non-200, body `"status":"fail"`, or any `"status":"disconnected"` triggers an alert email.
- A second consecutive failure does **not** re-send the email — the state file suppresses it.
- The next successful probe deletes the state file and sends a single "RECOVERED" email.

For local development (where Mailhog runs at `localhost:1025` with no auth)
you can leave `SMTP_USER`/`SMTP_PASSWORD` unset — the script will skip
credentials but still send the message via SMTP.

### Deeper observability (future work)

The above gives a binary up/down signal. For richer visibility, point
Prometheus, Uptime Kuma, or Grafana Synthetic Monitoring at `/v1/health` and
parse the JSON response. The endpoint already includes per-dep status, so
panels for `database`, `redis`, and `ai` can be wired up without code changes.
