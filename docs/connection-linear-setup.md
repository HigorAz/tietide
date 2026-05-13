# Linear Connection Setup

> Audience: TieTide user setting up a personal Linear connection.
> Time: ~3 minutes.

## Why this step exists

Linear connections in TieTide use a **personal API key** — a long-lived token you generate in Linear's settings and paste into the SPA. The value is stored encrypted at rest with libsodium and never leaves the server in plaintext after you submit the form.

The validator in `packages/shared/src/schemas/connections.schema.ts:129-135` enforces the Linear key prefix `lin_api_…`.

## Steps

### 1. Open Linear's API settings

1. Sign in to <https://linear.app/>.
2. Top-left avatar → **Settings** → **API** (or open <https://linear.app/settings/api> directly).

### 2. Create a personal API key

1. Under **Personal API keys** → **+ Create key**.
2. **Label**: `TieTide`.
3. Linear generates the key immediately. It starts with `lin_api_` followed by a long token string.
4. Copy the value **right now** — Linear shows it once.

### 3. Add the connection in TieTide

1. Log in to TieTide.
2. Go to **Connections** → pick **Linear**.
3. Fill the form:
   - **Connection name**: e.g. `My Linear`.
   - **Api Key**: paste the key from step 2.
4. **Connect**.

The form is generated from `linearApiKeyConfigSchema`. If you paste a string that doesn't start with `lin_api_`, you'll see "apiKey must be a Linear API key (lin*api*…)".

### 4. Test the connection

On the new `Connection` row, click **Test**. TieTide calls Linear's GraphQL `viewer { id }` query with your token. `Test succeeded (<latencyMs>ms)` confirms the key is valid.

## Free-tier limits

- **Linear Free plan**: up to 10 users, unlimited issues. Enough for personal use.
- **Personal API keys** are unlimited and free.
- **API rate limit**: 1,500 requests/hour per key (per Linear's docs). The GraphQL API is generous; you'd need to be making a lot of automations to hit it.

## Scope

Personal API keys inherit the **full permissions of the user who created them**. There's no scope picker — the key can do anything you can do (create/update/delete issues, comment, change status). For a smaller blast radius, consider creating a separate Linear user for automations and generating the key under that account.

## Rotating the key

To rotate manually:

1. Generate a new key (steps 1-2).
2. In TieTide → **Connections** → revoke the old connection → create a new one with the same name.
3. Back in Linear → revoke the old key from the API settings page so it can no longer be used.

## Troubleshooting

- **`AUTHENTICATION_ERROR`**: token is invalid or was revoked. Generate a new one.
- **Actions fail on a specific team**: the user who created the key doesn't have access to that team. Linear API keys are user-scoped.
