# Airtable Connection Setup

> Audience: TieTide user setting up a personal Airtable connection.
> Time: ~5 minutes.

## Why this step exists

Airtable connections in TieTide use a **personal access token (PAT)** — Airtable's modern auth model (the older `key…` API keys were deprecated in early 2024). You generate the token yourself at airtable.com/create/tokens and paste it into the SPA. The value is stored encrypted at rest with libsodium and never leaves the server in plaintext after you submit the form.

The validator in `packages/shared/src/schemas/connections.schema.ts:120-126` enforces the Airtable PAT prefix `pat…` (dot-delimited, e.g. `patXXXXXXXX.YYYYYY…`).

## Steps

### 1. Create a personal access token

1. Sign in to <https://airtable.com/>.
2. Open <https://airtable.com/create/tokens>.
3. **+ Create new token**.
4. **Name**: `TieTide`.
5. **Scopes** — tick the ones matching the actions in `apps/worker/src/nodes/connectors/airtable/`:
   - `data.records:read` — read records (list, get).
   - `data.records:write` — create / update / delete records.
   - `schema.bases:read` — list bases and tables (useful for the action UI's base/table picker).
6. **Access**:
   - Pick **All current and future bases in all current and future workspaces** for full access.
   - Or **Add a base** and select only the bases you want TieTide to touch (recommended for personal use — smaller blast radius).
7. **Create token**.

### 2. Copy the token

Airtable shows the token **once**, starting with `pat`. Copy it now — there's no way to retrieve it later (you'd have to regenerate).

### 3. Add the connection in TieTide

1. Log in to TieTide.
2. Go to **Connections** → pick **Airtable**.
3. Fill the form:
   - **Connection name**: e.g. `My Airtable`.
   - **Api Key**: paste the PAT from step 2.
4. **Connect**.

The form is generated from `airtableApiKeyConfigSchema`. If you paste a string that doesn't start with `pat`, you'll see "apiKey must be an Airtable PAT (pat…)".

### 4. Test the connection

On the new `Connection` row, click **Test**. TieTide calls Airtable's `/meta/whoami` endpoint with your token. `Test succeeded (<latencyMs>ms)` confirms the token is valid and has the requested scopes.

## Free-tier limits

- **Airtable Free plan**: 1,000 records per base, 5 editors per workspace, 1 GB attachments. Plenty for personal automations.
- **API rate limit**: 5 requests/sec/base. The TieTide worker handles backoff automatically when an Airtable action returns 429.
- **PATs are free and unlimited**; you can have many tokens scoped to different bases.

## Rotating the token

Airtable PATs **do not expire by default** (unlike OAuth refresh tokens). To rotate manually:

1. Generate a new token (steps 1-2).
2. In TieTide → **Connections** → revoke the old connection → create a new one with the same name.

## Troubleshooting

- **`NOT_AUTHORIZED` on a specific base**: the token's **Access** section in step 1 didn't include that base. Edit the token at <https://airtable.com/create/tokens>, add the base, save. The same token value continues to work.
- **`INVALID_SCOPE`**: an action needs a scope you didn't tick (e.g. `data.records:write` but you only granted read). Edit the token's scopes; no need to regenerate.
- **Legacy `key…` API keys**: not supported by TieTide. The regex rejects them — generate a PAT instead.
