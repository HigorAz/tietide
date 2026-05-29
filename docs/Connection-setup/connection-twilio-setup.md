# Twilio Connection Setup

> Audience: TieTide user setting up a personal Twilio connection.
> Time: ~5 minutes.

## Why this step exists

Twilio connections in TieTide use an **Account SID + Auth Token** pair — the master credentials Twilio issues per account. They're sent as HTTP Basic auth (`Basic base64(accountSid:authToken)`) on every Twilio REST call. Both values are stored encrypted at rest with libsodium and never leave the server in plaintext after you submit the form.

The validator in `packages/shared/src/schemas/connections.schema.ts` enforces the canonical SID shape (`AC` + 32 chars).

## Steps

### 1. Sign up / sign in at Twilio

1. Open <https://console.twilio.com/>.
2. Sign in, or create an account (free trial gives you a small balance + a sandbox phone number).

### 2. Copy your Account SID and Auth Token

On the **Account Dashboard** (top of the console):

- **Account SID** — starts with `AC`, e.g. `AC00000000000000000000000000000000`. Copy this; it's `accountSid` in TieTide.
- **Auth Token** — click **Show** → **Copy**. This is `authToken`. Twilio rotates this on demand from this same page.

### 3. (Optional) Get a phone number

For SMS/voice actions to actually deliver, you need a Twilio number. **Phone Numbers → Manage → Buy a number**, or use the **trial sandbox number** Twilio gave you. Numbers are E.164 format (`+14155551212`).

For WhatsApp, the sandbox sender is `whatsapp:+14155238886` and recipients must join your sandbox via the join code Twilio shows on the **Messaging → Try it out → Send a WhatsApp message** page.

### 4. Add the connection in TieTide

1. Log in to TieTide.
2. Go to **Connections** → pick **Twilio**.
3. Fill the form:
   - **Connection name**: e.g. `My Twilio`.
   - **Account Sid**: paste from step 2.
   - **Auth Token**: paste from step 2.
4. **Connect**.

### 5. Test the connection

On the new `Connection` row, click **Test**. TieTide calls `/2010-04-01/Accounts/{sid}.json` with your credentials. `Test succeeded (<latencyMs>ms)` confirms both values are valid.

## Nodes available

All Twilio nodes share the same connection.

**Send actions:**

- `twilio-send-sms` — POST `/Messages.json` with `To`/`From`/`Body`.
- `twilio-send-whatsapp` — POST `/Messages.json` using an approved Content template (`HX…` SID + variables).
- `twilio-make-call` — POST `/Calls.json` with `To`/`From` and either a `Url` (TwiML URL Twilio fetches) or inline `Twiml`.

**Read actions:**

- `twilio-get-message` — GET `/Messages/{messageSid}.json`. Returns the message's delivery status (`queued`, `sent`, `delivered`, `failed`, `undelivered`) and any `error_code`/`error_message`. Useful for "verify the SMS landed" workflows.
- `twilio-list-messages` — GET `/Messages.json` with optional `To`/`From` filters and `PageSize` (1–1000, default 20).

**Push trigger:**

- `twilio-sms-received` — TieTide updates an `IncomingPhoneNumber`'s `sms_url` to point at `POST /v1/provider-webhooks/twilio/<subscriptionId>` on activation. Inbound SMS to that number fires the workflow; signature is verified via `X-Twilio-Signature` HMAC.

## Free-tier limits

- **Trial account**: ~$15 USD credit, one verified phone number you can send to, sandbox WhatsApp / voice. Trial messages have a "Sent from your Twilio trial account" prefix.
- **Rate limits**: SMS 1 msg/sec/number (long codes); voice 1 outbound call/sec/number. Plenty for personal automations.

## Rotating credentials

1. Twilio console → **Account Dashboard** → **Auth Token** → **Request a secondary auth token**, promote it, then revoke the old one.
2. In TieTide → revoke the old connection → create a new one with the same name and the new auth token (accountSid stays the same).

## Troubleshooting

- **`Authenticate` / HTTP 401**: the auth token was rotated in the Twilio console or you copied a stale value. Re-copy and recreate the connection.
- **`The 'From' phone number ... is not a Twilio phone number`**: you're trying to send from a number you don't own on this account. Pick a Twilio-issued number from **Phone Numbers → Active numbers**.
- **WhatsApp trial: `... has not initiated a conversation with this number`**: the recipient must first send the join-sandbox code to the Twilio sandbox number. Check the Messaging sandbox page for the current code.
- **Inbound SMS trigger never fires**: the `sms_url` on the number didn't update — confirm the workflow activated successfully and that the API is publicly reachable (Twilio won't POST to `localhost`).
