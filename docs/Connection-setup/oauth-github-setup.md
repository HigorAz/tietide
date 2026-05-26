# GitHub OAuth Setup (Platform-Owner Guide)

> Audience: Whoever runs TieTide — Higor for now, future operators later.
> Time: ~5 minutes the first time you do it.

## Why this step exists

GitHub connections used to be a **personal access token** (each user pasted a PAT).
They are now a one-click **"Connect with GitHub"** OAuth flow, like Google/Microsoft/Notion.

OAuth has two distinct credentials, and confusing them is the most common setup mistake:

1. **Platform credentials (`client_id` + `client_secret`)** belong to **TieTide as a product**.
   You register _one_ GitHub OAuth App and its `client_id` / `client_secret` go into TieTide's
   environment variables. Every TieTide user who clicks "Connect with GitHub" uses the same pair.
2. **User tokens (`access_token`)** belong to the individual user who authorized the app. Stored
   encrypted (libsodium XChaCha20-Poly1305) in the `Connection` table — one row per (user, grant).

This guide covers step 1. Without it, `GET /v1/connections/oauth/start?provider=github` returns
`503 OAuth provider not configured: missing environment variable GITHUB_OAUTH_REDIRECT_URI`
(or `_CLIENT_ID` / `_CLIENT_SECRET`).

### OAuth App, not GitHub App

GitHub has two app types. TieTide uses a classic **OAuth App**, which issues a **non-expiring**
user access token (`gho_…`) with **no refresh token**. That keeps the integration simple — there
is nothing to refresh; the token works until the user revokes it. (A GitHub _App_ with
user-to-server expiring tokens would require refresh wiring we deliberately don't have.)

## Steps

### 1. Create a GitHub OAuth App

1. Open <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**.
   (For an organization, use `https://github.com/organizations/<org>/settings/applications`.)
2. **Application name**: `TieTide`.
3. **Homepage URL**: any URL — `https://github.com/HigorAz/tietide` works.
4. **Authorization callback URL** — this must match `GITHUB_OAUTH_REDIRECT_URI` byte-for-byte
   (without the query string; GitHub matches host + path and allows extra query params):
   ```
   http://localhost:3031/v1/connections/oauth/callback
   ```
   > **One callback URL per app.** Unlike Google/Notion, a GitHub OAuth App allows only a single
   > callback URL. The TEST stack (`localhost:3031`) and PROD (`tietide.com`) therefore need
   > **separate OAuth Apps**, each with its own client id/secret and env values. Never register
   > `localhost:3030`.
5. **Register application**.

### 2. Generate a client secret

On the app page:

1. Copy the **Client ID**.
2. **Generate a new client secret** → copy it now (GitHub shows it once).

### 3. Populate `.env`

Open `.env` for the stack you're configuring (TEST or PROD) and set:

```env
GITHUB_OAUTH_CLIENT_ID=<client-id-from-step-2>
GITHUB_OAUTH_CLIENT_SECRET=<client-secret-from-step-2>
GITHUB_OAUTH_REDIRECT_URI=http://localhost:3031/v1/connections/oauth/callback?provider=github
```

(For PROD: `https://tietide.com/v1/connections/oauth/callback?provider=github`, pointing at the
PROD OAuth App's credentials.)

### 4. Restart the API and test end-to-end

```powershell
pnpm --filter @tietide/api dev
```

Then in the SPA:

1. Log in to TieTide.
2. **Connections** → pick **GitHub** → the OAuth modal opens with a scope picker:
   - **Account** (`read:user`, always granted) — backs the connection health check.
   - **Repositories** (`repo`, on by default) — read/write issues, pull requests, and comments,
     including private repos. Required for the three GitHub actions.
   - **Public repositories only** (`public_repo`, off) — pick this _instead_ of Repositories to
     limit the grant to public repos (a smaller blast radius; actions will fail on private repos).
3. Name the connection (e.g. "My GitHub") → **Connect with GitHub**.
4. Browser redirects to `github.com/login/oauth/authorize?...` — GitHub's consent screen. **Authorize**.
5. GitHub redirects back to `…/v1/connections/oauth/callback?provider=github&code=…` → TieTide
   exchanges the code → SPA lands on `/connections?status=success&id=<connection-uuid>`.
6. A new `Connection` row exists with `type=OAUTH2` and an encrypted `accessToken` (no refresh token).

If step 4 errors with `redirect_uri … is not associated`, the callback URL in step 1 doesn't match
`GITHUB_OAUTH_REDIRECT_URI`.

### 5. Verify the connection

On the new `Connection` row click **Test** — TieTide calls GitHub's `/user` with the token and
reports `Test succeeded (<latencyMs>ms)`. A failure means the grant was revoked or lacks `read:user`.

## Scopes reference

| Scope          | Why                                                              |
|----------------|------------------------------------------------------------------|
| `read:user`    | `/user` health check + account identity (always requested)       |
| `repo`         | Create issues, PRs, and comments on public **and** private repos |
| `public_repo`  | Same, but public repositories only                               |

The server enforces this allow-list (`GithubOAuthProvider.allowedScopes`). Requesting any other
scope returns `400 Scope "<x>" is not allowed for provider "github"`.

## Migrating from the old PAT connections

Connections created under the previous PAT model (`type=API_KEY`, `config={ apiKey }`) are **not**
compatible with the OAuth client — actions and the health check now read `config.accessToken`.
Delete any old GitHub connection and reconnect via the OAuth flow above. (There is no automatic
in-place migration.)

## Free-tier limits

- GitHub OAuth Apps are free and unlimited.
- **API rate limit**: 5,000 requests/hour for authenticated user tokens — plenty for personal
  automations.

## Troubleshooting

- **`bad_verification_code`**: the authorization code expired or was reused — retry the connect flow.
- **Action returns 401 and the connection flips to `EXPIRED`**: the user revoked the grant on
  github.com (OAuth App tokens don't expire otherwise). Reconnect to restore it.
- **`redirect_uri` mismatch**: the OAuth App's single callback URL must match this stack's
  `GITHUB_OAUTH_REDIRECT_URI`. TEST and PROD need separate OAuth Apps.
