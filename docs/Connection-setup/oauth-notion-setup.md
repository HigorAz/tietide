# Notion OAuth Setup (Platform-Owner Guide)

> Audience: Whoever runs TieTide — Higor for now, future operators later.
> Time: ~10 minutes the first time you do it.

## Why this step exists

OAuth has two distinct credentials, and confusing them is the most common setup mistake:

1. **Platform credentials (`client_id` + `client_secret`)** belong to **TieTide as a product**. You register _one_ Notion integration on notion.so, and the resulting `client_id` / `client_secret` go into TieTide's environment variables. They identify _TieTide_ to _Notion_. Every TieTide customer who clicks "Connect Notion" uses the same pair.
2. **Customer tokens (`access_token` + workspace metadata)** belong to the individual user who installed the integration into their Notion workspace. Stored encrypted (libsodium) in the `Connection` table — one row per (user, workspace) pair.

This guide covers step 1 for Notion. Without it, `GET /v1/connections/oauth/start?provider=notion` returns `503 OAuth provider not configured: missing environment variable NOTION_OAUTH_REDIRECT_URI` (or `_CLIENT_ID` / `_CLIENT_SECRET`).

### Internal vs Public integrations

Notion has two integration types:

- **Internal** — single-workspace, no OAuth flow. You hand out a token. Simplest, but every TieTide user would share the same workspace. **Not what you want for TieTide.**
- **Public** — proper OAuth, any Notion user can install. Required if you want different users on different workspaces. **This is the one you want.**

This guide covers **Public**.

## Steps

### 1. Create a Notion integration

1. Open <https://www.notion.so/my-integrations>.
2. **+ New integration**.
3. Name: `TieTide`. Logo: optional.
4. **Associated workspace**: pick any workspace you own (you'll be the first user of your own integration).
5. **Type**: select **Public**.
6. Fill the public-integration fields:
   - **Company name**: TieTide (or your handle).
   - **Website**: any URL — `https://github.com/HigorAz/tietide` works for now.
   - **Privacy policy** / **Terms of use**: required for public integrations. Use a placeholder URL during development; Notion does not verify until you publish.
   - **Redirect URIs**: Notion accepts multiple URIs on a single integration — add one per environment you plan to run so you don't have to come back later:
     ```
     http://localhost:3030/v1/connections/oauth/callback?provider=notion
     https://<your-domain>/v1/connections/oauth/callback?provider=notion
     ```

     - Each URI must match the `NOTION_OAUTH_REDIRECT_URI` of its own environment byte-for-byte.
     - **HTTPS is required** for any non-localhost URI.
     - Skip the second URI for now if you don't have a domain yet — you can add it later via the **Distribution** tab.
7. **Submit**.

### 2. Pick capabilities (scopes)

Still on the integration page → **Capabilities** tab:

- **Read content** — required for the `notion-query-database` action.
- **Update content** — required for the `notion-update-page` action.
- **Insert content** — required for the `notion-create-page` action.
- **Read user information without email** — usually fine.

Save.

### 3. Grab the OAuth credentials

1. **Secrets** tab → copy **OAuth client ID** and **OAuth client secret**.
2. Notion shows the secret in plaintext once on this page — copy it now.

### 4. Populate `.env`

Open `.env` at the repo root and set:

```env
NOTION_OAUTH_CLIENT_ID=<client-id-from-step-3>
NOTION_OAUTH_CLIENT_SECRET=<client-secret-from-step-3>
NOTION_OAUTH_REDIRECT_URI=http://localhost:3030/v1/connections/oauth/callback?provider=notion
```

### 5. Restart the API and test end-to-end

```powershell
pnpm --filter @tietide/api dev
```

Then in the SPA:

1. Log in to TieTide.
2. Go to **Connections** → pick **Notion** → label it (e.g. "My Notion") → **Connect**.
3. Browser redirects to `api.notion.com/v1/oauth/authorize?...` — Notion's consent screen for the TieTide integration.
4. Pick which **pages or databases** to grant access to (Notion's permission model is page-scoped — you select what the integration can see). **Allow access**.
5. Notion redirects back to `localhost:3030/v1/connections/oauth/callback?provider=notion&code=...` → TieTide exchanges the code → SPA lands on `/connections?status=success&id=<connection-uuid>`.
6. A new `Connection` row exists with encrypted `access_token`, `workspaceId`, `workspaceName`, and `botId`.

If step 3 errors with `redirect_uri does not match`, the URL in step 1 doesn't match `NOTION_OAUTH_REDIRECT_URI` exactly.

## Promoting to production

When you deploy to a real domain (e.g. `app.tietide.com`):

1. On the integration page → **Distribution** tab → add `https://app.tietide.com/v1/connections/oauth/callback?provider=notion` to **Redirect URIs**.
2. Update production env: `NOTION_OAUTH_REDIRECT_URI=https://app.tietide.com/v1/connections/oauth/callback?provider=notion`.
3. Replace the placeholder privacy policy / terms URLs with real ones before submitting for verification.
4. Notion does not have a heavyweight review like Google — public integrations work for any user immediately, you just need to pass spam/abuse checks if you want listing in the Notion integration gallery.

## Free-tier limits

- **Notion free plan** is enough — you can read/write pages and databases your integration has access to.
- **API rate limit**: 3 requests/sec/integration (per the Notion docs). Plenty for personal automations; you'd need backoff for high-volume use.
- **Block-children writes** count against rate limits the same as any other call.

## Troubleshooting

- **The integration can't see a page**: you have to share that page (or its parent) with the integration explicitly inside Notion — `Share` button on the page → invite the integration by name. The OAuth flow doesn't auto-grant access; users pick what to grant in step 4.
- **`unauthorized` errors after OAuth succeeds**: the customer didn't grant access to any pages in step 4. Their connection technically exists but can't read anything.
