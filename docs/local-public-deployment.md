# Running TieTide on Your Local Machine with a Public URL (Cloudflare Tunnel)

> Audience: Higor (or anyone) who already owns a domain but doesn't want to pay for a VPS.
> Time: ~30 minutes the first time, including DNS propagation.

This guide makes **your local laptop/desktop the server** while giving you a real public HTTPS URL on a domain you own (e.g. one registered through Hostinger). It uses **Cloudflare Tunnel** — a free service that holds an outbound connection from your machine to Cloudflare's edge and routes inbound traffic from `https://your-domain.com` to `localhost:3030` / `localhost:5173`.

Compared to a Hostinger VPS:

| Trade-off        | Local + Cloudflare Tunnel                        | Hostinger VPS                     |
| ---------------- | ------------------------------------------------ | --------------------------------- |
| Cost             | Free (you pay for the domain you already have)   | $5–25/month                       |
| Always on        | Only when your machine is running                | 24/7                              |
| TLS / HTTPS      | Free, automatic (Cloudflare edge)                | You provision (Let's Encrypt)     |
| Public IP needed | No (works behind any NAT/firewall)               | Yes (VPS has one)                 |
| OAuth / webhooks | Works (stable URL)                               | Works                             |
| Performance      | Your machine + your internet upload speed        | VPS hardware + datacenter network |
| Suitable for     | Personal demos, college MVP, small private group | Real users, longer hours          |

If your machine is reasonably modern (16 GB RAM) and your internet is decent, this is **the right setup for the TieTide MVP demo**.

## ⚠️ What you give up

- **Your machine must be on** whenever someone wants to use TieTide. Close the laptop, TieTide is down.
- **Your home internet's upload speed** is the bottleneck. Fine for a handful of users; not for a viral launch.
- **Residential ISPs** sometimes block specific traffic patterns. Cloudflare Tunnel uses outbound HTTPS, which almost never gets blocked, but if you're on a corporate network with deep packet inspection you may have problems.
- **No automatic backups** — if your disk dies, TieTide data dies with it. Run the backup script from [`docs/deployment.md` §7.1](deployment.md#71-daily-encrypted-postgresql-backup) locally too, and copy the dumps somewhere off-machine.

## Steps

### 1. Create a free Cloudflare account

1. Open <https://dash.cloudflare.com/sign-up>, sign up with your email.
2. Verify your email.

You don't need to enter payment info — everything in this guide is on the free plan.

### 2. Add your Hostinger-registered domain to Cloudflare

1. In the Cloudflare dashboard → **+ Add a domain**.
2. Enter your domain (e.g. `your-domain.com`).
3. Pick the **Free** plan → **Continue**.
4. Cloudflare scans existing DNS records — for now you can leave them as-is (or delete unrelated parking-page records if Hostinger added any).
5. Cloudflare shows you **two nameservers** (e.g. `kate.ns.cloudflare.com`, `tom.ns.cloudflare.com`). Copy both.

### 3. Point your Hostinger domain at Cloudflare's nameservers

1. Open <https://hpanel.hostinger.com/> → **Domains** → your domain → **DNS / Nameservers** tab.
2. Change to **Custom nameservers** and paste the two values from step 2.
3. **Save**.

Nameserver changes propagate in 5 min to ~24 hours; usually under an hour. Verify with:

```powershell
nslookup -type=ns your-domain.com
```

When the response includes `kate.ns.cloudflare.com` (or whichever pair Cloudflare assigned you), continue. Cloudflare also emails you when activation is complete.

### 4. Install `cloudflared` on Windows

`cloudflared` is the tunnel daemon. Install via winget (or download the .msi from <https://github.com/cloudflare/cloudflared/releases>):

```powershell
winget install --id Cloudflare.cloudflared
```

Verify:

```powershell
cloudflared --version
```

### 5. Authenticate `cloudflared` with your Cloudflare account

```powershell
cloudflared tunnel login
```

A browser tab opens — sign in to Cloudflare and pick the domain you added in step 2. `cloudflared` writes a certificate to `%USERPROFILE%\.cloudflared\cert.pem`. Keep that file safe (it acts like an API token for tunnel management).

### 6. Create a named tunnel

```powershell
cloudflared tunnel create tietide
```

This creates a tunnel called `tietide` and prints a UUID. It also writes a credentials JSON file to `%USERPROFILE%\.cloudflared\<uuid>.json`. Note both.

### 7. Configure ingress (how the tunnel routes traffic)

Create `%USERPROFILE%\.cloudflared\config.yml`. Replace `<uuid>` and `your-domain.com` with your real values:

```yaml
tunnel: <uuid>
credentials-file: C:\Users\higor\.cloudflared\<uuid>.json

ingress:
  # API + webhooks + OAuth callbacks — everything under /v1, /webhooks, /v1/provider-webhooks
  - hostname: your-domain.com
    path: /v1/.*
    service: http://localhost:3030
  - hostname: your-domain.com
    path: /webhooks/.*
    service: http://localhost:3030
  # Everything else (the SPA's static assets and routes)
  - hostname: your-domain.com
    service: http://localhost:5173
  # Required catch-all
  - service: http_status:404
```

This single hostname strategy keeps CORS simple (everything is same-origin) and matches the production reverse-proxy layout described in [`docs/deployment.md` §6](deployment.md#6-reverse-proxy--tls).

### 8. Route DNS to the tunnel

```powershell
cloudflared tunnel route dns tietide your-domain.com
```

This creates a `CNAME` record in Cloudflare pointing `your-domain.com` at `<uuid>.cfargotunnel.com`. Cloudflare proxies it through their edge automatically, so visitors see `your-domain.com` and never the tunnel UUID.

### 9. Update TieTide's `.env` for the public URL

Edit `.env` at the repo root. Set:

```env
# CORS — must match the public origin exactly
CORS_ORIGIN=https://your-domain.com

# SPA — Vite reads this at build / dev-server start
VITE_API_URL=https://your-domain.com

# Where TieTide redirects the browser after OAuth callback succeeds
SPA_BASE_URL=https://your-domain.com

# OAuth redirect URIs — every provider you've set up needs the public URL
GOOGLE_OAUTH_REDIRECT_URI=https://your-domain.com/v1/connections/oauth/callback?provider=google
MS_OAUTH_REDIRECT_URI=https://your-domain.com/v1/connections/oauth/callback?provider=microsoft
SLACK_OAUTH_REDIRECT_URI=https://your-domain.com/v1/connections/oauth/callback?provider=slack
NOTION_OAUTH_REDIRECT_URI=https://your-domain.com/v1/connections/oauth/callback?provider=notion
HUBSPOT_OAUTH_REDIRECT_URI=https://your-domain.com/v1/connections/oauth/callback?provider=hubspot
```

Restart the API and SPA dev servers after editing `.env`:

```powershell
# Stop any running `pnpm dev` processes, then:
pnpm --filter @tietide/api dev
pnpm --filter @tietide/spa dev
```

### 10. Add the public URL to each OAuth provider's redirect-URI list

Each OAuth provider's developer console must include `https://your-domain.com/v1/connections/oauth/callback?provider=<provider-id>` in its **Authorized redirect URIs** list — alongside the `http://localhost:3030/...` you already added during initial setup. The per-provider OAuth guides in [`docs/Connection-setup/`](Connection-setup/) explain where to add this for each provider (Google, Microsoft, Slack, Notion, HubSpot).

> The guides specifically tell you to add both URIs at the same time. If you skipped the production one earlier, go back and add it now.

### 11. Start the tunnel

In a separate PowerShell window:

```powershell
cloudflared tunnel run tietide
```

You'll see:

```
INF Starting tunnel tunnelID=<uuid>
INF Connection registered connIndex=0 location=<airport-code>
INF Connection registered connIndex=1 location=<airport-code>
```

Leave this window open. The tunnel is live as long as `cloudflared` is running.

### 12. Test end-to-end

From another device (your phone on cellular data, a friend's laptop, anywhere outside your home network):

1. Open `https://your-domain.com/` — TieTide's SPA should load. The page is served by Vite on `localhost:5173` and proxied through Cloudflare.
2. Register an account, log in.
3. Go to **Connections** → pick Google (or another OAuth provider you registered the public URL for in step 10) → click **Connect**.
4. The popup should land on the provider's consent screen, then redirect back to `https://your-domain.com/v1/connections/oauth/callback?provider=google&code=...` → TieTide exchanges the code → the popup closes → SPA shows the new connection.

If anything fails, the most common causes are listed under **Troubleshooting** below.

### 13. (Optional) Run `cloudflared` as a Windows service

So the tunnel restarts automatically when your machine reboots:

```powershell
cloudflared service install
```

Manage it like any service:

```powershell
Get-Service cloudflared
Restart-Service cloudflared
```

To stop running as a service:

```powershell
cloudflared service uninstall
```

## Troubleshooting

### "Bad gateway" / 502 from Cloudflare

The tunnel reached your machine but `localhost:3030` (or `:5173`) isn't responding. Confirm both `pnpm dev` processes are running and listening:

```powershell
netstat -ano | findstr ":3030 :5173"
```

### OAuth callback gives `redirect_uri_mismatch`

The provider's redirect-URI list doesn't include `https://your-domain.com/v1/connections/oauth/callback?provider=<id>`. Re-check the developer console for that provider, add the exact public URL, save.

### Connection works locally but fails over tunnel

Most likely you set `VITE_API_URL=http://localhost:3030` (or left it as the default). The SPA bundle baked in `localhost` and visitors' browsers can't reach your laptop. Restart the SPA dev server after fixing `.env` so Vite picks up the new value.

### Tunnel runs but DNS doesn't resolve

`nslookup your-domain.com` should return a Cloudflare IP. If it returns an empty result or Hostinger's parking IP, your nameserver change in step 3 hasn't propagated yet, or you didn't run `cloudflared tunnel route dns` in step 8. Check Cloudflare → DNS → Records — there should be a proxied CNAME pointing to `<uuid>.cfargotunnel.com`.

### Webhooks (Stripe / Slack / Discord / Telegram) not arriving

The webhook providers will POST to `https://your-domain.com/v1/provider-webhooks/<provider>/<sub-id>`. Watch the tunnel's log window — every inbound request is logged. If you don't see the POST attempt at all, the provider isn't sending it (check the provider's webhook delivery log). If you see the POST but TieTide returns 4xx, that's a TieTide-side problem (probably HMAC signature or expired subscription).

### My machine sleeps

Open **Settings → System → Power & battery → Screen and sleep** and set sleep to **Never** while the tunnel is active. Or use `powercfg /requestsoverride PROCESS cloudflared.exe SYSTEM` to keep the system awake whenever `cloudflared` is running.

## When to outgrow this setup

This is great for:

- College demos and portfolio reviews
- A small private group of users (yourself, a few classmates, a professor)
- Testing webhooks end-to-end before paying for a VPS
- Running TieTide while you sleep (it'll just be down)

Promote to a VPS — follow [`docs/hostinger-deployment.md`](hostinger-deployment.md) — when:

- Real users depend on it being available
- You start hitting your home internet's upload cap
- You want server-class hardware (the API + Postgres + Ollama is RAM-hungry)
- You want offsite backups by default

The same Cloudflare Tunnel config can keep working after you move to a VPS — point the tunnel at the VPS's `localhost` instead of your laptop's — but at that point a normal reverse proxy (Traefik / nginx) on the VPS is simpler and cheaper than running `cloudflared` there.
