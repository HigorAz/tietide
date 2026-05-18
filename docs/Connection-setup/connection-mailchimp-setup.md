# Mailchimp Connection Setup

> Audience: TieTide user setting up a personal Mailchimp connection.
> Time: ~5 minutes.

## Why this step exists

Mailchimp connections in TieTide use an **API key** plus a **data center prefix**. Mailchimp's REST API is region-pinned — every request goes to `https://<dc>.api.mailchimp.com/3.0/`, where `<dc>` is something like `us1`, `us21`, `eu2`. TieTide stores both fields so the worker can build the right URL per request.

The validator in `packages/shared/src/schemas/connections.schema.ts:176-183` accepts:

- `apiKey` — the Mailchimp API key (looks like `<random>-<dc>`, e.g. `abc123def456-us21`).
- `dataCenter` — the trailing suffix from the API key, lowercase letters then digits, e.g. `us1`, `us21`, `eu2`.

Both stored encrypted at rest with libsodium; never returned in plaintext after submission.

## Steps

### 1. Find your data center

This is the easiest source of error, so do it first.

1. Sign in to <https://mailchimp.com/>.
2. After login, look at the URL bar. It will be something like `https://us21.admin.mailchimp.com/account/...`.
3. The subdomain before `.admin.mailchimp.com` is your data center. Examples: `us1`, `us21`, `eu2`. **Note it down.**

### 2. Generate an API key

1. While logged in, open <https://admin.mailchimp.com/account/api/> (or top-right avatar → **Account & billing** → **Extras** → **API keys**).
2. **Create A Key**.
3. **Name**: `TieTide`.
4. Mailchimp shows the new key in the list, formatted `<32-hex-chars>-<dc>` — for example, a key ending in `-us21` belongs to the `us21` data center. The suffix after the dash is also your data center — sanity-check it matches step 1.
5. Copy the **whole key** (including the `-us21` suffix). Mailchimp shows it in the table even after you navigate away, so it's recoverable.

### 3. Add the connection in TieTide

1. Log in to TieTide.
2. Go to **Connections** → pick **Mailchimp**.
3. Fill the form:
   - **Connection name**: e.g. `My Mailchimp`.
   - **Api Key**: paste the full key from step 2 (including the `-us21` suffix).
   - **Data Center**: type the data center from step 1 / 2 (just the prefix, e.g. `us21`, no dash).
4. **Connect**.

The form is generated from `mailchimpApiKeyConfigSchema`. The `dataCenter` field must match the regex `^[a-z]{2}\d+$` — two lowercase letters followed by digits.

### 4. Test the connection

On the new `Connection` row, click **Test**. TieTide calls `https://<dc>.api.mailchimp.com/3.0/ping` with HTTP Basic Auth (`anystring:<apiKey>`). `Test succeeded (<latencyMs>ms)` confirms the key is valid and the data center is correct.

If you get `Wrong Datacenter` or `401 Unauthorized`, the most likely cause is mismatched key + dataCenter. Re-check step 1.

## Free-tier limits

- **Mailchimp Free plan**: 500 contacts, 1,000 monthly email sends. Enough for personal automations or a small list.
- **API rate limit**: 10 simultaneous connections/account; no documented per-second cap. Generous for personal use.
- **API keys are free and unlimited** — generate as many as you want, name them per app.

## Rotating the key

To rotate:

1. <https://admin.mailchimp.com/account/api/> → click the trash icon next to the old key to disable it.
2. Create a new one (step 2).
3. In TieTide → revoke the old connection → create a new one with the new key + same data center.

## Troubleshooting

- **`Wrong Datacenter`**: `dataCenter` doesn't match the suffix on the API key. Both should be the same (e.g. key ends `-us21` → data center is `us21`).
- **`API Key Disabled`**: you disabled the key in the Mailchimp dashboard. Re-enable or generate a new one.
- **`User does not have access to the requested operation`**: your Mailchimp user doesn't have the role required for the action (e.g. you need "Manager" or higher to send campaigns). Check **Account & billing** → **Users**.
