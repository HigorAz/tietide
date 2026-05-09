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

### 3.3 OAuth2 provider registration

Each provider you want to enable requires registering an OAuth client at the provider's developer console and pasting the resulting client id + secret into the `.env` file. The redirect URI must be `https://<your-domain>/v1/connections/oauth/callback?provider=<provider-id>` and must be entered verbatim (provider-side exact-match validation).

#### Google

1. Open https://console.cloud.google.com/apis/credentials
2. **Create credentials → OAuth client ID → Web application**
3. Authorized redirect URI: `https://<DOMAIN>/v1/connections/oauth/callback?provider=google`
4. Copy the generated client id and secret into:
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`
   - `GOOGLE_OAUTH_REDIRECT_URI=https://<DOMAIN>/v1/connections/oauth/callback?provider=google`
5. Enable the APIs you plan to call (Gmail API, Calendar API, Drive API, etc.) under **APIs & Services → Library**.

#### Microsoft (Entra)

1. Open https://entra.microsoft.com → **Identity → App registrations → New registration**
2. **Supported account types**: choose multitenant (`AzureADMultipleOrgs`) for `MS_OAUTH_TENANT=common`, or single-tenant if locking to your own tenant id.
3. **Redirect URI** (Web): `https://<DOMAIN>/v1/connections/oauth/callback?provider=microsoft`
4. After creating the app, go to **Certificates & secrets → New client secret** and copy the secret value.
5. Paste into:
   - `MS_OAUTH_CLIENT_ID` (Application (client) ID)
   - `MS_OAUTH_CLIENT_SECRET` (the secret value, not the secret id)
   - `MS_OAUTH_REDIRECT_URI`
   - `MS_OAUTH_TENANT=common` (or a specific tenant id)
6. Under **API permissions**, grant the delegated scopes you intend to expose (e.g. `Mail.Read`, `Calendars.ReadWrite`). The platform's allowlist is enforced server-side too — see `apps/api/src/connections/oauth/providers/microsoft.provider.ts`.

#### Slack

1. Open https://api.slack.com/apps → **Create New App → From scratch**
2. **OAuth & Permissions** → add a Redirect URL: `https://<DOMAIN>/v1/connections/oauth/callback?provider=slack`
3. Add the bot/user scopes you want to expose (`chat:write`, `channels:read`, etc.).
4. **Basic Information** → copy Client ID + Client Secret into:
   - `SLACK_OAUTH_CLIENT_ID`
   - `SLACK_OAUTH_CLIENT_SECRET`
   - `SLACK_OAUTH_REDIRECT_URI`
5. Slack tokens do not expire by default — the worker's refresh job is a no-op for them.

#### Notion

1. Open https://www.notion.so/my-integrations → **New integration**
2. Choose **Public** integration type.
3. Set Redirect URI: `https://<DOMAIN>/v1/connections/oauth/callback?provider=notion`
4. Copy OAuth client ID + secret into:
   - `NOTION_OAUTH_CLIENT_ID`
   - `NOTION_OAUTH_CLIENT_SECRET`
   - `NOTION_OAUTH_REDIRECT_URI`
5. Notion tokens do not expire and there is no refresh token — the worker's refresh job is a no-op.

#### Important: time sync

The OAuth state JWT has a 10-minute TTL. If the VPS clock drifts more than a few seconds the callback will reject otherwise-valid states. Ensure `chronyd`/`systemd-timesyncd` is running.

```bash
timedatectl status        # NTP synchronized: yes
```

### 3.4 AI connector setup (Anthropic, OpenAI, Ollama)

The `claude-messages`, `openai-chat-completion`, and `ollama-generate` action nodes use **per-user API_KEY connections** stored encrypted at rest (libsodium XChaCha20-Poly1305) via the `Connection` model. Anthropic and OpenAI keys are **never** placed in `.env` — each user (or admin) creates a connection from `Settings → Connections` in the SPA and pastes their own key.

#### Anthropic (Claude)

1. Generate a key at https://console.anthropic.com/settings/keys.
2. In TieTide: `Settings → Connections → New connection → provider: Anthropic` → paste the `sk-ant-…` key. Click **Test connection** (calls `GET https://api.anthropic.com/v1/models` with `x-api-key`); a green status confirms the key is valid.
3. The default node model is `claude-sonnet-4-6`. The `model` field on each Claude node is free-text so you can pin to specific snapshots (e.g. `claude-opus-4-7`) without code changes.
4. **Prompt caching** (`enablePromptCaching: true` on the node) wraps the system prompt in `cache_control: { type: 'ephemeral' }`. Anthropic only writes to the cache when the cached prefix exceeds the model's minimum size (~1024 tokens for Sonnet); below that the marker is silently ignored.

#### OpenAI

1. Generate a key at https://platform.openai.com/api-keys.
2. In TieTide: `Settings → Connections → New connection → provider: OpenAI` → paste the `sk-…` key. Optionally fill in `organization` if your OpenAI account uses one. Click **Test connection** to verify against `GET /v1/models`.
3. Default model on the node is `gpt-4o`; override per-node as needed.

#### Ollama (self-hosted)

1. Decide where the Ollama server runs — same host as the worker, a remote GPU box, or the bundled Docker service. The compose stack includes an `ollama` service reachable at `http://ollama:11434` from the worker network.
2. In TieTide: `Settings → Connections → New connection → provider: Ollama` → fill in:
   - `baseUrl`: `http://ollama:11434` (Docker network) or `http://your-gpu-host:11434` (remote).
   - `model`: the default model identifier, e.g. `llama3.1:8b`. The Ollama node accepts a per-node `model` override that falls back to this connection-level default.
3. Click **Test connection** — `GET ${baseUrl}/api/tags` is called; a green status confirms the server is reachable and lists installed models.
4. Ollama is the only AI provider that **does not** require a hosted API key. The `OLLAMA_BASE_URL` env var is still used by the AI service (`apps/ai`) for its docs-generation pipeline, but workflow nodes always use the per-connection `baseUrl`.

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

The SPA route specifically also needs:

- `Cross-Origin-Opener-Policy: same-origin-allow-popups` — required for the OAuth popup → opener `postMessage` bridge on `/connections`. Google's consent screen sets `same-origin` COOP on its own response, which can sever `window.opener`; without `same-origin-allow-popups` on the SPA, the popup can't notify the opener and the connections list won't refresh after a successful OAuth flow.

Example Nginx snippet for the SPA:

```nginx
location / {
  add_header Cross-Origin-Opener-Policy "same-origin-allow-popups" always;
  add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
  add_header X-Frame-Options "DENY" always;
  try_files $uri /index.html;
}
```

The Vite dev server already sets this header in development (`apps/spa/vite.config.ts`).

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

---

## 11. Google Cloud OAuth app setup (for the Google connector pack)

The 8 Google connector nodes (Gmail, Drive, Sheets, Docs, Calendar) all share a single OAuth 2.0 Web Application client. Each user creates their own Google `Connection` through the SPA, which redirects them through Google's consent screen and stores the granted access + refresh tokens encrypted at rest.

### 11.1. Enable Google APIs

In the [Google Cloud Console](https://console.cloud.google.com/), select (or create) a project, then enable each API your deployment will use:

- Gmail API — `gmail.googleapis.com`
- Google Drive API — `drive.googleapis.com`
- Google Sheets API — `sheets.googleapis.com`
- Google Docs API — `docs.googleapis.com`
- Google Calendar API — `calendar.googleapis.com`

You only need the APIs whose nodes you intend to use, but enabling all five upfront avoids surprise 403s the first time a user tries a new node type.

### 11.2. Configure the OAuth consent screen

1. Navigate to **APIs & Services → OAuth consent screen**.
2. **User type**: choose `External` (or `Internal` for a Workspace-only deployment).
3. Fill in the app name (e.g., "TieTide"), user support email, and developer contact.
4. **Scopes** — leave the OAuth-consent-screen scope list empty. TieTide requests scopes per-flow, not as a fixed app-level set. The current allow-list is in `apps/api/src/connections/oauth/providers/google.provider.ts` (`ALLOWED_SCOPES`), which includes:
   - `openid`, `email`, `profile` (always granted on first connect)
   - `https://www.googleapis.com/auth/gmail.readonly|.send|.modify`
   - `https://www.googleapis.com/auth/drive|.readonly|.file`
   - `https://www.googleapis.com/auth/spreadsheets|.readonly`
   - `https://www.googleapis.com/auth/documents|.readonly`
   - `https://www.googleapis.com/auth/calendar|.readonly|.events`
5. **Test users** — while the consent screen is in `Testing` mode, add the Google accounts that will use the deployment. Move to `In production` once verified.

### 11.3. Create the OAuth 2.0 client credentials

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. **Application type**: `Web application`.
3. **Name**: e.g., "TieTide Web Client".
4. **Authorized redirect URIs**: add `https://tietide.example.com/v1/connections/oauth/callback?provider=google` (replace with your real public hostname; for local development add `http://localhost:3030/v1/connections/oauth/callback?provider=google` as a second URI).
5. Click **Create** and copy the generated **Client ID** and **Client Secret**.

### 11.4. Wire the credentials into the deployment

Add (or update) these variables in your deployment's `.env`:

```bash
GOOGLE_OAUTH_CLIENT_ID=<the client id from 11.3>
GOOGLE_OAUTH_CLIENT_SECRET=<the client secret from 11.3>
GOOGLE_OAUTH_REDIRECT_URI=https://tietide.example.com/v1/connections/oauth/callback?provider=google
```

The redirect URI in the env var **must exactly match** one of the URIs registered with the OAuth client; Google rejects mismatches with `redirect_uri_mismatch`. Recreate the API and worker containers after editing `.env` so the new values are loaded.

### 11.5. Verify

1. Open `https://tietide.example.com/connections` in the SPA.
2. Click "Connect Google", complete consent in the popup.
3. The connection appears with status `ACTIVE` and the granted scope string.
4. Build a workflow with a Manual trigger → Gmail Send (recipient = your own address). Run it. Email arrives, no `Bearer` tokens leak in `apps/worker/logs/*`.

If users need additional scopes (e.g., a connection was created for `gmail.send` only and they later add a Drive node), have them create a new Google connection from `/connections` with the broader scope set; the editor's `ConnectionPicker` filters by `provider=google` and lists all of the user's Google connections.

---

## 12. Azure AD / Entra ID OAuth app setup (for the Microsoft 365 connector pack)

The 5 Microsoft 365 connector nodes (Outlook send/search, Excel append/read, OneDrive create) share a single Microsoft Graph OAuth 2.0 application. Each user creates their own Microsoft `Connection` through the SPA, which redirects them through the Microsoft consent screen and stores the granted access + refresh tokens encrypted at rest.

### 12.1. Register an app in Microsoft Entra

1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com/) → **Applications → App registrations → New registration**.
2. **Name**: e.g., "TieTide".
3. **Supported account types**: choose `Accounts in any organizational directory and personal Microsoft accounts (multitenant)`. Use a single-tenant option only if you control every account that will connect.
4. **Redirect URI**: select `Web` and enter `https://tietide.example.com/v1/connections/oauth/callback?provider=microsoft` (replace with your real public hostname; for local development add `http://localhost:3030/v1/connections/oauth/callback?provider=microsoft` as a second redirect URI under **Authentication → Web → Add URI** after creation).
5. Click **Register** and copy the **Application (client) ID** from the overview page.

### 12.2. Create a client secret

1. **Certificates & secrets → Client secrets → New client secret**.
2. Set a description and expiry (24 months is reasonable).
3. Copy the **Value** (shown once) — this is the client secret. The **Secret ID** is not the secret.

### 12.3. Grant Microsoft Graph delegated permissions

1. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**.
2. Add the scopes the connector pack requests. The current allow-list lives in `apps/api/src/connections/oauth/providers/microsoft.provider.ts` (`ALLOWED_SCOPES`), and the per-node requirements are:
   - `User.Read` (always granted; used by the connection-test health check)
   - `offline_access` (always granted; required to receive a refresh token)
   - `Mail.Send` — Outlook Send
   - `Mail.Read` — Outlook Search
   - `Files.ReadWrite` — Excel Append, OneDrive Create
   - `Files.Read` — Excel Read
   - `Calendars.Read` / `Calendars.ReadWrite` — reserved for future calendar nodes (safe to skip if you only use the S14 pack)
3. Click **Grant admin consent** if your tenant requires it (otherwise the first end user to connect will be prompted for consent on the popup).

### 12.4. Wire the credentials into the deployment

Add (or update) these variables in your deployment's `.env`:

```bash
MS_OAUTH_CLIENT_ID=<the application (client) id from 12.1>
MS_OAUTH_CLIENT_SECRET=<the client secret value from 12.2>
MS_OAUTH_REDIRECT_URI=https://tietide.example.com/v1/connections/oauth/callback?provider=microsoft
# 'common' lets both work and personal Microsoft accounts connect; set to your
# directory's tenant id for a single-tenant deployment.
MS_OAUTH_TENANT=common
```

The redirect URI in the env var **must exactly match** one of the URIs registered on the app's **Authentication** blade; Microsoft rejects mismatches with `AADSTS50011`. Recreate the API and worker containers after editing `.env` so the new values are loaded.

### 12.5. Verify

1. Open `https://tietide.example.com/connections` in the SPA.
2. Click "Connect Microsoft", complete consent in the popup.
3. The connection appears with status `ACTIVE` and the granted scope string.
4. Build a workflow with a Manual trigger → Outlook Send (recipient = your own address). Run it. Email arrives, no `Bearer` tokens leak in `apps/worker/logs/*`.

If users need additional scopes (e.g., a connection was created for `Mail.Send` only and they later add an Excel node), have them create a new Microsoft connection from `/connections` with the broader scope set; the editor's `ConnectionPicker` filters by `provider=microsoft` and lists all of the user's Microsoft connections.

## 13. Optional: Gmail Pub/Sub setup (for the `gmail-message-received` push trigger)

The `gmail-message-received` trigger uses [Gmail's `users.watch`](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch) feature, which requires Cloud Pub/Sub. **Most users should skip this section and pick `gmail-label-added` instead** — it's a simpler poll-based alternative that needs no extra GCP plumbing.

If you do want push:

1. **Create a Pub/Sub topic** in your GCP project:
   - Console: <https://console.cloud.google.com/cloudpubsub/topic/create>
   - Name: `gmail-watch` (or whatever you prefer). Full path is `projects/<project-id>/topics/gmail-watch`.

2. **Grant Gmail's push service account permission to publish to the topic**:
   - On the topic page, click **Permissions → Add Principal**.
   - Principal: `gmail-api-push@system.gserviceaccount.com`
   - Role: `Pub/Sub Publisher`
   - Save.

3. **Create a Pub/Sub subscription with HTTPS push delivery** to your TieTide API:
   - Subscription name: anything (e.g., `gmail-to-tietide`).
   - Delivery type: **Push**.
   - Endpoint URL: `https://tietide.example.com/v1/provider-webhooks/google/<subscription-id>` — TieTide generates the `<subscription-id>` when the workflow is activated, so this URL must be templated. The simplest setup is one Pub/Sub subscription per workflow, configured after the workflow's `ProviderSubscription` row is created.
   - Authentication: **Enable authentication**, service account: any identity (Pub/Sub will sign the OIDC token; TieTide verifies that `email = gmail-api-push@system.gserviceaccount.com`).
   - Audience: leave blank (TieTide derives it from the callback URL).

4. **Configure the trigger** in the SPA:
   - Add a `Gmail: Message Received` node.
   - Pick a Google connection that has the `gmail.readonly` scope.
   - Pub/Sub topic name: `projects/<project-id>/topics/gmail-watch`.
   - Optional: filter by Gmail label IDs (`INBOX`, `STARRED`, custom).
   - Activate the workflow.

5. **Renewal**: Gmail watch channels expire after ~7 days. The hourly `subscription-renewer` job rotates them automatically (24-hour lookahead). No manual action needed.

If `users.watch` returns an error during activation, check that:

- The topic name is correct (`projects/<project-id>/topics/<topic-name>`).
- The `gmail-api-push@system.gserviceaccount.com` principal has the **Publisher** role on the topic.
- The Google connection's OAuth scope includes `https://www.googleapis.com/auth/gmail.readonly`.

## 14. Drive watch (`drive-file-added`)

The Drive trigger needs no extra setup — TieTide creates the watch channel via Drive's `files.watch` endpoint when the workflow is activated, and the renewer rotates it automatically before the 7-day cap. Inbound notifications are verified via `X-Goog-Channel-Token` (a 32-byte URL-safe random generated server-side and stored encrypted in `ProviderSubscription.secretEnc`).

For local development the public webhook URL needs to be reachable by Google — use [ngrok](https://ngrok.com/) or a similar tunnel:

```bash
ngrok http 3030
# Then set PUBLIC_API_URL=https://<ngrok-id>.ngrok-free.app in .env and restart
```

## 15. Communication connector pack

### 15.1 Slack app setup (actions + triggers)

The Slack connector pack uses one Slack App per user. Create the app at <https://api.slack.com/apps> → "From scratch", name it, attach to a workspace.

OAuth & Permissions:

- Add the redirect URL `${PUBLIC_API_URL}/v1/connections/oauth/callback` (the value of `SLACK_OAUTH_REDIRECT_URI`).
- Bot Token Scopes: pick from the allowed list — `chat:write`, `chat:write.public`, `channels:read`, `channels:history`, `groups:read`, `groups:history`, `im:read`, `im:history`, `mpim:read`, `mpim:history`, `users:read`, `users:read.email`, `files:read`, `files:write`, `reactions:read`, `reactions:write`, `app_mentions:read`. Request only what your workflows need.

For Slack triggers (`slack-message-received`, `slack-reaction-added`):

1. Open **Event Subscriptions** in the Slack App dashboard.
2. Set the Request URL to `${PUBLIC_API_URL}/v1/provider-webhooks/slack/<subscription-id>`. Slack sends a `url_verification` challenge — TieTide responds via `BasePushTrigger.handleValidation` before the subscription row is consulted.
3. Subscribe to bot events: `message.channels`, `app_mention`, and/or `reaction_added` based on the trigger types you'll use.
4. Copy the **Signing Secret** from the Basic Information page.
5. In TieTide, open the connection on `/connections`, edit it, and paste the signing secret. Slack triggers will fail to activate without it.

### 15.2 Discord (incoming webhook for actions)

For `discord-post-webhook`: in the Discord channel, **Edit channel → Integrations → Webhooks → New Webhook**. Copy the webhook URL — it has the form `https://discord.com/api/webhooks/<id>/<token>`. In TieTide, pick "Discord (Webhook)" on `/connections` and paste the URL into the form. The URL is encrypted at rest and validated against Discord's documented pattern at the boundary.

### 15.3 Discord (bot for triggers)

For `discord-message-received` (slash commands): create a Discord application at <https://discord.com/developers/applications>.

1. Go to **Bot** and reset the token; copy it.
2. Go to **General Information** and copy the **Application ID** and the **Public Key**.
3. Add the bot to a guild via the **OAuth2 → URL Generator** (scope: `bot applications.commands`).
4. In **General Information**, set the **Interactions Endpoint URL** to `${PUBLIC_API_URL}/v1/provider-webhooks/discord-bot/<subscription-id>`. Discord sends a signed PING — TieTide handles it via `handleValidation`. The URL only saves if PING succeeds; if Discord rejects the URL, check `PUBLIC_API_URL` is HTTPS and reachable.
5. In TieTide, pick "Discord (Bot)" on `/connections` and paste Application ID + Public Key + Bot Token.

**Limitation**: `discord-message-received` fires only on a registered slash command (default `/tietide-trigger`), not on every channel message. Discord exposes only the Interactions endpoint for HTTP-based bots; full message coverage would require a long-lived Gateway WebSocket connection (out of scope).

### 15.4 Twilio (SMS + WhatsApp + inbound)

For send actions and the inbound trigger:

1. Get an Account SID (`AC…`) and Auth Token from <https://console.twilio.com> → Account → API keys & tokens.
2. Buy or import a phone number under **Phone Numbers → Manage → Buy a number** for SMS sending.
3. In TieTide, pick "Twilio" on `/connections` and paste Account SID + Auth Token.

WhatsApp (sandbox path for the demo): the Twilio WhatsApp Sandbox `whatsapp:+14155238886` works without Meta approval — join via the sandbox setup page, then use that number as `from`. For production WhatsApp, you need a Meta-approved Content Template (`HX…` SID) — set `contentSid` and `contentVariables` in the node config.

For `twilio-sms-received`: the trigger calls Twilio's REST API on workflow activation to set `SmsUrl=${PUBLIC_API_URL}/v1/provider-webhooks/twilio/<sub-id>` on the IncomingPhoneNumber. Inbound SMS is HMAC-SHA1-signed by Twilio over `URL + sortedFormPairs`; TieTide verifies via `crypto.timingSafeEqual`. The phone number SID (`PN…`) is required in the trigger's node config — copy it from the Twilio Console phone-number page.

### 15.5 Telegram

Create a bot via [@BotFather](https://t.me/BotFather) on Telegram:

1. Send `/newbot`, follow prompts, copy the token (form: `<bot_id>:<secret>`).
2. In TieTide, pick "Telegram" on `/connections` and paste the bot token.

For send actions: chat IDs come from the Telegram Bot API (e.g. ask the bot to echo `chat.id`); channel handles like `@mychannel` also work for public channels.

For `telegram-message-received`: TieTide calls `setWebhook` on activation with our callback URL plus a server-generated `secret_token`. Telegram echoes the token in the `X-Telegram-Bot-Api-Secret-Token` header on every inbound update; TieTide constant-time compares it. On deactivation we call `deleteWebhook`. No extra dashboard configuration is required.

## 16. Productivity connector pack

Five new providers covering writing, kanban, spreadsheets, issue tracking, and source control. Notion uses OAuth (already wired in §3.3); the other four use API keys exchanged at the provider's dashboard.

### 16.1 Notion (OAuth — pages, databases, blocks)

Notion is already covered by the OAuth scaffolding (§3.3). Quick recap:

1. Register an integration at <https://www.notion.so/my-integrations> → **New integration**. Pick **Public** if you want non-workspace users to be able to authorise; **Internal** is fine for self-hosted single-workspace use.
2. Under **OAuth Domain & URIs**, add `${PUBLIC_API_URL}/v1/connections/oauth/callback`. Make sure the redirect URI matches `NOTION_OAUTH_REDIRECT_URI` exactly (including the `?provider=notion` suffix the env-default uses).
3. Copy **Client ID** and **Client Secret**, set `NOTION_OAUTH_CLIENT_ID` and `NOTION_OAUTH_CLIENT_SECRET`.
4. **Share the target database / page with the integration**: open the database in Notion, click the "•••" menu → **Connections** → add your integration. Without this step the API returns `object_not_found` (403/404).
5. In TieTide, pick "Notion" on `/connections`, complete the OAuth flow, then paste the database ID into the `notion-create-page` / `notion-query-database` node forms.

**Limitation**: Notion access tokens do not expire and cannot be refreshed. If a user revokes access, the connection must be reconnected — TieTide surfaces the underlying `NotionHttpError(401)` verbatim because there's no refresh path.

### 16.2 Trello (API key + user token)

Trello uses a developer key + per-user authorised token model rather than OAuth.

1. Visit <https://trello.com/app-key> while logged in to copy your **API Key**.
2. From the same page, click "Token" (or visit `https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&key=<APP_KEY>`) to mint a personal token. Choose `scope=read,write` (the actions need both); pick `never` for `expiration` if you want a long-lived token.
3. In TieTide, pick "Trello" on `/connections` and paste both **API Key** and **Token**. Both are encrypted at rest with libsodium and never returned by the API.
4. Find list IDs via the Trello UI URL (`https://trello.com/b/<board>/<name>` then append `.json` while logged in) or the Trello REST API.

Health check hits `GET /1/members/me?key=<…>&token=<…>` and returns `ok=false` with the upstream message on any non-2xx.

### 16.3 Airtable (Personal Access Token)

Airtable deprecated user API keys in 2024; PATs are the only supported flow.

1. Visit <https://airtable.com/create/tokens> and click **Create new token**.
2. Pick scopes: `data.records:read`, `data.records:write`, `schema.bases:read`. Add the bases the token should access (or grant access to all). The required scope set depends on which actions you'll use — list/create/update need both read and write.
3. Copy the token (form: `pat<id>.<secret>`) — Airtable shows it once.
4. In TieTide, pick "Airtable" on `/connections` and paste the token. The schema regex enforces the `pat…` prefix at the boundary.
5. Get base IDs from `https://airtable.com/api` while logged in (the URL changes to `https://airtable.com/<baseId>/api/docs` when you pick a base). Table names can be passed verbatim or as `tbl…` IDs.

Health check hits `GET /v0/meta/whoami` with `Authorization: Bearer <pat>`.

### 16.4 Linear (Personal API key)

1. In Linear, open **Settings → API → Personal API keys** and click **Create key**.
2. Copy the value (form: `lin_api_<base64>`). Linear shows it once.
3. In TieTide, pick "Linear" on `/connections` and paste the key. The schema enforces the `lin_api_` prefix.
4. Team and state IDs are UUIDs. Find a team UUID by querying the Linear GraphQL API: `query { teams { nodes { id name } } }`. State (workflow) UUIDs come from `query { workflowStates(filter: {team: {id: {eq: "<team>"}}}) { nodes { id name } } }`.

Linear's API uses GraphQL exclusively. The TieTide client posts mutations to `https://api.linear.app/graphql` and surfaces GraphQL `errors[].extensions.code === 'AUTHENTICATION_ERROR'` as HTTP 401 internally so the connector framework's auth path triggers if the connection ever gains a refresh token (today it doesn't).

Health check posts `{ viewer { id } }` and inspects `errors[]`.

### 16.5 GitHub (Personal Access Token)

GitHub supports both classic PATs (`ghp_…`) and fine-grained PATs (`github_pat_…`). Fine-grained is preferred for least-privilege.

1. Visit <https://github.com/settings/tokens?type=beta> for fine-grained, or `/settings/tokens` for classic.
2. **Fine-grained**: pick the repositories the token can access; grant `Issues: Read & write`, `Pull requests: Read & write`, `Contents: Read-only` (PR creation needs to read commits) under **Repository permissions**.
3. **Classic**: pick the `repo` scope (covers issues + PRs + comments).
4. Copy the token. In TieTide, pick "GitHub" on `/connections` and paste it. The schema accepts any GitHub token prefix (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`).
5. The actions take `owner`/`repo` strings (e.g. `octocat`/`hello-world`), not numeric IDs.

For installation tokens (GitHub Apps): generate a token via your App and paste it the same way. Token rotates every hour; TieTide will surface 401s when it expires — re-paste a fresh token, or build an App-token-rotation flow as a follow-up.

Health check hits `GET /user` with `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, and `X-GitHub-Api-Version: 2022-11-28`.
