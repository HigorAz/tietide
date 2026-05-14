# Deploying TieTide to a Hostinger VPS

> Audience: Operator deploying TieTide to a Hostinger account (Higor for the MVP).
> Time: ~60–90 minutes the first time, including DNS propagation.

This guide is the Hostinger-specific layer on top of [docs/deployment.md](deployment.md). It tells you how to **get to a working Ubuntu host with your domain pointing at it**, then hands off to the generic deployment guide for the Docker Compose stack, TLS, backups, and operational scripts.

## ⚠️ Hostinger product matters

| Plan                                                             | Can host TieTide?       | Why                                                                                        |
| ---------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| **Hostinger Web Hosting** (Premium, Business) — shared PHP/MySQL | ❌ No                   | Shared hosting can't run Docker, NestJS, or background workers. Don't waste time.          |
| **Hostinger Cloud Hosting**                                      | ❌ No (same constraint) | Still a managed PHP/web environment; no root, no Docker.                                   |
| **Hostinger VPS Hosting** (KVM 1 / 2 / 4 / 8)                    | ✅ Yes                  | Full root, Ubuntu, runs Docker. **This is the only viable Hostinger product for TieTide.** |

If you're on a Web Hosting plan, you'll need to upgrade to a VPS plan before continuing.

## Sizing

TieTide's full stack (Postgres + Valkey + API + Worker + SPA + AI service + ChromaDB + Ollama) wants ~16 GB RAM because of the local Llama 3.1 8B model. Match this against Hostinger's KVM tiers:

| Plan  | vCPU | RAM   | Disk        | Runs full TieTide?                                                                       |
| ----- | ---- | ----- | ----------- | ---------------------------------------------------------------------------------------- |
| KVM 1 | 1    | 4 GB  | 50 GB NVMe  | ❌ Even without Ollama, tight.                                                           |
| KVM 2 | 2    | 8 GB  | 100 GB NVMe | ⚠️ Yes if you skip Ollama (point `OLLAMA_BASE_URL` at a remote host or disable AI docs). |
| KVM 4 | 4    | 16 GB | 200 GB NVMe | ✅ Recommended — runs Ollama locally with headroom.                                      |
| KVM 8 | 8    | 32 GB | 400 GB NVMe | ✅ Comfortable + room for future workloads.                                              |

For the MVP demo, **KVM 4 with Ubuntu 24.04 LTS** is the sweet spot. If you go smaller, the [docs/deployment.md](deployment.md) §1 note about pointing `OLLAMA_BASE_URL` at a remote GPU applies.

## Steps

### 1. Buy or provision the VPS

1. Log in to <https://hpanel.hostinger.com/>.
2. **VPS** → **Order VPS** (or pick an existing one you've already paid for).
3. Plan: **KVM 4** (or larger). Region: pick one closest to you / your demo audience.
4. **Operating system**: choose **Ubuntu 24.04** (or 22.04 — both are listed in [docs/deployment.md](deployment.md) §1). Avoid the "Ubuntu + control panel" presets (CyberPanel, hPanel-on-VPS, etc.) — they install software that conflicts with Docker port 80/443.
5. **Hostname**: anything, e.g. `tietide-prod`.
6. **Root password**: generate a strong one and stash it in your password manager. You'll also add an SSH key in step 2.
7. Confirm the order → wait ~5 minutes for provisioning.

When done, hPanel shows the VPS's **public IPv4** address. Note it.

### 2. Add your SSH key

Password-only SSH is fine for the first 5 minutes; switch to keys immediately afterwards.

1. On your local machine, if you don't already have a key:
   ```powershell
   ssh-keygen -t ed25519 -C "higor@tietide-prod" -f $env:USERPROFILE\.ssh\id_ed25519_tietide
   ```
2. Copy the **public** key (`id_ed25519_tietide.pub`).
3. In hPanel → **VPS** → your VPS → **SSH Access** → paste the public key into **SSH keys** → save.
4. (Optional but recommended) **SSH Access** → toggle **Disable password authentication** → save. From here only key-holders can log in.

### 3. Connect to the VPS

```powershell
ssh -i $env:USERPROFILE\.ssh\id_ed25519_tietide root@<your-vps-ip>
```

Accept the host fingerprint. You should land at `root@tietide-prod:~#`.

> **Tip**: hPanel also has a **Browser Terminal** under the VPS → Overview tab. Useful for emergency access if you lose your SSH key, but the local terminal is faster for day-to-day work.

### 4. Create a non-root user

Running everything as root is a footgun. Add a regular user and use `sudo` for installs:

```bash
adduser tietide
usermod -aG sudo tietide

# Copy your SSH key over so you can ssh in as the new user
mkdir -p /home/tietide/.ssh
cp /root/.ssh/authorized_keys /home/tietide/.ssh/authorized_keys
chown -R tietide:tietide /home/tietide/.ssh
chmod 700 /home/tietide/.ssh
chmod 600 /home/tietide/.ssh/authorized_keys
```

Log out and reconnect as `tietide` from now on:

```powershell
ssh -i $env:USERPROFILE\.ssh\id_ed25519_tietide tietide@<your-vps-ip>
```

### 5. Open the firewall

Hostinger VPS plans don't enable an external firewall by default, but Ubuntu's `ufw` is worth enabling so nothing besides SSH/HTTP/HTTPS is reachable.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable        # confirm with y
sudo ufw status
```

⚠️ **Do not allow** ports 5432 (Postgres) or 6379 (Valkey) on the public interface. The Docker Compose file maps them to localhost by default — keep it that way.

If you also want Hostinger's network-level firewall (hPanel → VPS → Firewall), the rule set is identical: allow 22, 80, 443; deny everything else.

### 6. Point your domain at the VPS

If your domain is registered with Hostinger:

1. hPanel → **Domains** → pick your domain → **DNS / Nameservers** tab.
2. Make sure the domain uses Hostinger's nameservers (`ns1.dns-parking.com` / `ns2.dns-parking.com`). For external registrars, point them at the IP via your registrar's DNS panel instead.
3. **Manage DNS records** → add (or edit) these:
   | Type | Name | Content | TTL |
   |------|------|---------|-----|
   | A | `@` | `<your-vps-ip>` | 14400 |
   | A | `www` | `<your-vps-ip>` | 14400 |
4. Save.

DNS propagation typically takes 5–60 minutes. Verify with:

```bash
dig +short your-domain.com
# Expected: <your-vps-ip>
```

If you want a sub-domain like `app.your-domain.com`, add an A record for `app` instead of (or in addition to) `@`.

### 7. Hand off to docs/deployment.md

From here, every step lives in the generic deployment guide. Follow it in order:

1. **[deployment.md §2 — Prerequisites](deployment.md#2-prerequisites-on-the-vps)** — install Docker Engine + Compose plugin. Run the commands as the `tietide` user with `sudo`.
2. **[§3 — Clone & configure](deployment.md#3-clone--configure)** — clone your fork into `/opt/tietide`, populate `.env`. Use `your-domain.com` (the one you wired up in step 6 above) for `DOMAIN`, `SPA_BASE_URL`, and every `*_OAUTH_REDIRECT_URI`.
3. **[§3.3 — OAuth2 provider registration](deployment.md#33-oauth2-provider-registration)** — register each OAuth provider you want. The per-provider walkthroughs in [docs/Connection-setup/](Connection-setup/) cover this in more detail; specifically the OAuth guides (Google, Microsoft, Slack, Notion, HubSpot) all show how to add **both** `localhost` and `https://your-domain.com` redirect URIs on the same OAuth app — do that now so you can keep using localhost for dev work after deploying.
4. **[§4 — Bring the dependencies up](deployment.md#4-bring-the-dependencies-up)** — Postgres / Valkey / Ollama / ChromaDB containers.
5. **[§5 — Build & run the apps](deployment.md#5-build--run-the-apps)** — API, Worker, AI, SPA.
6. **[§6 — Reverse proxy + TLS](deployment.md#6-reverse-proxy--tls)** — Traefik or nginx + Let's Encrypt. Hostinger does **not** provision free TLS for VPS instances (that's a Web Hosting feature only), so you handle TLS yourself with the reverse-proxy setup in the deployment guide.
7. **[§7 — Operational scripts](deployment.md#7-operational-scripts)** — daily backup + health alerts.
8. **[§8 — Smoke test](deployment.md#8-smoke-test-the-deployment)** — `curl https://your-domain.com/v1/health`.

## Hostinger-specific gotchas

### TLS / certbot

Hostinger's "Free SSL Certificate" feature only applies to **Web Hosting** plans (where they manage the proxy). On a VPS you provision your own — the reverse-proxy section of [docs/deployment.md](deployment.md#6-reverse-proxy--tls) uses Traefik + ACME or nginx + `acme-companion`, both of which obtain free Let's Encrypt certs automatically. Port 80 (used for the HTTP-01 challenge) must be open — step 5 above already does this.

### Snapshots and backups

hPanel → VPS → **Snapshots** lets you take a one-click image of the whole VPS — useful before major upgrades. **This does not replace the PostgreSQL backup cron in [deployment.md §7.1](deployment.md#71-daily-encrypted-postgresql-backup)** — VPS snapshots are coarse (whole-disk, infrequent), the cron is fine-grained (encrypted SQL dumps, daily, retention-managed). Run both.

### Hostinger's auto-installer scripts

Many of Hostinger's one-click installs (Docker Compose, n8n, etc.) drop in pre-built compose files at `/root/docker-compose.yml`. **Don't use them for TieTide** — they conflict with the `/opt/tietide/infra/docker/docker-compose.yml` we clone in step 7. Provision a clean Ubuntu and follow this guide instead.

### IPv6

Hostinger VPS plans include IPv6 by default. The deployment guide doesn't depend on IPv6, but if you want it: add an AAAA record alongside the A record in step 6, and confirm `docker network ls` shows IPv6 enabled (`sudo docker network inspect bridge` → look for `EnableIPv6: true`).

### Domain still pointing elsewhere?

If your domain was previously hosted somewhere else (a static site, a parked page), DNS may take longer to propagate because clients cache the old TTL. To force-flush locally:

```powershell
ipconfig /flushdns
```

On the VPS itself it's not a concern — the VPS resolves your own domain via Hostinger's resolvers, which update immediately.

## Disaster recovery

If you ever need to rebuild the whole VPS:

1. hPanel → VPS → **Reinstall OS** (or provision a fresh one).
2. Restore step 2 (SSH key) and step 4 (`tietide` user).
3. `cd /opt/tietide && git clone <your-fork> .`
4. Restore the most recent `pg_dump` from `${BACKUP_DIR}` — see [infra/backups/README.md](../infra/backups/README.md) §2 for the decrypt + restore commands.
5. Copy the original `.env` from your password manager (or re-generate secrets — but anything encrypted with the old `ENCRYPTION_MASTER_KEY` is unrecoverable).
6. Bring the stack back up per [deployment.md §4–§5](deployment.md#4-bring-the-dependencies-up).

The whole rebuild is ~30 minutes if your backups are healthy and your password-manager entries are complete. Practice it once before you need it.
