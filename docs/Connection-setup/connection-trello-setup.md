# Trello Connection Setup

> Audience: TieTide user setting up a personal Trello connection.
> Time: ~5 minutes.

## Why this step exists

Trello connections in TieTide use **API key + user token** — a two-credential model that's not OAuth in the TieTide flow. You generate both on trello.com and paste them into the SPA. Both values are stored encrypted at rest with libsodium and never leave the server in plaintext after you submit the form.

The validator in `packages/shared/src/schemas/connections.schema.ts:106-117` accepts:

- `apiKey` — the alphanumeric **developer key** from <https://trello.com/app-key>.
- `token` — the per-user **token** authorising read/write on your boards.

## Steps

### 1. Get your developer API key

1. Sign in to <https://trello.com/>.
2. Open <https://trello.com/app-key>.
   - If Trello asks you to create a **Power-Up** first, do that — pick **New** → name it `TieTide` → workspace = your personal one → **Create**. The Power-Up's settings page then shows the API key.
3. Copy **API key**. This is `apiKey` in the TieTide form.

### 2. Generate a user token

Still on the API key page (or your Power-Up's API key page):

1. Click the **Token** link next to the API key (or the "manually generate a Token" link near the bottom). It opens an authorization page.
2. Review the scopes (read + write on your boards). **Allow**.
3. Trello displays a long token string. Copy it. This is `token` in the TieTide form.

### 3. Add the connection in TieTide

1. Log in to TieTide.
2. Go to **Connections** → pick **Trello**.
3. Fill the form:
   - **Connection name**: e.g. `My Trello`.
   - **Api Key**: paste the developer key from step 1.
   - **Token**: paste the user token from step 2.
4. **Connect**.

The form is generated from `trelloApiKeyConfigSchema`. Both fields must be alphanumeric (with `_` or `-` allowed); any other characters fail client-side validation.

### 4. Test the connection

On the new `Connection` row, click **Test**. TieTide calls Trello's `/members/me` endpoint with your credentials. `Test succeeded (<latencyMs>ms)` confirms both `apiKey` and `token` are valid and matched.

## Free-tier limits

- **Trello Free plan** is enough for most personal automations — 10 boards per workspace, unlimited cards, unlimited Power-Ups per board.
- **API rate limit**: 300 requests / 10 sec / API key + 100 requests / 10 sec / token. Plenty for personal use.
- **Power-Ups**: Trello requires you to create at least one Power-Up to access the API key page nowadays. You don't need to publish or distribute it — just create it to expose the key.

## Token expiry and revocation

- The user token does **not** expire by default. You can pass `&expiration=1day` in the manual generation flow if you want a short-lived token, but for personal use the never-expires default is fine.
- To revoke: <https://trello.com/my/account> → **Applications** tab → click **Revoke** next to your token.

## Troubleshooting

- **`invalid token`**: copy/paste truncation. Tokens are long (64+ chars); make sure you grabbed the whole thing.
- **`unauthorized permission requested`**: when generating the token, you clicked "Deny" instead of "Allow". Repeat step 2.
- **Card actions return 401 on specific boards**: the user who generated the token doesn't have access to those boards. Trello tokens inherit user-level permissions.
