# Calendly Connection Setup

> Audience: TieTide user setting up a personal Calendly connection.
> Time: ~3 minutes.

## Why this step exists

Calendly v2 API uses long-lived **personal access tokens** — no OAuth refresh flow, no expiry. You generate one in Calendly's integrations page and paste it into the SPA. The value is stored encrypted at rest with libsodium and never leaves the server in plaintext after you submit the form.

The validator in `packages/shared/src/schemas/connections.schema.ts:186-188` accepts `apiKey` (max 512 chars — Calendly tokens are JWT-shaped, hence the higher limit than other providers).

## Steps

### 1. Open Calendly's integrations page

1. Sign in to <https://calendly.com/>.
2. Top-right avatar → **Integrations & apps** → **API & webhooks** (or open <https://calendly.com/integrations/api_webhooks> directly).

### 2. Generate a personal access token

1. Scroll to **Your personal access tokens** → **Generate new token**.
2. **Name**: `TieTide`.
3. Calendly displays the token in plaintext **once**, on this screen. It's a long JWT-shaped string (~200+ chars).
4. Copy it now — Calendly hides it forever once you navigate away.

### 3. Add the connection in TieTide

1. Log in to TieTide.
2. Go to **Connections** → pick **Calendly**.
3. Fill the form:
   - **Connection name**: e.g. `My Calendly`.
   - **Api Key**: paste the token from step 2.
4. **Connect**.

The form is generated from `calendlyApiKeyConfigSchema`.

### 4. Test the connection

On the new `Connection` row, click **Test**. TieTide calls Calendly's `/users/me` endpoint with your token. `Test succeeded (<latencyMs>ms)` confirms the token is valid.

## Free-tier limits

- **Calendly Free plan** ("Basic"): 1 event type, unlimited 1:1 meetings. The v2 API is available on the free tier.
- **Calendly Standard / Teams** (paid): unlock additional event types, group events, routing. The same API key works regardless of tier.
- **API rate limit**: 1,000 requests/minute (per the Calendly docs). Plenty for personal use.

## Webhooks (Calendly triggers)

TieTide's `calendly-event-scheduled` trigger uses webhook subscriptions. The flow:

1. When you publish a workflow with the Calendly trigger, TieTide calls Calendly's `/webhook_subscriptions` endpoint (using your token) to register a subscription pointing at `POST /v1/provider-webhooks/calendly/<subscriptionId>` (see `CLAUDE.md` Section 8).
2. For local development, your TieTide API must be publicly reachable — Calendly will not POST to `localhost`. Use a tunnel like `cloudflared` or `ngrok`.
3. The signing key for inbound webhooks is captured during subscription creation and stored encrypted in `ProviderSubscription.secretEnc`.

## Rotating the token

To rotate:

1. <https://calendly.com/integrations/api_webhooks> → trash icon next to the old token.
2. Generate a new one (steps 1-2).
3. In TieTide → revoke the old connection → create a new one with the new token.

## Troubleshooting

- **`401 Unauthorized`**: token typo / paste truncation. Calendly tokens are very long; make sure your editor didn't break a line.
- **`403 forbidden`**: your Calendly plan doesn't support the resource you're trying to access (e.g. Routing Forms requires Teams plan).
- **Webhook subscriptions fail**: your TieTide API URL isn't publicly reachable, or the URL in the subscription doesn't match Calendly's signed payload expectations.
