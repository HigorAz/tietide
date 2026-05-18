# Google OAuth Setup (Platform-Owner Guide)

> Audience: Whoever runs TieTide — Higor for now, future operators later.
> Time: ~15 minutes the first time you do it.

## Why this step exists

OAuth has two distinct credentials, and confusing them is the most common setup mistake:

1. **Platform credentials (`client_id` + `client_secret`)** belong to **TieTide as a product**. You register _one_ OAuth app per provider on that provider's developer console, and the resulting `client_id` / `client_secret` go into TieTide's environment variables. They identify _TieTide_ to _Google_. Every TieTide customer who clicks "Connect Google" uses the same pair.
2. **Customer tokens (`access_token` + `refresh_token`)** belong to the individual user who connected their account. They're issued _after_ a customer authorizes TieTide on Google's consent screen, and they're stored encrypted (libsodium) in the `Connection` table — one row per (user, provider) pair.

This guide covers step 1 for Google. Without it, `GET /v1/connections/oauth/start?provider=google` returns `503 OAuth provider not configured: missing environment variable GOOGLE_OAUTH_REDIRECT_URI` (or `_CLIENT_ID` / `_CLIENT_SECRET`).

## Steps

### 1. Create or select a Google Cloud project

1. Open <https://console.cloud.google.com/>.
2. Top bar → project picker → **New Project**.
3. Name: `tietide-dev` (or whatever). Leave organization as-is. Create.
4. Wait ~10s, then select the project from the picker.

### 2. Enable the APIs TieTide will call

The Google provider in `apps/api/src/connections/oauth/providers/google.provider.ts` allowlists scopes for Gmail, Calendar, Drive, Sheets, and Docs. Enable the matching APIs:

1. Left nav → **APIs & Services** → **Library**.
2. Search and enable each of:
   - Gmail API
   - Google Calendar API
   - Google Drive API
   - Google Sheets API
   - Google Docs API

You only need to enable APIs for the actions/triggers you actually plan to demo — but the above is the full set the codebase supports today.

### 3. Configure the OAuth consent screen

1. Left nav → **APIs & Services** → **OAuth consent screen**.
2. User Type: **External**. Create.
3. Fill the minimum:
   - App name: `TieTide`.
   - User support email: your address.
   - Developer contact: your address.
4. Scopes: skip — TieTide passes its scopes per-request, not via the consent screen registration.
5. Test users: add **your own Google account email**. Without this, you can't even self-authorize while the app is in "Testing" mode.
6. Save.

The app stays in "Testing" mode for the MVP — that's fine. Production publishing is its own multi-day Google review and is out of scope until launch.

### 4. Create the OAuth client ID

1. Left nav → **APIs & Services** → **Credentials**.
2. **Create credentials** → **OAuth client ID**.
3. Application type: **Web application**.
4. Name: `TieTide local dev`.
5. **Authorized redirect URIs** → add **one URI per environment you plan to run** (Google lets you list as many as you want — adding the production URI now saves a round-trip later). For local dev plus a deployed instance:
   ```
   http://localhost:3030/v1/connections/oauth/callback?provider=google
   https://<your-domain>/v1/connections/oauth/callback?provider=google
   ```

   - Each URI must match the `GOOGLE_OAUTH_REDIRECT_URI` of its own environment byte-for-byte. Google compares exactly.
   - **HTTPS is required** for any non-localhost URI; Google rejects plain `http://` for real domains.
   - Skip the second URI for now if you don't have a domain yet — you can add it later under the same OAuth client (no need to create a new one).
6. Create.

A modal pops up with **Client ID** and **Client secret**. Copy both somewhere safe — the secret is only shown once here, but you can regenerate it later if needed.

### 5. Populate `.env`

Open `.env` at the repo root (copy from `.env.example` if you haven't already) and set:

```env
GOOGLE_OAUTH_CLIENT_ID=<paste-client-id-from-step-4>
GOOGLE_OAUTH_CLIENT_SECRET=<paste-client-secret-from-step-4>
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3030/v1/connections/oauth/callback?provider=google
SPA_BASE_URL=http://localhost:5173
```

`SPA_BASE_URL` is where TieTide redirects the customer's browser _after_ the callback. It defaults to `http://localhost:5173` if unset, but it's worth pinning explicitly.

### 6. Restart the API and test end-to-end

```powershell
pnpm --filter @tietide/api dev
```

Then in the SPA:

1. Log in to TieTide.
2. Go to **Connections** → **Add Connection** → **Google** → label it (e.g. "My Google") → **Connect**.
3. Browser redirects to `accounts.google.com/o/oauth2/v2/auth?...` — you should see Google's consent screen for the TieTide app.
4. Approve → Google redirects back to `localhost:3030/v1/connections/oauth/callback?provider=google&code=...` → TieTide exchanges the code → SPA lands on `/connections?status=success&id=<connection-uuid>`.
5. A new row appears in `Connection` for your user, with encrypted `access_token` + `refresh_token`.

If step 3 errors with `redirect_uri_mismatch`, the URI in step 4 of Google Console doesn't match `GOOGLE_OAUTH_REDIRECT_URI` exactly. Trailing slashes, http vs https, and ports all count.

## Promoting to production

When you deploy to a real domain (e.g. `app.tietide.com`):

1. Edit the same OAuth client in Google Console → add a second **Authorized redirect URI**: `https://app.tietide.com/v1/connections/oauth/callback?provider=google`. Don't remove the localhost one — keep both for local dev parity.
2. Update production env: `GOOGLE_OAUTH_REDIRECT_URI=https://app.tietide.com/v1/connections/oauth/callback?provider=google` and `SPA_BASE_URL=https://app.tietide.com`.
3. When you're ready for non-test-user customers, click **Publish App** on the OAuth consent screen and complete Google's verification flow (logo, privacy policy, scope justification). This typically takes days, sometimes weeks for sensitive scopes like Gmail.

## Doing this for other providers

Same pattern: Microsoft (Azure AD app registration), Slack (api.slack.com app), Notion (notion.so/my-integrations), HubSpot (developer.hubspot.com). Each console looks different, but the inputs/outputs are identical:

- Configure redirect URI to match `<PROVIDER>_OAUTH_REDIRECT_URI` from `.env.example`.
- Copy the resulting `client_id` and `client_secret` into the matching env vars.
- Restart the API.
