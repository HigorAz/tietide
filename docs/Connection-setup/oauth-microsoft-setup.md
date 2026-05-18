# Microsoft OAuth Setup (Platform-Owner Guide)

> Audience: Whoever runs TieTide — Higor for now, future operators later.
> Time: ~15 minutes the first time you do it.

## Why this step exists

OAuth has two distinct credentials, and confusing them is the most common setup mistake:

1. **Platform credentials (`client_id` + `client_secret`)** belong to **TieTide as a product**. You register _one_ Azure AD application, and the resulting `client_id` / `client_secret` go into TieTide's environment variables. They identify _TieTide_ to _Microsoft_. Every TieTide customer who clicks "Connect Microsoft" uses the same pair.
2. **Customer tokens (`access_token` + `refresh_token`)** belong to the individual user who connected their account. They're issued _after_ a customer authorizes TieTide on Microsoft's consent screen, and they're stored encrypted (libsodium) in the `Connection` table — one row per (user, provider) pair.

This guide covers step 1 for Microsoft. Without it, `GET /v1/connections/oauth/start?provider=microsoft` returns `503 OAuth provider not configured: missing environment variable MS_OAUTH_REDIRECT_URI` (or `_CLIENT_ID` / `_CLIENT_SECRET`).

## Steps

### 1. Sign in to the Azure Portal

1. Open <https://portal.azure.com/> and sign in with a Microsoft account.
2. The free tier (no paid Azure subscription required) is enough to register an app and issue OAuth tokens — you only pay for resources you create, not for app registrations.

### 2. Register a new application

1. Search **App registrations** in the top bar → open it.
2. Click **+ New registration**.
3. Name: `TieTide`.
4. **Supported account types**: pick **Accounts in any organizational directory and personal Microsoft accounts** (multi-tenant + personal). This matches the default `MS_OAUTH_TENANT=common` in `.env.example`. If you only want your own tenant, pick the single-tenant option and you'll override `MS_OAUTH_TENANT` later.
5. **Redirect URI**: pick **Web** from the dropdown and paste the URI for the environment you're setting up first. Azure lets you register additional URIs from the **Authentication** blade after creation — add the deployed URI in step 6 if you have a domain, otherwise come back later.
   ```
   http://localhost:3030/v1/connections/oauth/callback?provider=microsoft
   ```

   - Byte-for-byte match with `MS_OAUTH_REDIRECT_URI` in your `.env`. Microsoft compares exactly.
   - **HTTPS is required** for any non-localhost URI; Azure rejects `http://` for real domains.
6. Click **Register**.
7. (Recommended) After registration, left nav → **Authentication** → **Add URI** under the Web platform and add your deployed URI too, e.g. `https://<your-domain>/v1/connections/oauth/callback?provider=microsoft`. Both URIs share the same client id/secret — only the env var differs per environment.

### 3. Add the API permissions TieTide will call

The Microsoft provider in `apps/api/src/connections/oauth/providers/microsoft.provider.ts` requests scopes for Outlook, OneDrive, and Excel.

1. From the app overview → left nav → **API permissions** → **+ Add a permission**.
2. Pick **Microsoft Graph** → **Delegated permissions**.
3. Search and add:
   - `Mail.Send` — send Outlook messages
   - `Mail.Read` — read Outlook messages (for the `outlook-message-received` and `outlook-message-flagged` triggers)
   - `Files.ReadWrite` — OneDrive create/list/read
   - `Calendars.ReadWrite` — Outlook Calendar
   - `offline_access` — required so Microsoft returns a refresh token
   - `User.Read` — base profile (granted by default)
4. Click **Add permissions**.

You don't need to grant admin consent for personal Microsoft accounts. For organizational tenants, click **Grant admin consent for <tenant>** if you have the privilege.

### 4. Create a client secret

1. Left nav → **Certificates & secrets** → **Client secrets** tab.
2. **+ New client secret**.
3. Description: `TieTide local dev`. Expiry: 24 months (or whatever your policy allows).
4. **Add**.

A row appears with **Value** and **Secret ID**. Copy the **Value** column **right now** — Azure hides it forever after you navigate away. The **Secret ID** is not what you want; the **Value** is.

### 5. Grab the Application (client) ID

1. Left nav → **Overview**.
2. Copy **Application (client) ID**. This is `MS_OAUTH_CLIENT_ID`.
3. If you picked single-tenant in step 2, also copy **Directory (tenant) ID**.

### 6. Populate `.env`

Open `.env` at the repo root and set:

```env
MS_OAUTH_CLIENT_ID=<application-client-id-from-step-5>
MS_OAUTH_CLIENT_SECRET=<client-secret-value-from-step-4>
MS_OAUTH_REDIRECT_URI=http://localhost:3030/v1/connections/oauth/callback?provider=microsoft
MS_OAUTH_TENANT=common
```

If you registered as **single-tenant**, replace `common` with your tenant ID from step 5. Leave it as `common` for multi-tenant + personal Microsoft accounts (the default in `.env.example`).

### 7. Restart the API and test end-to-end

```powershell
pnpm --filter @tietide/api dev
```

Then in the SPA:

1. Log in to TieTide.
2. Go to **Connections** → pick **Microsoft** → label it (e.g. "My Outlook") → **Connect**.
3. Browser redirects to `login.microsoftonline.com/.../oauth2/v2.0/authorize?...` — you should see Microsoft's consent screen for the TieTide app.
4. Approve → Microsoft redirects back to `localhost:3030/v1/connections/oauth/callback?provider=microsoft&code=...` → TieTide exchanges the code → SPA lands on `/connections?status=success&id=<connection-uuid>`.
5. A new row appears in `Connection` for your user, with encrypted `access_token` + `refresh_token` + `tenantId`.

If step 3 errors with `AADSTS50011: The reply URL specified in the request does not match`, the redirect URI in step 2 of Azure Portal doesn't match `MS_OAUTH_REDIRECT_URI` exactly. Trailing slashes, http vs https, and ports all count.

## Promoting to production

When you deploy to a real domain (e.g. `app.tietide.com`):

1. Edit the same app registration → **Authentication** → **+ Add a platform** → Web → paste `https://app.tietide.com/v1/connections/oauth/callback?provider=microsoft`. Keep the localhost URI for local dev parity.
2. Update production env: `MS_OAUTH_REDIRECT_URI=https://app.tietide.com/v1/connections/oauth/callback?provider=microsoft` and `SPA_BASE_URL=https://app.tietide.com`.
3. Client secrets expire — set a calendar reminder a month before the expiry date in step 4 to rotate.

## Free-tier limits

- **App registrations** are free and unlimited.
- **Microsoft Graph API** has generous per-app and per-user rate limits (typically thousands of requests per minute) — fine for personal/MVP use.
- **Microsoft 365 / Outlook account**: you need an actual Microsoft account to test (Outlook.com, Hotmail, Live, or any work/school account). All free.
