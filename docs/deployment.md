# TieTide — Deployment Guide

How to deploy TieTide to a self-hosted VPS using Docker Compose.

> **Status**: MVP. The compose file at `infra/docker/docker-compose.yml` provisions only the **stateful dependencies** (PostgreSQL, Valkey, Ollama, ChromaDB, Mailhog). The `api`, `worker`, `spa`, and `ai` apps each ship a `Dockerfile` and are intended to be built and run alongside that stack — production compose extension is the operator's responsibility for now.

---

## 1. Target Environment

| Resource | Minimum                             | Recommended      |
| -------- | ----------------------------------- | ---------------- |
| CPU      | 4 vCPU                              | 8 vCPU           |
| RAM      | 8 GB (no AI) / 16 GB (with Ollama)  | 16 GB+           |
| Disk     | 40 GB SSD                           | 80 GB SSD        |
| OS       | Ubuntu 22.04 / Debian 12            | Ubuntu 24.04 LTS |
| Network  | Public IPv4, ports 80/443 reachable | + IPv6           |

> Running the local Llama 3.1 8B model **requires** ~8 GB RAM for the model alone. If the VPS is RAM-constrained, point `OLLAMA_BASE_URL` at a remote GPU host instead and skip the `ollama` service in compose.

---

## 2. Prerequisites on the VPS

```bash
# Install Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
newgrp docker

# Tools used by the operational scripts
sudo apt-get install -y git gpg curl gzip
```

Confirm the host:

```bash
docker --version          # >= 24
docker compose version    # >= 2.20
```

---

## 3. Clone & configure

```bash
sudo mkdir -p /opt/tietide
sudo chown "$USER":"$USER" /opt/tietide
cd /opt/tietide
git clone https://github.com/<your-fork>/tietide.git .

cp .env.example .env
```

Edit `.env`. **Never deploy with the placeholder values** — the production checklist below lists every variable that must change.

### 3.1 Generate strong secrets

```bash
# JWT_SECRET — 64 random bytes
openssl rand -base64 64

# ENCRYPTION_MASTER_KEY — 32 bytes, base64 encoded
openssl rand -base64 32

# WEBHOOK_HMAC_SECRET — 32 random bytes
openssl rand -hex 32

# BACKUP_ENCRYPTION_KEY — symmetric passphrase for pg_dump backups
openssl rand -base64 48
```

Store all four somewhere out-of-band (1Password, Bitwarden, etc.). **Losing `ENCRYPTION_MASTER_KEY` makes every stored secret unrecoverable; losing `BACKUP_ENCRYPTION_KEY` makes every backup unrecoverable.**

### 3.2 Production-only environment additions

Append to `.env` on the VPS (these are not in `.env.example` because they only matter once you leave localhost):

```bash
# Domain + Let's Encrypt (used by your reverse proxy)
DOMAIN=tietide.example.com
ACME_EMAIL=ops@example.com

# Override database hostnames so the apps reach the docker-network services,
# not localhost. Required if you containerize the apps.
DATABASE_URL=postgresql://tietide:${POSTGRES_PASSWORD}@postgres:5432/tietide?schema=public  # placeholder — interpolated from .env
REDIS_HOST=valkey
OLLAMA_BASE_URL=http://ollama:11434
CHROMA_HOST=chromadb
AI_SERVICE_URL=http://ai:8000

# Lock CORS to your real frontend origin
CORS_ORIGIN=https://tietide.example.com

# Rate limiting (production-tighter than dev)
THROTTLE_TTL=60
THROTTLE_LIMIT=60
THROTTLE_AUTH_TTL_MS=60000
THROTTLE_AUTH_LIMIT=5

# Backups (paths inside the VPS, not the container)
BACKUP_DIR=/var/backups/tietide
BACKUP_ENCRYPTION_KEY=...   # generated above
BACKUP_RETENTION_DAYS=14

# Health alerting via SMTP
ALERT_FROM=tietide-monitor@example.com
ALERT_TO=oncall@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=tietide-monitor@example.com
SMTP_PASSWORD=...
```

---

## 4. Bring the dependencies up

```bash
cd /opt/tietide
docker compose -f infra/docker/docker-compose.yml --env-file .env up -d

# Verify
docker compose -f infra/docker/docker-compose.yml ps
docker compose -f infra/docker/docker-compose.yml logs --tail=50 postgres valkey ollama chromadb
```

You should see all four services `healthy` (Mailhog has no health check; that is expected).

### 4.1 Pull an Ollama model

```bash
docker compose -f infra/docker/docker-compose.yml exec ollama ollama pull llama3.1:8b
```

The first pull is ~5 GB. The model is persisted in the `ollama_data` volume.

---

## 5. Build & run the apps

The four app images are not yet wired into the compose file. Build them with the provided Dockerfiles and run them on the same Docker network:

```bash
NETWORK=docker_default   # adjust if your compose project name differs

docker network ls | grep "$NETWORK"

# API
docker build -f apps/api/Dockerfile -t tietide-api:latest .
docker run -d --name tietide-api \
  --network "$NETWORK" \
  --env-file .env \
  -p 127.0.0.1:3030:3030 \
  tietide-api:latest

# Worker (no exposed port — pure consumer)
docker build -f apps/worker/Dockerfile -t tietide-worker:latest .
docker run -d --name tietide-worker --network "$NETWORK" --env-file .env tietide-worker:latest

# AI
docker build -f apps/ai/Dockerfile -t tietide-ai:latest .
docker run -d --name tietide-ai \
  --network "$NETWORK" \
  --env-file .env \
  -p 127.0.0.1:8000:8000 \
  tietide-ai:latest

# SPA — the Vite build is static; serve it from the reverse proxy or a tiny nginx
docker build -f apps/spa/Dockerfile -t tietide-spa:latest .
```

Bind app ports to `127.0.0.1` so only the reverse proxy (next section) can reach them.

### 5.1 Apply migrations

The `api` Dockerfile does not run migrations on boot. Apply them once on each deploy that ships a schema change:

```bash
docker exec -it tietide-api pnpm --filter @tietide/api prisma migrate deploy
```

(`migrate deploy` is the production-safe command — it never resets the database, never prompts.)

---

## 6. Reverse proxy + TLS

TieTide expects a reverse proxy in front of the API and SPA — Traefik or nginx-proxy with `acme-companion` are both fine. The minimum routing rules:

| External                                 | Internal           |
| ---------------------------------------- | ------------------ |
| `https://tietide.example.com/`           | SPA static bundle  |
| `https://tietide.example.com/v1/*`       | `tietide-api:3030` |
| `https://tietide.example.com/webhooks/*` | `tietide-api:3030` |

The AI service (`tietide-ai:8000`) must **not** be reachable from the internet — only the API needs to talk to it.

Required headers (Helmet sets these on the API automatically — keep them on at the proxy too):

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Content-Security-Policy` — start permissive, tighten once stable
- `X-Frame-Options: DENY`

---

## 7. Operational scripts

The `infra/scripts/` directory ships three production scripts. Copy them out of the repo and put them on the VPS at `/opt/tietide/infra/scripts/` (the clone in step 3 already places them there).

### 7.1 Daily encrypted PostgreSQL backup

```bash
sudo tee /etc/cron.d/tietide-backup > /dev/null <<'EOF'
0 3 * * *  tietide  /opt/tietide/infra/scripts/backup-postgres.sh >> /var/log/tietide-backup.log 2>&1
EOF
```

Reads from `.env`, writes encrypted dumps to `BACKUP_DIR`, sweeps anything older than `BACKUP_RETENTION_DAYS`. See [`infra/backups/README.md`](../infra/backups/README.md) for the full contract.

### 7.2 Health-check alerting

```bash
sudo tee /etc/cron.d/tietide-health-alert > /dev/null <<'EOF'
*/1 * * * *  tietide  /opt/tietide/infra/scripts/healthcheck-alert.sh >> /var/log/tietide-health-alert.log 2>&1
EOF
```

Sends one email when `/v1/health` starts failing and one when it recovers — the state file at `ALERT_STATE_FILE` suppresses re-sends during long outages.

### 7.3 Monthly restore drill

Document the result. The drill is described in [`infra/backups/README.md`](../infra/backups/README.md) section 2; do not skip it — an untested backup is not a backup.

---

## 8. Smoke test the deployment

```bash
# Liveness — should always be 200
curl -fsS https://tietide.example.com/v1/health/live

# Readiness — 200 if all deps connected, 503 if DB or Valkey down
curl -fsS https://tietide.example.com/v1/health | jq

# Auth round-trip
curl -fsS -X POST https://tietide.example.com/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"smoke@example.com","password":"smoke-test-password-please-rotate"}'
```

If `/v1/health` reports `degraded`, the database and queue are up but the AI service is unreachable — workflows will run, AI doc-generation will not. See the [runbook](runbook.md).

---

## 9. Production checklist

Before pointing real users at the deployment:

- [ ] All `.env` placeholders replaced — grep for `change-in-production`, `your-`, `base64-encoded-32-byte`.
- [ ] `JWT_SECRET`, `ENCRYPTION_MASTER_KEY`, `WEBHOOK_HMAC_SECRET`, `BACKUP_ENCRYPTION_KEY` rotated, stored out of band.
- [ ] PostgreSQL port (5432) and Valkey port (6379) **not** published on the public interface (the dev compose file maps them; either remove the `ports:` block in a `docker-compose.prod.yml` overlay or rely on the firewall).
- [ ] `CORS_ORIGIN` matches the real frontend domain — no `*`, no `localhost`.
- [ ] TLS reachable, HSTS preload eligible.
- [ ] Backup cron scheduled, first dump verified by listing `${BACKUP_DIR}`.
- [ ] First restore drill into `tietide_restore` completed and logged.
- [ ] Health-alert cron scheduled, manual `kill -STOP` of `tietide-api` confirms an email arrives.
- [ ] `pnpm audit --audit-level=high` clean on the deployed commit.
- [ ] Rate limiting active — confirm `429` after the configured threshold.

---

## 10. Updating a running deployment

```bash
cd /opt/tietide
git fetch --tags
git checkout v<next-tag>

# Rebuild only the apps that changed
docker build -f apps/api/Dockerfile    -t tietide-api:latest    .
docker build -f apps/worker/Dockerfile -t tietide-worker:latest .

# Apply migrations BEFORE swapping containers — additive only (CLAUDE.md §11)
docker run --rm --network "$NETWORK" --env-file .env \
  tietide-api:latest pnpm --filter @tietide/api prisma migrate deploy

# Recreate
docker rm -f tietide-api tietide-worker
docker run -d --name tietide-api    --network "$NETWORK" --env-file .env -p 127.0.0.1:3030:3030 tietide-api:latest
docker run -d --name tietide-worker --network "$NETWORK" --env-file .env tietide-worker:latest

# Smoke test
curl -fsS https://tietide.example.com/v1/health | jq
```

If `/v1/health` flips to `fail` after the swap, see the runbook's [service-down](runbook.md#api-or-worker-down) playbook before reaching for `git revert`.
