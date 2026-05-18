# Discord Connection Setup

> Audience: TieTide user setting up a personal Discord connection.
> Time: ~3 minutes (Webhook) or ~10 minutes (Bot).

TieTide has **two** Discord providers, used for different things. Pick the one that matches your use case:

| Provider              | Use case                                                                                                                | Setup difficulty |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Discord (Webhook)** | Post messages **into a single Discord channel** you own. One-way (TieTide → Discord). No bot, no commands, no triggers. | 2 minutes        |
| **Discord (Bot)**     | Receive slash-command interactions from any server the bot is installed in. Required for triggers.                      | 10 minutes       |

Both store credentials encrypted at rest with libsodium; values never leave the server in plaintext after submission.

---

## Option A: Discord (Webhook) — recommended for posting only

### When to use this

You just want TieTide to drop messages into one Discord channel (notifications, alerts, daily summaries). Channel-scoped, no bot required, anyone with Manage Webhooks permission on a channel can create one.

### Steps

#### 1. Create a webhook in your channel

1. Open Discord (desktop or browser).
2. Go to the server → right-click the channel where you want messages to land → **Edit Channel** → **Integrations** tab.
3. **Webhooks** → **Create Webhook**.
4. Name the webhook (e.g. `TieTide`), pick the avatar, leave the default channel.
5. Click **Copy Webhook URL**. The URL has the form:
   ```
   https://discord.com/api/webhooks/<webhook_id>/<webhook_token>
   ```
   The `<webhook_token>` part **is** the credential — anyone with this URL can post to the channel. Treat it like a password.

#### 2. Add the connection in TieTide

1. Log in to TieTide.
2. Go to **Connections** → pick **Discord (Webhook)**.
3. Fill the form:
   - **Connection name**: e.g. `My Notifications Channel`.
   - **Webhook Url**: paste the URL from step 1.
4. **Connect**.

The form is generated from `discordWebhookConfigSchema`. The URL must match the regex `^https://(?:discord|discordapp)\.com/api/webhooks/\d+/[\w-]+$` — anything else is rejected client-side.

#### 3. Test the connection

On the new `Connection` row, click **Test**. TieTide performs a HEAD request to validate the webhook still exists. `Test succeeded (<latencyMs>ms)` confirms the URL is live.

### Free tier

Discord webhooks are **entirely free**. There's a soft limit of ~30 messages/minute/webhook — fine for personal use.

---

## Option B: Discord (Bot) — required for triggers

### When to use this

You want Discord events (slash-command interactions, messages, reactions) to **trigger workflows** in TieTide. This requires a real Discord application with a bot user.

### Steps

#### 1. Create a Discord application

1. Sign in to <https://discord.com/developers/applications>.
2. **New Application**. Name: `TieTide`. **Create**.
3. You land on the application's **General Information** page.

#### 2. Copy `applicationId` and `publicKey`

Still on **General Information**:

- **Application ID** — the numeric snowflake at the top. Copy this; it's `applicationId` in the TieTide form.
- **Public Key** — a hex string (Ed25519 public key) used to verify inbound interaction requests. Copy this; it's `publicKey`.

#### 3. Create a bot user and copy the bot token

1. Left nav → **Bot**.
2. The bot user is created automatically with the application.
3. Under **Token**, click **Reset Token** → confirm → **Copy**. This is `botToken` in the TieTide form. **Discord shows it once** — copy now.
4. Toggle **Public Bot** off if you only want yourself / approved users to install the bot.

#### 4. Configure the Interactions Endpoint URL

For the bot to receive slash commands, Discord must POST them to a public URL. TieTide handles this at `POST /v1/provider-webhooks/discord-bot/<subscriptionId>` (see `CLAUDE.md` Section 8).

1. Back on **General Information** → scroll to **Interactions Endpoint URL**.
2. Paste your TieTide API's public URL pointing at that path, e.g. `https://app.tietide.com/v1/provider-webhooks/discord-bot/<subscriptionId>`. For local dev, use a tunnel (`cloudflared`, `ngrok`).
3. Discord will immediately PING the URL to verify Ed25519 signatures work. TieTide validates the signature using the `publicKey` you copied in step 2. If everything is wired up, Discord saves the URL; otherwise it shows a verification error.

The `<subscriptionId>` is generated when you publish a workflow with a Discord trigger — wire up the workflow first, then paste the issued URL here.

#### 5. Invite the bot to a server

Left nav → **OAuth2** → **URL Generator**:

1. **Scopes**: tick `bot` and `applications.commands`.
2. **Bot Permissions**: tick the minimum your slash commands need (e.g. `Send Messages`, `Read Message History`).
3. Copy the generated **Generated URL**. Open it in a browser, pick a server you have **Manage Server** permission on, and authorize.

#### 6. Add the connection in TieTide

1. Log in to TieTide.
2. Go to **Connections** → pick **Discord (Bot)**.
3. Fill the form:
   - **Connection name**: e.g. `My Discord Bot`.
   - **Application Id**: paste from step 2.
   - **Public Key**: paste from step 2.
   - **Bot Token**: paste from step 3.
4. **Connect**.

The form is generated from `discordBotConfigSchema`. Validation:

- `applicationId` must be a numeric snowflake (digits only).
- `publicKey` must be hex (Ed25519 key, ~64 chars).
- `botToken` is a free-form string up to 256 chars.

#### 7. Test the connection

On the new `Connection` row, click **Test**. TieTide calls Discord's `/users/@me` endpoint with the bot token. `Test succeeded (<latencyMs>ms)` confirms the bot token is valid.

### Free tier

Discord bots are **entirely free**. You only need a regular Discord account to register an application.

API rate limit: 50 requests/sec/bot globally, with per-route caps. Generous for personal use.

---

## Rotating credentials

### Webhook

1. In Discord, **Edit Channel** → **Integrations** → **Webhooks** → click the webhook → **Copy URL** (it's regeneratable).
   - If you want a totally new URL, delete and recreate.
2. In TieTide → revoke the old connection → create a new one with the new URL.

### Bot

1. Discord developer portal → **Bot** → **Reset Token**. The old token stops working immediately.
2. In TieTide → revoke the old connection → create a new one with the new token (applicationId and publicKey stay the same).

---

## Troubleshooting

### Webhook

- **`Must be a Discord webhook URL`**: the URL you pasted doesn't start with `https://discord.com/api/webhooks/` (or `discordapp.com`). Re-copy from the channel's integration page.
- **`Unknown Webhook`**: the webhook was deleted in Discord. Recreate it and update the connection.

### Bot

- **Interactions Endpoint URL fails verification**: TieTide's `publicKey` doesn't match the one Discord uses to sign requests. Re-copy from the **General Information** page — the **Public Key** field, not the bot token.
- **Bot doesn't respond to slash commands**: commands need to be registered with Discord's REST API. The TieTide worker does this during workflow activation, but it requires the bot to be invited to the server first (step 5).
- **`401 Unauthorized` on bot API calls**: the bot token was reset in the developer portal. The old token is dead; rotate the connection.
