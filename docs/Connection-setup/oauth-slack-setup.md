# Slack OAuth Setup (Platform-Owner Guide)

> Audience: Whoever runs TieTide — Higor for now, future operators later.
> Time: ~15 minutes the first time you do it.

## Why this step exists

OAuth has two distinct credentials, and confusing them is the most common setup mistake:

1. **Platform credentials (`client_id` + `client_secret`)** belong to **TieTide as a product**. You register _one_ Slack app on api.slack.com, and the resulting `client_id` / `client_secret` go into TieTide's environment variables. They identify _TieTide_ to _Slack_. Every TieTide customer who clicks "Connect Slack" uses the same pair.
2. **Customer tokens (`access_token` + workspace metadata)** belong to the individual user who installed the app into their workspace. Stored encrypted (libsodium) in the `Connection` table — one row per (user, workspace) pair.

This guide covers step 1 for Slack. Without it, `GET /v1/connections/oauth/start?provider=slack` returns `503 OAuth provider not configured: missing environment variable SLACK_OAUTH_REDIRECT_URI` (or `_CLIENT_ID` / `_CLIENT_SECRET`).

Slack also has a **third** credential — `signingSecret` — that you paste into the connection form **after** OAuth completes, **only** if you intend to use Slack triggers (`slack-message-received`, `slack-reaction-added`). See step 7.

## Steps

### 1. Create a Slack app

1. Open <https://api.slack.com/apps>.
2. **Create New App** → **From scratch**.
3. App name: `TieTide`. Pick a workspace to develop in (your own).
4. **Create App**.

### 2. Configure OAuth & Permissions

1. Left nav → **OAuth & Permissions**.
2. Scroll to **Redirect URLs** → **Add New Redirect URL**. Slack lets you list multiple URLs on a single app — add one per environment you plan to run so you don't have to come back later:

   ```
   http://localhost:3030/v1/connections/oauth/callback?provider=slack
   https://<your-domain>/v1/connections/oauth/callback?provider=slack
   ```

   - Each URL must match the `SLACK_OAUTH_REDIRECT_URI` of its own environment byte-for-byte.
   - **HTTPS is required** for any non-localhost URL; Slack rejects plain `http://` for real domains.
   - Skip the second URL for now if you don't have a domain yet — you can add it later on the same page.

3. **Save URLs**.
4. Scroll to **Bot Token Scopes** → **Add an OAuth Scope** → add each of:
   - `chat:write` — post messages
   - `chat:write.public` — post in channels the bot isn't a member of (optional but handy)
   - `channels:read` — list public channels
   - `groups:read` — list private channels the bot is in
   - `reactions:read` — for the `slack-reaction-added` trigger
   - `files:write` — for the `slack-upload-file` action
   - `users:read` — resolve user IDs to display names

You can add more later; these are the minimum for the actions/triggers in `apps/worker/src/nodes/connectors/slack/`. The read/manage pack also uses `channels:history` + `channels:manage` (read history, create/invite/manage channels), `users:read.email` (find a user by email), and `reactions:write` (add reactions) — add the ones you intend to use.

#### User Token Scopes (only for `slack-search-messages`)

Slack's `search.messages` API can **only** be called with a **user token** (`xoxp`), never a bot token. So `search:read` is a _user_ scope, configured separately from the bot scopes above:

1. Still on **OAuth & Permissions**, scroll to **User Token Scopes** (a distinct section below Bot Token Scopes) → **Add an OAuth Scope** → add `search:read`.
2. That's all on the Slack side. In TieTide's connection modal, enable the **"Search (authorizes as you)"** scope group before connecting.

When that group is enabled, TieTide requests `search:read` via Slack's `user_scope` parameter, the consent screen shows an extra "act on behalf of you" grant, and the exchange returns `authed_user.access_token`. TieTide stores it as `userAccessToken` in the (encrypted) connection config, and **only** `slack-search-messages` uses it.

> **Existing connections must reconnect.** A Slack connection created before this scope was added has no user token — the `slack-search-messages` node will error with "reconnect this Slack connection with the search:read scope enabled" until you re-run the OAuth flow with the Search group on.

### 3. Grab the client credentials

1. Left nav → **Basic Information** → **App Credentials** section.
2. Copy **Client ID** and **Client Secret** (click "Show" next to Client Secret).

### 4. Populate `.env`

Open `.env` at the repo root and set:

```env
SLACK_OAUTH_CLIENT_ID=<client-id-from-step-3>
SLACK_OAUTH_CLIENT_SECRET=<client-secret-from-step-3>
SLACK_OAUTH_REDIRECT_URI=http://localhost:3030/v1/connections/oauth/callback?provider=slack
```

### 5. (Optional) Install the app to your workspace once for testing

Slack's "Install to Workspace" button (still on **OAuth & Permissions**) gives you an instant bot token for testing without going through TieTide's flow. Skip this if you just want to test the TieTide flow end-to-end — TieTide installs the app on your behalf when you click **Connect** in the SPA.

### 6. Restart the API and test end-to-end

```powershell
pnpm --filter @tietide/api dev
```

Then in the SPA:

1. Log in to TieTide.
2. Go to **Connections** → pick **Slack** → label it (e.g. "My Workspace") → **Connect**.
3. Browser redirects to `slack.com/oauth/v2/authorize?...` — Slack shows the consent screen with the scopes from step 2.
4. **Allow** → Slack redirects back to `localhost:3030/v1/connections/oauth/callback?provider=slack&code=...` → TieTide exchanges the code → SPA lands on `/connections?status=success&id=<connection-uuid>`.
5. A new `Connection` row exists with encrypted `access_token`, `teamId`, `botUserId`, and `scope` (plus `userAccessToken` + `userScope` if you enabled the Search group).

If step 3 errors with `bad_redirect_uri`, the URL in step 2 of Slack's app config doesn't match `SLACK_OAUTH_REDIRECT_URI` exactly. Slack compares strictly — trailing slashes, http vs https, and query strings all count.

### 7. (Only for triggers) Add the signing secret to the connection

Slack triggers (`slack-message-received`, `slack-reaction-added`) verify inbound Events API requests with the workspace's **signing secret**. If you only use Slack as an _action_ (post-message etc.), skip this step.

1. In your Slack app, **Basic Information** → **App Credentials** → copy **Signing Secret**.
2. In TieTide's SPA, on the Slack connection row in **Connections**, the schema accepts an optional `signingSecret` field — the form is generated from `slackOAuth2ConfigSchema` in `packages/shared/src/schemas/connections.schema.ts`. After the OAuth flow completes you can edit the connection (or recreate it with the field populated) to paste the signing secret.

Slack's **Event Subscriptions** page is where you wire up the actual events; the URL pattern is documented separately (`POST /v1/provider-webhooks/slack/<subscriptionId>` — see `CLAUDE.md` Section 8).

## Promoting to production

When you deploy to a real domain (e.g. `app.tietide.com`):

1. App settings → **OAuth & Permissions** → add a **second** redirect URL: `https://app.tietide.com/v1/connections/oauth/callback?provider=slack`. Keep the localhost one for local dev.
2. Update production env: `SLACK_OAUTH_REDIRECT_URI=https://app.tietide.com/v1/connections/oauth/callback?provider=slack`.
3. To distribute the app outside your own workspace, you'll need to submit it to the Slack App Directory (review takes days). Until then, customers can still install via a public install link as long as your app is **Public Distribution = on** under **Manage Distribution**.

## Nodes available

All Slack nodes share the same OAuth connection. Scope coverage in the SPA **Connections** modal maps to what each node needs:

**Send / write actions** (bot token, `chat:write` group):

- `slack-post-message` — post to a channel by ID.
- `slack-post-to-channel` — look up a channel by name, then post.
- `slack-upload-file` — upload a base64 file payload (`files:write`).
- `slack-update-message` — edit a previously posted message by `ts`.
- `slack-add-reaction` — add an emoji reaction (`reactions:write`).

**Read / manage actions** (bot token):

- `slack-find-user` — by email (`users:read.email`) or by name (`users:read`).
- `slack-get-channel-history` — recent messages in a channel (`channels:history`; add `groups:history` for private).
- `slack-create-channel` / `slack-invite-to-channel` — channel management (`channels:manage`).

**Search action** (user token):

- `slack-search-messages` — `search.messages`. Requires the **"Search (authorizes as you)"** scope group, which adds `search:read` under **User Token Scopes** and grants TieTide an `xoxp` user token. Bot tokens cannot call this endpoint.

**Push triggers** (Slack Events API, signing-secret HMAC):

- `slack-message-received` — needs the `message.channels` bot event.
- `slack-reaction-added` — needs the `reaction_added` bot event (`reactions:read`).
- `slack-app-mention` — needs the `app_mention` bot event (`app_mentions:read`).
- `slack-channel-created` — needs the `channel_created` bot event.

> **Reinstalling matters.** After adding new bot scopes on api.slack.com, click **Reinstall to Workspace** and reconnect the Slack connection in TieTide so the new permissions take effect.

## Free-tier limits

- **Slack free workspace** is enough for development — you can post in your own workspace, react to messages, and trigger workflows. No paid Slack plan needed.
- **API rate limits**: ~1 message/sec/channel, 100 method calls/min/workspace. Plenty for personal automations.
- **Event Subscriptions** are free. Slack does not charge for inbound webhooks.
