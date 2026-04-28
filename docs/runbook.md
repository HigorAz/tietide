# TieTide — Operations Runbook

Playbooks for the most common production incidents. Each section answers three questions in order: **Detect → Diagnose → Recover**.

> All commands assume the deployment layout from [`deployment.md`](deployment.md): repo at `/opt/tietide`, `.env` at `/opt/tietide/.env`, container names `tietide-api`, `tietide-worker`, `tietide-ai`.

---

## Quick reference

| Symptom                                         | Playbook                                          |
| ----------------------------------------------- | ------------------------------------------------- |
| `/v1/health` returns 503 or alert email arrived | [API or Worker down](#api-or-worker-down)         |
| `/v1/health` reports `degraded`                 | [AI service degraded](#ai-service-degraded)       |
| Executions accepted but never finish            | [Queue stuck](#queue-stuck)                       |
| Specific workflow keeps failing                 | [Stuck in DLQ](#stuck-in-dlq)                     |
| DB unreachable / data corrupted                 | [Database restore](#database-restore)             |
| Disk filling up                                 | [Disk pressure](#disk-pressure)                   |
| Webhook keeps returning 401                     | [Webhook HMAC failure](#webhook-hmac-failure)     |
| Auth endpoints 429ing valid users               | [Rate limiter mis-tuned](#rate-limiter-mis-tuned) |

---

## API or Worker down

### Detect

- `healthcheck-alert.sh` emails `[TieTide] health check FAILING`.
- `curl https://tietide.example.com/v1/health/live` → connection refused or non-200.
- Users report 5xx errors.

### Diagnose

```bash
# Container state
docker ps -a --filter name=tietide-

# Last 200 lines from each app
docker logs --tail 200 tietide-api
docker logs --tail 200 tietide-worker
docker logs --tail 200 tietide-ai

# Health endpoint, if API is at all reachable
curl -fsS http://127.0.0.1:3030/v1/health | jq
```

Match the symptom to a cause:

| Log signal                              | Likely cause                                                               |
| --------------------------------------- | -------------------------------------------------------------------------- |
| `ECONNREFUSED 5432`                     | PostgreSQL down or unreachable on the docker network                       |
| `ECONNREFUSED 6379`                     | Valkey down                                                                |
| `PrismaClientInitializationError`       | DB up but credentials wrong, or migrations not applied                     |
| `out of memory`, container restart loop | OOM — check `docker stats`, raise host RAM or worker concurrency           |
| `EADDRINUSE`                            | Port collision after a partial restart — `docker ps` shows stale container |

### Recover

```bash
# 1. Bring dependencies back if any are red
docker compose -f infra/docker/docker-compose.yml ps
docker compose -f infra/docker/docker-compose.yml up -d postgres valkey

# 2. Restart the failing app
docker restart tietide-api      # or tietide-worker / tietide-ai

# 3. If the container exits immediately, run it foregrounded to see the boot error
docker rm tietide-api
docker run --rm --name tietide-api --network docker_default --env-file .env -p 127.0.0.1:3030:3030 tietide-api:latest

# 4. After recovery, verify
curl -fsS http://127.0.0.1:3030/v1/health/live
curl -fsS http://127.0.0.1:3030/v1/health | jq '.status'
```

A second `[TieTide] health check RECOVERED` email confirms `healthcheck-alert.sh` cleared its state file.

---

## AI service degraded

### Detect

- `/v1/health` returns 200 with `"status": "degraded"` and `"ai": "disconnected"`.
- `POST /v1/workflows/:id/generate-docs` returns 502/503.

### Diagnose

```bash
docker logs --tail 200 tietide-ai
docker logs --tail 200 ollama       # the dependency container
curl -fsS http://127.0.0.1:8000/health   # AI service direct
curl -fsS http://localhost:11434/api/tags # Ollama direct
```

Most common causes:

1. **Ollama OOM** — Llama 3.1 8B needs ~8 GB. `docker stats` showing >90% memory on the ollama container is the smoking gun.
2. **Model not pulled** — `api/tags` returns an empty list. Re-run `docker compose exec ollama ollama pull llama3.1:8b`.
3. **ChromaDB volume corruption** — `tietide-ai` logs show RAG retrieval errors. Restart the container; if persistent, wipe and re-ingest.

### Recover

```bash
docker restart ollama tietide-ai
# Wait ~30 s for Ollama to load the model, then:
curl -fsS http://127.0.0.1:3030/v1/health | jq '.checks.ai'
```

The platform can run **without** the AI service — only doc generation breaks. If recovery is going to take hours, communicate that workflows still execute normally; do not page beyond business hours unless doc-gen is on a contract SLA.

---

## Queue stuck

Symptom: API returns 202 from `POST /v1/workflows/:id/execute` but executions never transition past `pending`.

### Detect

```bash
# Inspect Valkey directly
docker compose -f infra/docker/docker-compose.yml exec valkey valkey-cli

# Inside valkey-cli:
KEYS bull:workflow-execution:*       # active queue keys
LLEN bull:workflow-execution:wait    # jobs waiting to be picked up
LLEN bull:workflow-execution:active  # jobs currently being processed
LLEN bull:workflow-execution:failed
LLEN bull:workflow-execution-dlq:wait
```

Queue names are defined in `apps/api/src/executions/execution-queue.constants.ts` and `apps/worker/src/cron/cron.constants.ts`:

- `workflow-execution` — primary execution queue
- `cron-trigger` — cron firings (which then enqueue to `workflow-execution`)
- `workflow-execution-dlq` — exhausted retries (3 attempts, exponential backoff)

### Diagnose

```bash
# Is the worker running and connected?
docker logs --tail 100 tietide-worker | grep -E "BullMQ|Redis|connection"

# Is the worker consuming?
docker compose -f infra/docker/docker-compose.yml exec valkey valkey-cli \
  CLIENT LIST | grep -i bull
```

If `wait` is climbing and `active` is zero, the worker is not consuming — it has crashed, lost its Valkey connection, or hit the concurrency limit (`WORKER_CONCURRENCY=5` by default).

### Recover

```bash
# Easy path: kick the worker
docker restart tietide-worker
docker logs -f tietide-worker | head -100

# If a single poison job is jamming the worker (rare — the engine catches and routes to DLQ),
# move it manually:
docker compose -f infra/docker/docker-compose.yml exec valkey valkey-cli
> LRANGE bull:workflow-execution:active 0 -1   # find the job ID
> LREM bull:workflow-execution:active 0 <job-id>
```

After recovery, watch `wait` drain. If it doesn't, scale the worker concurrency in `.env` (`WORKER_CONCURRENCY=10`) and restart.

---

## Stuck in DLQ

A job hits the dead-letter queue when it fails its 3 attempts. `bull:workflow-execution-dlq:*` keys keep growing.

### Diagnose

```bash
# Inspect DLQ contents
docker compose -f infra/docker/docker-compose.yml exec valkey valkey-cli
> LRANGE bull:workflow-execution-dlq:wait 0 5
```

Each entry carries the original payload (`executionId`, `workflowId`, `userId`) and the error chain. Cross-reference `executionId` with `WorkflowExecution.status='FAILED'` in PostgreSQL to see step-level errors:

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres \
  psql -U tietide -d tietide -c \
  "SELECT id, status, finishedAt FROM \"WorkflowExecution\" WHERE id='<executionId>';"
```

### Recover

DLQ entries are intentionally not auto-replayed (`removeOnComplete: false` — see CLAUDE.md §7 "Dead Letter Queue"). The right move depends on root cause:

1. **Transient** (network blip, third-party 503) — replay by enqueueing a fresh execution from the SPA or via `POST /v1/workflows/:id/execute`.
2. **Workflow definition broken** (e.g. URL typo) — fix the workflow, then replay.
3. **Connector bug** — file an issue, leave the DLQ entry as evidence; do not bulk-clear.

To clear a single processed entry once the root cause is fixed:

```bash
> LREM bull:workflow-execution-dlq:wait 0 <serialized-job>
```

---

## Database restore

### Detect

- Data loss reported, or `/v1/health` reports `database: disconnected` and the volume is intact but corrupt.

### Diagnose

1. Confirm the database is actually broken — many "missing data" reports turn out to be a `userId` filter (every API query is scoped to the authenticated user; check the audit log first).
2. If the volume is wedged: stop dependent services so you can work on the DB cleanly.

```bash
docker stop tietide-api tietide-worker
```

### Recover

The full restore drill lives in [`infra/backups/README.md`](../infra/backups/README.md) section 2. Production-restore short version:

```bash
# 1. Take a defensive snapshot of the current volume
docker run --rm \
  -v tietide_postgres_data:/data \
  -v "$PWD":/backup alpine \
  tar -czf /backup/postgres-pre-restore-"$(date -u +%FT%TZ)".tgz -C /data .

# 2. Pick the last good encrypted dump
backup="$(ls -1t /var/backups/tietide/tietide-*.sql.gz.gpg | head -n1)"

# 3. Restore directly over the live database (note POSTGRES_DB=tietide, not the
#    safer default tietide_restore — only do this with explicit DR sign-off)
BACKUP_ENCRYPTION_KEY="$BACKUP_ENCRYPTION_KEY" \
POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
POSTGRES_DB=tietide \
  /opt/tietide/infra/scripts/restore-postgres.sh "$backup"

# 4. Re-apply migrations in case the dump predates the current schema
docker run --rm --network docker_default --env-file .env \
  tietide-api:latest pnpm --filter @tietide/api prisma migrate deploy

# 5. Bring services back
docker start tietide-api tietide-worker
curl -fsS http://127.0.0.1:3030/v1/health | jq
```

After the restore, **rotate `JWT_SECRET`**: every JWT issued after the dump's timestamp is now valid against the older user state, which can resurrect deleted accounts. A rotation forces all clients to reauthenticate.

---

## Disk pressure

### Detect

```bash
df -h /var/lib/docker /var/backups /var/log
docker system df
```

### Recover

```bash
# Reclaim Docker layers and unused volumes (review the prompt, do NOT --force blindly)
docker system prune

# Trim log files
docker logs --details tietide-api 2>/dev/null | wc -l
truncate -s 0 /var/log/tietide-backup.log /var/log/tietide-health-alert.log

# Tighten backup retention if dumps are eating disk
# (lower BACKUP_RETENTION_DAYS in .env, next backup run sweeps older files)
```

If `postgres_data` is the offender, run `VACUUM (FULL, ANALYZE);` from `psql` — but **only** during a maintenance window, it locks the table.

---

## Webhook HMAC failure

### Detect

External system reports `401 Unauthorized` on `POST /v1/webhooks/:path`.

### Diagnose

The webhook controller validates `X-TieTide-Signature` with `crypto.timingSafeEqual` (CLAUDE.md §10, hurdle #12). 401 means the computed HMAC did not match.

```bash
# Pull the webhook record
docker compose -f infra/docker/docker-compose.yml exec postgres \
  psql -U tietide -d tietide -c \
  "SELECT id, path, isActive FROM \"Webhook\" WHERE path='<path>';"
```

Common causes:

1. **Caller is hashing with the wrong secret** — the secret is per-webhook (`Webhook.hmacSecret`), not the global `WEBHOOK_HMAC_SECRET`.
2. **Caller is signing the parsed JSON instead of the raw body** — body-parsing changes whitespace, breaks the hash. The API uses `rawBody: true` (hurdle #24); the caller must sign exactly what they send on the wire.
3. **Webhook is `isActive=false`** — a soft-delete returns 401, not 404, intentionally.

### Recover

Send the per-webhook secret to the caller (it is shown in the SPA's webhook settings page). If they were signing the parsed body, point them at the documented contract — TieTide does not change the caller's bug for them.

---

## Rate limiter mis-tuned

### Detect

Real users get `429 Too Many Requests` from `/v1/auth/login` or `/v1/workflows`.

### Diagnose

```bash
docker exec tietide-api env | grep THROTTLE
# THROTTLE_TTL=60         (window in seconds)
# THROTTLE_LIMIT=100      (global per-IP per window)
# THROTTLE_AUTH_LIMIT=5   (auth endpoints — tighter)
```

Login is intentionally tight (5/min/IP) to stop credential stuffing. If a corporate NAT is putting many users behind one IP, that limit is too low for the topology — not a bug.

### Recover

For corporate-NAT cases, raise `THROTTLE_AUTH_LIMIT` carefully (e.g., 20) and restart the API. **Never disable** the limiter — it is the only thing standing between the auth endpoint and a brute-force attack.

```bash
# After editing .env
docker restart tietide-api
```

For everything else, the right answer is to fix the client — not loosen the server.

---

## When in doubt

1. Check `/v1/health` first — it is the cheapest signal.
2. Read the structured logs (`docker logs ...`) before reaching for `git revert`.
3. Open an incident note in `docs/incidents/<date>.md` (create the directory if it does not exist) — even a 5-line write-up turns into the next addition to this runbook.
4. If the incident is security-relevant (auth bypass, data exposure), treat it like a P0 even when traffic looks normal: rotate `JWT_SECRET` and `ENCRYPTION_MASTER_KEY` once the system is stable, then file the incident note.
