# GitHub Connection Setup

> Audience: TieTide user setting up a personal GitHub connection.
> Time: ~5 minutes.

## Why this step exists

Unlike OAuth providers (Google, Microsoft, Slack), GitHub connections in TieTide use a **personal access token (PAT)** — a credential you generate yourself on github.com and paste into the SPA. There is no platform-level `client_id` / `client_secret`; each TieTide user creates and pastes their own token.

The token is stored encrypted at rest with libsodium (XChaCha20-Poly1305) in the `Connection` table — the value never leaves the server in plaintext after you submit the form.

The validator in `packages/shared/src/schemas/connections.schema.ts:139-147` accepts all six GitHub token prefixes:

- `ghp_…` — classic personal access token
- `github_pat_…` — fine-grained personal access token (**recommended**)
- `gho_…` — OAuth user-to-server token
- `ghu_…` / `ghs_…` / `ghr_…` — GitHub App installation / user / refresh tokens

## Steps

### 1. Open GitHub's token page

1. Sign in to <https://github.com/>.
2. Top-right avatar → **Settings** → **Developer settings** (bottom of the left nav) → **Personal access tokens** → **Fine-grained tokens**.

### 2. Generate a new fine-grained token

Fine-grained tokens are GitHub's modern format — scoped per-repo and with explicit permission categories. Use these unless you have a reason to use classic tokens.

1. **Generate new token**.
2. **Token name**: `TieTide`.
3. **Expiration**: 90 days is sensible. You can also pick "Custom" and go longer for personal use.
4. **Repository access**:
   - Pick **All repositories** if you want TieTide to act on every repo you own.
   - Pick **Only select repositories** for a smaller blast radius (recommended for personal use).
5. **Repository permissions** — tick the ones matching the actions in `apps/worker/src/nodes/connectors/github/`:
   - **Issues**: Read and write — for `github-create-issue` and `github-comment-issue`.
   - **Pull requests**: Read and write — for `github-create-pr`.
   - **Contents**: Read (or Read and write if you need to commit files).
   - **Metadata**: Read (granted by default — required).
6. **Account permissions**: usually none needed for the current actions.
7. Scroll down → **Generate token**.

### 3. Copy the token

GitHub shows the token **once**, prefixed `github_pat_…`. Copy it now — there's no way to retrieve it later (you'd have to regenerate).

### 4. Add the connection in TieTide

1. Log in to TieTide.
2. Go to **Connections** → pick **GitHub**.
3. Fill the form:
   - **Connection name**: anything, e.g. `My GitHub`.
   - **Api Key**: paste the token from step 3.
4. **Connect**.

The form is generated from `githubApiKeyConfigSchema` and validates the prefix client-side — if you paste a string that doesn't match one of the six accepted prefixes, you'll see "apiKey must be a GitHub token (ghp*/gho*/ghu*/ghs*/ghr*/github_pat*…)".

### 5. Test the connection

On the new `Connection` row, click **Test**. TieTide calls GitHub's `/user` endpoint with your token and reports `Test succeeded (<latencyMs>ms)` on success. A failure means the token is invalid, expired, or lacks the `read:user` permission.

## Free-tier limits

- **Personal access tokens** are unlimited and free.
- **API rate limit**: 5,000 requests/hour for authenticated personal accounts. Plenty for any personal automation.
- **GitHub Free plan** is enough — unlimited public + private repos, all the actions in TieTide work without paying.

## Classic tokens vs fine-grained

If you have an automation that needs SSO-protected org access or a permission not yet available on fine-grained tokens, fall back to **Classic tokens** (`ghp_…`) with the `repo` scope. TieTide accepts both formats; fine-grained is preferred for security.

## Rotating the token

GitHub tokens expire on their configured date. To rotate:

1. Generate a new token (steps 1-3).
2. In TieTide → **Connections** → revoke the old connection → create a new one with the same name.
3. Workflows reference connections by ID, so changing the underlying token without changing the connection ID is not currently supported — recreate the connection or wait for an "update credential" feature.
