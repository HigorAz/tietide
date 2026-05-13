# Stripe Connection Setup

> Audience: TieTide user setting up a personal Stripe connection for testing.
> Time: ~5 minutes.

## ⚠️ Use test mode

**Always use Stripe's test mode for TieTide MVP/personal use.** Live keys can move real money. The rest of this guide assumes test mode. Live mode setup is identical but the keys start with `sk_live_` instead of `sk_test_`.

## Why this step exists

Stripe connections in TieTide use a **secret API key** that you copy from the Stripe Dashboard and paste into the SPA. The value is stored encrypted at rest with libsodium and never leaves the server in plaintext after you submit the form.

The validator in `packages/shared/src/schemas/connections.schema.ts:46-49` accepts `apiKey` (required) and `accountId` (optional, used for Stripe Connect platform accounts — leave blank unless you know you need it).

## Steps

### 1. Create a Stripe account

1. Open <https://dashboard.stripe.com/register>.
2. Sign up with your email. You don't need to activate the account or fill in business details — **test mode works immediately**, only **live mode** requires identity verification.

### 2. Grab the test secret key

1. Once logged in, make sure the **Test mode** toggle in the top-right is **ON** (the URL should contain `/test/`).
2. Left nav → **Developers** → **API keys** (or go straight to <https://dashboard.stripe.com/test/apikeys>).
3. Under **Standard keys** you'll see:
   - **Publishable key** — `pk_test_…`. **Do not use this** for TieTide — it's the client-side key.
   - **Secret key** — `sk_test_…`. Click **Reveal test key** and copy this one.

### 3. Add the connection in TieTide

1. Log in to TieTide.
2. Go to **Connections** → pick **Stripe**.
3. Fill the form:
   - **Connection name**: e.g. `My Stripe Test`.
   - **Api Key**: paste the `sk_test_…` from step 2.
   - **Account Id**: leave blank for normal use.
4. **Connect**.

The form is generated from `stripeApiKeyConfigSchema`. `accountId` is only used if you're building on top of Stripe Connect and need to make API calls on behalf of a connected account — for a single Stripe account, omit it.

### 4. Test the connection

On the new `Connection` row, click **Test**. TieTide calls Stripe's `/v1/balance` endpoint with your key. `Test succeeded (<latencyMs>ms)` confirms the key is valid.

## Free-tier limits

- **Stripe test mode is free and unlimited.** You can create unlimited test customers, charges, subscriptions — all in fake money.
- **API rate limit (test mode)**: 25 requests/sec read, 25 requests/sec write. Generous for any personal automation.
- **Live mode**: Stripe takes 2.9% + $0.30 per successful charge. No monthly fee. You can register an account in live mode without ever taking a real charge.

## Test card numbers

In test mode, every charge attempt with a real card number fails. Use Stripe's test cards:

- `4242 4242 4242 4242` — succeeds.
- `4000 0000 0000 0002` — declined.
- `4000 0027 6000 3184` — requires 3D Secure authentication.
- Any future expiry, any 3-digit CVC, any postal code.

Full list: <https://stripe.com/docs/testing>.

## Webhooks (Stripe triggers)

TieTide's Stripe triggers (`stripe-event-received`, including `charge.succeeded`, `customer.created`, etc.) work via the public endpoint `POST /v1/provider-webhooks/stripe/<subscriptionId>` (see `CLAUDE.md` Section 8). Setup:

1. Stripe Dashboard → **Developers** → **Webhooks** → **+ Add endpoint**.
2. **Endpoint URL**: your TieTide API's public URL + the path above. For local dev, use a tunnel (`cloudflared`, `ngrok`); Stripe will not POST to `localhost`.
3. Pick the events you want to listen for.
4. Stripe shows the **Signing secret** (`whsec_…`) — this gets stored in `ProviderSubscription.secretEnc` by the trigger activation flow, encrypted at rest. The activation flow is automatic when you publish a workflow with a Stripe trigger.

## Rotating the key

If a key leaks:

1. Stripe Dashboard → **Developers** → **API keys** → click **Roll** next to the secret key. Stripe issues a new key; the old one stops working in ~24 hours (configurable).
2. In TieTide → revoke the old connection → create a new one with the same name and the new key.

## Troubleshooting

- **`Invalid API Key`**: typo or you copied the publishable key instead of the secret key. The secret starts with `sk_test_`, not `pk_test_`.
- **`Test/live mismatch`**: you used a test key against a live-mode resource ID, or vice versa. Stripe keys are mode-scoped — test keys only see test data.
- **Webhook events not arriving**: your TieTide API URL isn't publicly reachable, or the event type isn't subscribed in the Stripe dashboard.
