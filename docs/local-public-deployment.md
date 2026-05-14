# Running TieTide on Your Local Machine with a Public URL (WSL2 + Cloudflare Tunnel)

> Audience: Higor (or anyone) who already owns a domain but doesn't want to pay for a VPS, and wants TieTide isolated from their Windows install.
> Time: ~45 minutes the first time, including WSL2 install and DNS propagation.

This guide makes **your local laptop the server** while giving you a real public HTTPS URL on a domain you own. **Everything TieTide-related runs inside a Linux VM (WSL2) on Windows** — Postgres, Valkey, Ollama, the API, the SPA, and `cloudflared` itself. Your Windows install stays clean.

The path:

```
Internet → Cloudflare edge → cloudflared (inside WSL2) → localhost (inside WSL2) → TieTide
                                                                                      ↑
                                                                                 stays here
Windows host  ───────────────────────────────────────────────────────────────  no Linux services touch it
```

Compared to alternatives:

| Trade-off                         | Local + WSL2 + Cloudflare Tunnel                 | Hostinger VPS                 | Local + Windows-native (no VM)                        |
| --------------------------------- | ------------------------------------------------ | ----------------------------- | ----------------------------------------------------- |
| Cost                              | Free (you already own the domain)                | $5–25/month                   | Free                                                  |
| Always on                         | Only when machine is on                          | 24/7                          | Only when machine is on                               |
| TLS / HTTPS                       | Free, automatic (Cloudflare edge)                | You provision (Let's Encrypt) | Free, automatic                                       |
| Public IP needed                  | No                                               | Yes                           | No                                                    |
| Service isolation from your OS    | ✅ Linux VM                                      | ✅ Separate machine           | ❌ Postgres / Valkey / Ollama run as Windows services |
| Matches eventual VPS workflow 1:1 | ✅ Same Ubuntu commands                          | n/a                           | ❌ Windows-specific commands                          |
| Setup time                        | ~45 min                                          | ~60–90 min                    | ~30 min                                               |
| Suitable for                      | Personal demos, college MVP, small private group | Real users, longer hours      | Quick experimentation                                 |

## Why a VM (WSL2)? Honest take on security

WSL2 is a real Linux virtual machine running on Hyper-V — not a thin emulation layer. Putting TieTide inside it gives you:

- ✅ **Service isolation.** Postgres, Valkey, Ollama, and `cloudflared` run as Linux processes inside the VM. None of them register as Windows services or bind to your Windows network interfaces.
- ✅ **Filesystem isolation.** TieTide's source and the `.env` file (with your encryption master key) live on WSL's ext4 disk, not in `C:\Users\higor\...`. If something inside the VM is compromised, the attacker hits a Linux user account before they'd need a VM-escape to touch your Windows files.
- ✅ **Different attack surface.** Exploits against TieTide / its dependencies are Linux-targeted by nature; even a successful exploit doesn't directly compromise your Windows session.
- ✅ **Clean wipe.** `wsl --unregister Ubuntu-24.04` deletes the entire VM and its disk in one command. You can start over without uninstalling anything from Windows.
- ✅ **Practice for the eventual VPS.** Every command in this guide is the exact command you'd run on a Hostinger VPS later. Same `apt`, same `systemctl`, same paths.

What WSL2 **doesn't** protect against:

- ❌ **Vulnerabilities in your HTTPS-exposed endpoint.** If an attacker finds an SSRF, IDOR, or auth bypass in TieTide itself, the VM boundary doesn't help — they're hitting the API the same way a legitimate user would.
- ❌ **Compromised Cloudflare account.** Whoever controls your Cloudflare account can re-route the tunnel; the VM doesn't help.
- ❌ **Leaked `.env`.** The encryption master key in `.env` decrypts every stored credential. If it leaks, it leaks. Treat `~/tietide/.env` inside WSL with the same care you would on a VPS.

Net: WSL2 is a real and worthwhile improvement over running everything directly on Windows, but it's not a magic security wand. The bulk of your security posture comes from how TieTide itself handles auth and stored secrets — which is the same in either setup.

## What you give up

- **Your machine must be on.** Close the laptop, TieTide is down.
- **Your home internet's upload speed** is the bottleneck.
- **No automatic offsite backups.** Run the backup script from [`docs/deployment.md` §7.1](deployment.md#71-daily-encrypted-postgresql-backup) inside WSL and copy the encrypted dumps somewhere off-machine.

## Prerequisites

- Windows 10 (build 19041+) or Windows 11, with admin access.
- A domain registered somewhere (this guide uses `tietide.com` registered at Hostinger as the running example — substitute yours).
- A free Cloudflare account.
- ~15 GB free disk for the WSL VM + Docker images + dependencies.

## Steps

### 1. Install WSL2 (Ubuntu 24.04)

Open **PowerShell as Administrator** and run:

```powershell
wsl --install -d Ubuntu-24.04
```

This enables the WSL feature, installs the kernel update, downloads Ubuntu 24.04, and prompts you to create a Linux username and password the first time you open it. **Reboot if Windows asks you to.**

After reboot, open the **Ubuntu** app from the Start menu. Pick a username (e.g. `higor`) and password (this is your Linux sudo password, unrelated to your Windows password).

You'll land at:

```
higor@your-pc:~$
```

Everything from here happens inside this shell, **not** PowerShell.

### 2. Enable systemd inside WSL2

Required so `cloudflared` and other services can run as proper background daemons.

```bash
sudo tee /etc/wsl.conf > /dev/null <<'EOF'
[boot]
systemd=true

[interop]
appendWindowsPath=false
EOF
```

Then exit WSL (`exit`), and from PowerShell:

```powershell
wsl --shutdown
```

Reopen the Ubuntu app. Confirm systemd is up:

```bash
systemctl --version
ps -p 1 -o comm=
# Should print: systemd
```

> The `appendWindowsPath=false` line in `wsl.conf` keeps your Windows `PATH` out of the WSL shell. Minor security hardening — prevents an accidental call to a Windows binary from inside the VM.

### 3. Install base tooling and clone TieTide

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential ca-certificates gnupg lsb-release

# Node 20 via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# pnpm
curl -fsSL https://get.pnpm.io/install.sh | sh -
source ~/.bashrc
```

Clone TieTide **inside the WSL filesystem** (not under `/mnt/c/...` — keeping it on Linux ext4 is 10–50× faster for `pnpm install` and `git` operations, and it's the isolation point):

```bash
cd ~
git clone https://github.com/HigorAz/tietide.git
cd tietide
pnpm install
```

### 4. Install Docker Engine inside WSL2

For Postgres / Valkey / Ollama / ChromaDB. We install Docker Engine directly inside the VM rather than relying on Docker Desktop on Windows — that keeps the whole stack inside the WSL boundary.

```bash
# Add Docker's official repo
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Run docker without sudo
sudo usermod -aG docker $USER
# log out / log back in for the group change to take effect
exit
```

Reopen Ubuntu. Verify:

```bash
docker run --rm hello-world
```

### 5. Bring up TieTide's stateful dependencies

```bash
cd ~/tietide
cp .env.example .env
# We'll come back and finish .env in step 12; for now the placeholder values are fine.

docker compose -f infra/docker/docker-compose.yml --env-file .env up -d
docker compose -f infra/docker/docker-compose.yml ps   # all healthy
```

### 6. Create a free Cloudflare account and add `tietide.com`

This is web-based, no shell involved:

1. Sign up at <https://dash.cloudflare.com/sign-up>.
2. **+ Add a domain** → enter `tietide.com` (just the bare hostname — no `https://`, no path).
3. Pick the **Free** plan → **Continue**.
4. Cloudflare scans existing DNS records. Leave them as-is.
5. Cloudflare shows two **assigned nameservers** (e.g. `kate.ns.cloudflare.com`, `tom.ns.cloudflare.com`). Copy both.

### 7. Point your Hostinger domain at Cloudflare's nameservers

1. <https://hpanel.hostinger.com/> → **Domains** → `tietide.com` → **DNS / Nameservers**.
2. Switch to **Custom nameservers** and paste the two from step 6.
3. **Save**.

Verify (from inside WSL — Linux's `dig` is more pleasant than `nslookup`):

```bash
sudo apt install -y dnsutils
dig +short NS tietide.com
```

When the response includes the two Cloudflare nameservers, continue. Cloudflare also emails you when activation completes (usually 5 min to 1 hour).

### 8. Install `cloudflared` inside WSL

```bash
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | \
  sudo tee /etc/apt/sources.list.d/cloudflared.list

sudo apt update
sudo apt install -y cloudflared
cloudflared --version
```

### 9. Authenticate `cloudflared`

```bash
cloudflared tunnel login
```

A URL prints in the shell — Ctrl-click it (or copy/paste into your Windows browser). Sign in to Cloudflare, pick `tietide.com`. `cloudflared` writes a certificate to `~/.cloudflared/cert.pem`. Keep that file safe; it acts like an API token for tunnel management.

### 10. Create a named tunnel

```bash
cloudflared tunnel create tietide
```

Output includes a UUID and the path to a credentials JSON, e.g. `~/.cloudflared/<uuid>.json`. Note the UUID.

### 11. Configure ingress

Create `~/.cloudflared/config.yml`. Replace `<uuid>` with the value from step 10:

```bash
cat > ~/.cloudflared/config.yml <<'EOF'
tunnel: <uuid>
credentials-file: /home/higor/.cloudflared/<uuid>.json

ingress:
  # API + OAuth callbacks + webhook receivers
  - hostname: tietide.com
    path: /v1/.*
    service: http://localhost:3030
  - hostname: tietide.com
    path: /webhooks/.*
    service: http://localhost:3030
  # Everything else (the SPA's static assets and routes)
  - hostname: tietide.com
    service: http://localhost:5173
  # Required catch-all
  - service: http_status:404
EOF
```

If your WSL username isn't `higor`, replace `/home/higor` with your actual home path (`echo $HOME` to check). Then open the file and replace both `<uuid>` placeholders:

```bash
sed -i "s|<uuid>|YOUR-ACTUAL-UUID|g" ~/.cloudflared/config.yml
cat ~/.cloudflared/config.yml   # sanity check
```

This single-hostname ingress keeps everything same-origin (no CORS friction) and mirrors the production reverse-proxy layout described in [`docs/deployment.md` §6](deployment.md#6-reverse-proxy--tls).

### 12. Route DNS to the tunnel

```bash
cloudflared tunnel route dns tietide tietide.com
```

This creates a proxied CNAME in Cloudflare pointing `tietide.com` at `<uuid>.cfargotunnel.com`. Visitors hit `tietide.com` and never see the tunnel UUID.

### 13. Finish wiring TieTide's `.env` for the public URL

```bash
cd ~/tietide
nano .env   # or `code .env` if you've connected VS Code via the Remote-WSL extension
```

Set (or update):

```env
# CORS — must match the public origin exactly
CORS_ORIGIN=https://tietide.com

# SPA — Vite reads this at build / dev-server start
VITE_API_URL=https://tietide.com

# Where TieTide redirects the browser after OAuth callback succeeds
SPA_BASE_URL=https://tietide.com

# OAuth redirect URIs — every provider you've set up needs the public URL
GOOGLE_OAUTH_REDIRECT_URI=https://tietide.com/v1/connections/oauth/callback?provider=google
MS_OAUTH_REDIRECT_URI=https://tietide.com/v1/connections/oauth/callback?provider=microsoft
SLACK_OAUTH_REDIRECT_URI=https://tietide.com/v1/connections/oauth/callback?provider=slack
NOTION_OAUTH_REDIRECT_URI=https://tietide.com/v1/connections/oauth/callback?provider=notion
HUBSPOT_OAUTH_REDIRECT_URI=https://tietide.com/v1/connections/oauth/callback?provider=hubspot

# Strong secrets — DON'T leave these as placeholders
# JWT_SECRET=<openssl rand -base64 64>
# ENCRYPTION_MASTER_KEY=<openssl rand -base64 32>
# WEBHOOK_HMAC_SECRET=<openssl rand -hex 32>
```

Generate the secrets (if you haven't already):

```bash
echo "JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')"
echo "ENCRYPTION_MASTER_KEY=$(openssl rand -base64 32)"
echo "WEBHOOK_HMAC_SECRET=$(openssl rand -hex 32)"
```

Paste these into `.env`. **The `ENCRYPTION_MASTER_KEY` decrypts every stored OAuth/API-key connection — losing it makes them unrecoverable. Stash a copy in a password manager.**

### 14. Add the public URL to each OAuth provider's redirect-URI list

Each OAuth provider's developer console must include `https://tietide.com/v1/connections/oauth/callback?provider=<provider-id>` alongside the `http://localhost:3030/...` you (probably) added during initial setup. The per-provider OAuth guides in [`docs/Connection-setup/`](Connection-setup/) cover this — they tell you to add both URIs at the same time.

If you skipped the production URI earlier, go back now and add it. Google, Microsoft, Slack, Notion, HubSpot.

### 15. Start TieTide (two more terminals)

Open two additional WSL Ubuntu windows. In one:

```bash
cd ~/tietide
pnpm --filter @tietide/api dev
```

In the other:

```bash
cd ~/tietide
pnpm --filter @tietide/spa dev
```

API binds to `0.0.0.0:3030`, SPA dev server binds to `0.0.0.0:5173`. Both reachable from inside WSL on `localhost`.

### 16. Start the tunnel

In a third WSL window:

```bash
cloudflared tunnel run tietide
```

Output:

```
INF Starting tunnel tunnelID=<uuid>
INF Connection registered connIndex=0 location=...
INF Connection registered connIndex=1 location=...
```

Leave this running.

### 17. Test end-to-end

From any device outside your home network (your phone on cellular data is the simplest test):

1. Open `https://tietide.com/` — TieTide's SPA loads.
2. Register an account, log in.
3. **Connections** → pick Google (or whichever OAuth provider you added the public URL to in step 14) → **Connect**.
4. The popup lands on the provider's consent screen → redirects back to `https://tietide.com/v1/connections/oauth/callback?provider=google&code=...` → TieTide exchanges the code → popup closes → connection appears in the list.

If anything fails, jump to **Troubleshooting** below.

### 18. (Recommended) Run `cloudflared` as a systemd service inside WSL

So the tunnel restarts automatically every time WSL boots:

```bash
sudo cloudflared --config /home/higor/.cloudflared/config.yml service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared   # should be active (running)
```

Replace `/home/higor` with your actual `$HOME`. From here you don't need the dedicated terminal in step 16 — the service handles it.

To pause:

```bash
sudo systemctl stop cloudflared
```

To remove:

```bash
sudo systemctl disable --now cloudflared
sudo cloudflared service uninstall
```

## Daily workflow

After the one-time setup:

1. Open the Ubuntu app from the Start menu.
2. `cd ~/tietide`.
3. `docker compose -f infra/docker/docker-compose.yml up -d` (if it's not still running from last time).
4. Start API + SPA: `pnpm --filter @tietide/api dev` and `pnpm --filter @tietide/spa dev` in two windows.
5. The tunnel is already up (systemd service). `https://tietide.com` is live.

To take TieTide offline temporarily: `sudo systemctl stop cloudflared`. To take it offline completely: shut down WSL with `wsl --shutdown` in PowerShell.

## Troubleshooting

### "Bad gateway" / 502 from Cloudflare

The tunnel reached WSL but `localhost:3030` (or `:5173`) isn't responding. From inside WSL:

```bash
ss -lntp | grep -E ":(3030|5173)"
```

If nothing is listening, the dev server isn't running — restart `pnpm dev` in the right window.

### OAuth callback gives `redirect_uri_mismatch`

The provider's redirect-URI list doesn't include `https://tietide.com/v1/connections/oauth/callback?provider=<id>`. Re-check the developer console for that provider, add the exact public URL, save.

### Connection works locally but fails over tunnel

You probably left `VITE_API_URL=http://localhost:3030` in `.env`. The SPA bundle baked in `localhost` and visitors' browsers can't reach it. Restart `pnpm --filter @tietide/spa dev` after fixing `.env` so Vite picks up the new value.

### Tunnel runs but DNS doesn't resolve

```bash
dig +short tietide.com
```

Should return a Cloudflare IP (e.g. `104.x.x.x` or `172.x.x.x`). If it returns Hostinger's parking IP or nothing, either your nameserver change (step 7) hasn't propagated yet, or step 12 didn't run. Check Cloudflare → DNS → Records — there should be a proxied CNAME for `tietide.com` pointing to `<uuid>.cfargotunnel.com`.

### Webhooks (Stripe / Slack / Discord / Telegram) not arriving

Watch the tunnel log:

```bash
sudo journalctl -u cloudflared -f
```

Every inbound request is logged. If you don't see the POST attempt at all, the provider isn't sending it (check the provider's webhook delivery log). If you see the POST but TieTide returns 4xx, that's a TieTide-side problem (probably HMAC signature mismatch or expired subscription).

### WSL eats too much RAM

WSL2 can balloon over time. Cap it via `%USERPROFILE%\.wslconfig` (on Windows, not in WSL):

```ini
[wsl2]
memory=12GB
processors=4
swap=4GB
```

`wsl --shutdown` from PowerShell, then reopen Ubuntu to pick up the new limits.

### Windows wants to sleep

Open **Settings → System → Power & battery → Screen and sleep** and set sleep to **Never** while you want the tunnel reachable. WSL pauses when Windows sleeps; the tunnel goes down with it.

## When to outgrow this setup

Great for:

- College demos and portfolio reviews.
- A small private group of users (you, classmates, a professor).
- Testing webhooks end-to-end before paying for a VPS.
- Running TieTide while you sleep (it'll just be down).

Promote to a Hostinger VPS — see [`docs/hostinger-deployment.md`](hostinger-deployment.md) — when:

- Real users depend on it being available 24/7.
- You start hitting your home internet's upload cap.
- You want server-class hardware (the API + Postgres + Ollama is RAM-hungry).
- You want offsite backups by default.

Migrating from WSL to a VPS is mostly a `pg_dump | ssh tietide@vps psql` plus copying `.env` (carefully — the encryption master key must move too, otherwise stored credentials become garbage). The commands in this guide and in `docs/deployment.md` are identical at the shell level, which is the whole point of using WSL2 for this stage.

## I already had TieTide working on Windows directly

You can keep your Windows setup as a quick-edit playground and use WSL purely as the "publicly reachable" environment. Two paths:

1. **Cut over**: clone fresh inside WSL (step 3) and treat that as your primary dev env going forward. Cleaner long-term.
2. **Bridge**: keep the Windows clone for IDE/local-only work, and `git pull` inside WSL whenever you want to expose changes publicly. Adds a sync step but lets you keep your existing Windows workflow.

Either way, the WSL clone is the one connected to the tunnel — the Windows-side processes are never exposed to `tietide.com`.
