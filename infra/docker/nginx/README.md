# Edge proxy + TLS (production)

The `edge` service in [`../docker-compose.prod.yml`](../docker-compose.prod.yml) is an
nginx reverse proxy that terminates TLS and routes traffic to the `api` and `spa`
containers. Certificates come from Let's Encrypt via the http-01 webroot challenge,
issued once by hand and then renewed automatically by the `certbot` companion.

- Proxy config template: [`templates/default.conf.template`](templates/default.conf.template)
  (the nginx image renders `${DOMAIN}` into it at start).
- Certs live in the `certbot_certs` volume at `/etc/letsencrypt/live/${DOMAIN}/`.
- Challenge files live in the shared `certbot_webroot` volume.

## 1. Prerequisites

In the repo-root `.env` (see [`docs/deployment.md`](../../../docs/deployment.md) §3):

```bash
DOMAIN=tietide.example.com
ACME_EMAIL=ops@example.com
```

DNS for `DOMAIN` must already point at the host, and ports 80/443 must be reachable
from the internet (Let's Encrypt validates over HTTP on port 80).

## 2. Bootstrap a certificate (first deploy)

nginx refuses to start if `ssl_certificate` points at a missing file, so seed a
temporary self-signed cert, start the edge, obtain the real cert, then reload.

```bash
cd /opt/tietide
set -a; . ./.env; set +a   # export DOMAIN / ACME_EMAIL for the commands below

COMPOSE="docker compose -f infra/docker/docker-compose.prod.yml --env-file .env"

# 2a. Seed a throwaway self-signed cert into the certs volume so nginx can boot.
$COMPOSE run --rm --entrypoint sh certbot -c "\
  mkdir -p /etc/letsencrypt/live/$DOMAIN && \
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
    -out   /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
    -subj  /CN=$DOMAIN"

# 2b. Start the edge (now that cert files exist) so it can serve the ACME challenge.
$COMPOSE up -d edge

# 2c. Request the real certificate (replaces the self-signed one).
$COMPOSE run --rm --entrypoint sh certbot -c "\
  certbot certonly --webroot -w /var/www/certbot \
    -d $DOMAIN --email $ACME_EMAIL --agree-tos --no-eff-email --force-renewal"

# 2d. Reload nginx to pick up the real cert.
$COMPOSE exec edge nginx -s reload
```

Open `https://$DOMAIN/` — the padlock should be valid.

## 3. Renewal

The `certbot` service runs `certbot renew` every 12h automatically. Renewed certs
land in the same volume but nginx only reads them on reload, so reload it on a
schedule (Let's Encrypt certs last 90 days; a weekly reload is plenty):

```bash
sudo tee /etc/cron.d/tietide-nginx-reload > /dev/null <<'EOF'
0 4 * * 1  root  docker compose -f /opt/tietide/infra/docker/docker-compose.prod.yml exec edge nginx -s reload
EOF
```

## 4. Notes

- The AI service (`ai:8000`) and the Prometheus `/metrics` endpoints are **not**
  proxied — they stay on the internal network / loopback only.
- The `spa` container runs its own nginx serving the static bundle on `:8080`; the
  edge proxies to it rather than mounting the assets directly.
- To use an external ACME tool (Traefik, nginx-proxy + acme-companion) instead,
  drop the `edge` + `certbot` services and point that tool at `api:3030` / `spa:8080`.
