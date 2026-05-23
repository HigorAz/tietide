/**
 * Hand-curated example output payloads for common upstream nodes.
 *
 * Used by NodePreviewPanel when an upstream node has never been executed
 * (no live data in executionLiveStore) — so users can preview templates
 * against a realistic shape without first running the workflow.
 *
 * Keep each entry's shape in sync with the executor's real output in
 * apps/worker/src/nodes/<type> (or with the trigger emitter for triggers).
 */
export const NODE_OUTPUT_EXAMPLES: Record<string, Record<string, unknown>> = {
  // ── Manual / Cron / Webhook ───────────────────────────────────────────
  'manual-trigger': {
    triggeredAt: '2026-05-23T12:00:00.000Z',
    triggeredBy: 'user@example.com',
  },
  'cron-trigger': {
    triggeredAt: '2026-05-23T12:00:00.000Z',
    cron: '0 * * * *',
  },
  'webhook-trigger': {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'curl/8.0' },
    query: {},
    body: { example: 'value' },
  },

  // ── HTTP request action (often used upstream of downstream nodes) ─────
  'http-request': {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: { result: 'ok' },
    duration: 123,
  },

  // ── Google triggers ──────────────────────────────────────────────────
  'gmail-message-received': {
    messageId: '19a1b2c3d4e5f6',
    threadId: '19a1b2c3d4e5f6',
    from: 'sender@example.com',
    to: 'you@example.com',
    subject: 'Example subject',
    snippet: 'This is a preview snippet of the message body…',
    receivedAt: '2026-05-23T12:00:00.000Z',
  },
  'drive-file-added': {
    fileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
    name: 'document.pdf',
    mimeType: 'application/pdf',
    webViewLink: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view',
    createdTime: '2026-05-23T12:00:00.000Z',
  },
  'sheets-row-added': {
    spreadsheetId: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
    sheetName: 'Sheet1',
    rowIndex: 42,
    values: { name: 'Alice', email: 'alice@example.com' },
  },

  // ── Communication triggers ───────────────────────────────────────────
  'slack-message-received': {
    channel: 'C01234567',
    channelName: 'general',
    user: 'U01234567',
    text: 'Hello world',
    ts: '1716465600.000100',
  },
  'discord-message-received': {
    channelId: '123456789012345678',
    guildId: '987654321098765432',
    author: { id: '111222333444555666', username: 'alice' },
    content: 'Hello world',
  },
  'telegram-message-received': {
    messageId: 12345,
    chatId: 987654,
    from: { id: 111222, username: 'alice' },
    text: 'Hello world',
    date: 1716465600,
  },
  'twilio-sms-received': {
    from: '+15551234567',
    to: '+15557654321',
    body: 'Hello world',
    messageSid: 'SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  },

  // ── Commerce ─────────────────────────────────────────────────────────
  'stripe-event-received': {
    id: 'evt_1ExampleStripeEvent',
    type: 'customer.created',
    data: { object: { id: 'cus_Example', email: 'customer@example.com' } },
    created: 1716465600,
  },
};
