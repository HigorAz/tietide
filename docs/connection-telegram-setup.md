# Telegram Connection Setup

> Audience: TieTide user setting up a personal Telegram bot connection.
> Time: ~5 minutes.

## Why this step exists

Telegram connections in TieTide use a **bot token** — the credential Telegram issues to a bot you create via **@BotFather**. The value is stored encrypted at rest with libsodium and never leaves the server in plaintext after you submit the form.

Telegram bots are personal accounts in their own right — every action TieTide takes (sending messages, receiving messages via webhook) is performed _as the bot_, not as you. Users you want to talk to must either start a chat with the bot first, or you must add the bot to a group/channel.

The validator in `packages/shared/src/schemas/connections.schema.ts:94-101` enforces the canonical Telegram token format: `<bot_id>:<secret>`, e.g. `123456789:ABC-Def_ghIJK...`.

## Steps

### 1. Talk to @BotFather and create a bot

1. Install/open **Telegram** (desktop or mobile).
2. Search for `@BotFather` and open the chat. **BotFather is Telegram's official bot for creating other bots** — make sure it's the one with the blue checkmark.
3. Send `/newbot`.
4. BotFather asks for a **display name**. Reply with anything, e.g. `TieTide Bot`.
5. BotFather asks for a **username** ending in `bot`. Reply with something unique, e.g. `tietide_higor_bot`.
6. BotFather replies with a message containing your token, formatted `<bot_id>:<secret>`. Copy the entire token string.

### 2. (Optional) Configure the bot

While still chatting with BotFather, you can:

- `/setdescription` — what the bot does (shown on its profile).
- `/setuserpic` — bot avatar.
- `/setprivacy` — set to **Disable** if you want the bot to read all messages in groups it's added to (required for the `telegram-message-received` trigger to see group messages). Default is **Enable**, meaning the bot only sees messages that mention it or are commands.

### 3. Add the connection in TieTide

1. Log in to TieTide.
2. Go to **Connections** → pick **Telegram**.
3. Fill the form:
   - **Connection name**: e.g. `My Telegram Bot`.
   - **Bot Token**: paste the token from step 1.
4. **Connect**.

The form is generated from `telegramBotTokenConfigSchema`. If your token doesn't match `<digits>:<chars>`, you'll see "botToken must be in the form <bot_id>:<secret>".

### 4. Test the connection

On the new `Connection` row, click **Test**. TieTide calls Telegram's `/getMe` endpoint with your token. `Test succeeded (<latencyMs>ms)` confirms the token is valid and the bot exists.

### 5. Start a chat with your bot

For the bot to message you, **you have to message it first** — Telegram blocks bots from initiating conversations. In the Telegram client:

1. Search for your bot's username (e.g. `@tietide_higor_bot`).
2. Open the chat → tap **Start** (or send any message).

The first message from a user gives the bot the user's **chat ID**, which is what TieTide's `telegram-send-message` action needs to address you. The `telegram-message-received` trigger captures this automatically — wire up a simple "echo" workflow to see your own chat ID.

## Free-tier limits

- **Telegram Bot API is entirely free.** No paid tier exists.
- **API rate limit**: 30 messages/sec/bot globally, 1 message/sec to a single user/group. Plenty for personal use.
- **Bot count per Telegram account**: 20 bots max. You won't hit it.

## Triggers vs actions

- **Actions** (`telegram-send-message`): only need the bot token.
- **Triggers** (`telegram-message-received`): TieTide registers a webhook with Telegram pointing at `POST /v1/provider-webhooks/telegram/<subscriptionId>` (see `CLAUDE.md` Section 8). This requires your TieTide API to be **publicly reachable** (Telegram won't POST to `localhost`). For local development, use a tunnel like `cloudflared` or `ngrok`; for production the API's public URL handles it.

## Rotating the token

If a token leaks:

1. Chat with @BotFather → `/revoke` → pick your bot. BotFather issues a new token; the old one stops working immediately.
2. In TieTide → revoke the old connection → create a new one with the same name and the new token.

## Troubleshooting

- **`bot was blocked by the user`**: the user the bot is trying to message has blocked the bot or never started a chat. Re-do step 5.
- **`chat not found`**: the chat ID is wrong. Use the `telegram-message-received` trigger or call `getUpdates` manually to learn the right ID.
- **Group messages not arriving at the trigger**: privacy mode is enabled. Use BotFather → `/setprivacy` → **Disable**.
