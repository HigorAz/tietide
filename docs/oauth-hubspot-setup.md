# HubSpot OAuth Setup (Platform-Owner Guide)

> Audience: Whoever runs TieTide — Higor for now, future operators later.
> Time: ~15 minutes the first time you do it.

## Why this step exists

OAuth has two distinct credentials, and confusing them is the most common setup mistake:

1. **Platform credentials (`client_id` + `client_secret`)** belong to **TieTide as a product**. You register _one_ HubSpot app on developer.hubspot.com, and the resulting `client_id` / `client_secret` go into TieTide's environment variables. They identify _TieTide_ to _HubSpot_. Every TieTide customer who clicks "Connect HubSpot" uses the same pair.
2. **Customer tokens (`access_token` + `refresh_token` + `hubId`)** belong to the individual user who installed the app into their HubSpot portal. Stored encrypted (libsodium) in the `Connection` table — one row per (user, hub) pair.

This guide covers step 1 for HubSpot. Without it, `GET /v1/connections/oauth/start?provider=hubspot` returns `503 OAuth provider not configured: missing environment variable HUBSPOT_OAUTH_REDIRECT_URI` (or `_CLIENT_ID` / `_CLIENT_SECRET`).

## Steps

### 1. Create a HubSpot developer account

1. Open <https://developers.hubspot.com/> → **Create a developer account** (separate from any normal HubSpot account you already have). Free.
2. After sign-up, you land on the developer dashboard.

### 2. Create an app

1. Developer dashboard → **Apps** tab → **Create app**.
2. **App name**: `TieTide`. Description: anything.
3. Click **Create app**.

### 3. Configure Auth

1. Inside the app, **Auth** tab.
2. Copy the **Client ID** and **Client secret**. The secret is shown in plaintext — copy now.
3. **Redirect URLs**: paste:
   ```
   http://localhost:3030/v1/connections/oauth/callback?provider=hubspot
   ```
   Byte-for-byte match with `HUBSPOT_OAUTH_REDIRECT_URI` in your `.env`.
4. **Required scopes**: tick the scopes the actions in `apps/worker/src/nodes/connectors/hubspot/` need:
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write` — for `hubspot-create-contact`
   - `crm.objects.deals.read`
   - `crm.objects.deals.write` — for `hubspot-create-deal`
   - `oauth` (granted by default)
5. **Optional scopes**: leave empty unless you plan to add more HubSpot actions later.
6. **Save changes**.

### 4. Populate `.env`

Open `.env` at the repo root and set:

```env
HUBSPOT_OAUTH_CLIENT_ID=<client-id-from-step-3>
HUBSPOT_OAUTH_CLIENT_SECRET=<client-secret-from-step-3>
HUBSPOT_OAUTH_REDIRECT_URI=http://localhost:3030/v1/connections/oauth/callback?provider=hubspot
```

### 5. Restart the API and test end-to-end

```powershell
pnpm --filter @tietide/api dev
```

Then in the SPA:

1. Log in to TieTide.
2. Go to **Connections** → pick **HubSpot** → label it (e.g. "My HubSpot") → **Connect**.
3. Browser redirects to `app.hubspot.com/oauth/authorize?...` — HubSpot's consent screen.
4. Pick which HubSpot **portal** (account) to install into. Even on a free CRM you'll have at least one portal.
5. **Connect app** → HubSpot redirects back to `localhost:3030/v1/connections/oauth/callback?provider=hubspot&code=...` → TieTide exchanges the code → SPA lands on `/connections?status=success&id=<connection-uuid>`.
6. A new `Connection` row exists with encrypted `access_token`, `refreshToken`, and `hubId`.

If step 3 errors with `redirect_uri does not match registered URIs`, the URL in step 3 of HubSpot's app config doesn't match `HUBSPOT_OAUTH_REDIRECT_URI` exactly.

## Promoting to production

When you deploy to a real domain (e.g. `app.tietide.com`):

1. App **Auth** tab → add a second **Redirect URL**: `https://app.tietide.com/v1/connections/oauth/callback?provider=hubspot`. Keep the localhost one for local dev.
2. Update production env: `HUBSPOT_OAUTH_REDIRECT_URI=https://app.tietide.com/v1/connections/oauth/callback?provider=hubspot`.
3. **Listing**: distributing the app via the HubSpot Marketplace requires their review (logo, demo video, scope justification, T&C). For personal/MVP use you don't need to list — the app works for any HubSpot user who knows the install URL (which TieTide builds automatically).

## Free-tier limits

- **HubSpot Free CRM** is generous: 1M contacts, free forever. Enough to build and demo automations.
- **API rate limits** (free tier): 100 requests / 10 sec / portal, 250,000 requests / day. Plenty for personal automations.
- **Developer test accounts**: from the developer dashboard you can spawn **test accounts** to try installs without polluting your real CRM. Recommended.

## Troubleshooting

- **`invalid_scope`**: the user clicked OK on the consent screen, but the scopes you requested are not enabled in step 3. Re-check that every scope your code uses is ticked in the app's Auth tab.
- **Token expires every 30 minutes**: HubSpot access tokens are short-lived. TieTide's `Connection` model stores the `refresh_token` for renewal — the worker refreshes automatically before each call.
