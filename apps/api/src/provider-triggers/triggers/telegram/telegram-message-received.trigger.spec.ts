import { TelegramMessageReceivedTrigger } from './telegram-message-received.trigger';
import { TelegramApiError, type TelegramApiFactory } from './telegram-client.factory';

const BOT_TOKEN = '123456789:ABCDEF-secret_value';
const CALLBACK_URL = 'https://api.tietide.dev/v1/provider-webhooks/telegram/sub-1';

const makeFactory = (
  call: jest.Mock = jest.fn(),
): jest.Mocked<Pick<TelegramApiFactory, 'call' | 'baseUrl'>> => ({
  call,
  baseUrl: jest.fn(),
});

describe('TelegramMessageReceivedTrigger', () => {
  let trigger: TelegramMessageReceivedTrigger;
  let call: jest.Mock;

  beforeEach(() => {
    call = jest.fn();
    trigger = new TelegramMessageReceivedTrigger(
      makeFactory(call) as unknown as TelegramApiFactory,
    );
  });

  describe('verifySignature', () => {
    const signingSecret = 'aGVsbG93b3JsZA';

    it('accepts when X-Telegram-Bot-Api-Secret-Token equals the stored token', () => {
      const headers = { 'x-telegram-bot-api-secret-token': signingSecret };
      const rawBody = Buffer.from('{}');
      expect(trigger.verifySignature({ rawBody, headers, signingSecret })).toBe(true);
    });

    it('rejects when header is missing', () => {
      expect(
        trigger.verifySignature({ rawBody: Buffer.from('{}'), headers: {}, signingSecret }),
      ).toBe(false);
    });

    it('rejects when header value differs', () => {
      const headers = { 'x-telegram-bot-api-secret-token': 'wrong-token' };
      expect(trigger.verifySignature({ rawBody: Buffer.from('{}'), headers, signingSecret })).toBe(
        false,
      );
    });

    it('returns false on length mismatch (no timing leak)', () => {
      const headers = { 'x-telegram-bot-api-secret-token': 'a' };
      expect(trigger.verifySignature({ rawBody: Buffer.from('{}'), headers, signingSecret })).toBe(
        false,
      );
    });
  });

  describe('onActivate', () => {
    it('calls setWebhook with url and a generated secret_token, returning that secret', async () => {
      call.mockResolvedValue({ status: 200, data: { ok: true, result: true } });
      const result = await trigger.onActivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        callbackUrl: CALLBACK_URL,
        connection: {
          id: 'conn-1',
          type: 'API_KEY',
          provider: 'telegram',
          config: { botToken: BOT_TOKEN },
        },
        config: {},
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      });

      const [token, method, payload] = call.mock.calls[0];
      expect(token).toBe(BOT_TOKEN);
      expect(method).toBe('setWebhook');
      expect(payload.url).toBe(CALLBACK_URL);
      expect(typeof payload.secret_token).toBe('string');
      expect(payload.secret_token.length).toBeGreaterThanOrEqual(32);

      expect(result.signingSecret).toBe(payload.secret_token);
      expect(result.providerSubId).toMatch(/^telegram-/);
    });

    it('throws when Telegram returns ok:false', async () => {
      call.mockResolvedValue({
        status: 200,
        data: { ok: false, description: 'BAD_REQUEST: invalid url' },
      });
      await expect(
        trigger.onActivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          callbackUrl: 'https://invalid',
          connection: {
            id: 'conn-1',
            type: 'API_KEY',
            provider: 'telegram',
            config: { botToken: BOT_TOKEN },
          },
          config: {},
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        }),
      ).rejects.toThrow(/invalid url/);
    });
  });

  describe('onDeactivate', () => {
    it('calls deleteWebhook', async () => {
      call.mockResolvedValue({ status: 200, data: { ok: true, result: true } });
      await trigger.onDeactivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        providerSubId: 'telegram-abc',
        connection: {
          id: 'conn-1',
          type: 'API_KEY',
          provider: 'telegram',
          config: { botToken: BOT_TOKEN },
        },
        config: {},
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      });
      const [, method] = call.mock.calls[0];
      expect(method).toBe('deleteWebhook');
    });

    it('does not throw on TelegramApiError (idempotent)', async () => {
      call.mockRejectedValue(new TelegramApiError(401, { description: 'Unauthorized' }));
      await expect(
        trigger.onDeactivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          providerSubId: 'telegram-abc',
          connection: {
            id: 'conn-1',
            type: 'API_KEY',
            provider: 'telegram',
            config: { botToken: BOT_TOKEN },
          },
          config: {},
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        }),
      ).resolves.not.toThrow();
    });
  });
});
