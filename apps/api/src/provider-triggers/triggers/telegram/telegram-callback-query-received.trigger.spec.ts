import { TelegramCallbackQueryReceivedTrigger } from './telegram-callback-query-received.trigger';
import { TelegramApiError, type TelegramApiFactory } from './telegram-client.factory';

const BOT_TOKEN = '123456789:ABCDEF-secret_value';
const CALLBACK_URL = 'https://api.tietide.dev/v1/provider-webhooks/telegram/sub-1';

const makeFactory = (
  call: jest.Mock = jest.fn(),
): jest.Mocked<Pick<TelegramApiFactory, 'call' | 'baseUrl'>> => ({
  call,
  baseUrl: jest.fn(),
});

function makeCtx(overrides: Record<string, unknown> = {}): never {
  return {
    workflowId: 'wf-1',
    nodeId: 'node-1',
    callbackUrl: CALLBACK_URL,
    connection: { id: 'c1', provider: 'telegram', config: { botToken: BOT_TOKEN } },
    config: {},
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    ...overrides,
  } as never;
}

describe('TelegramCallbackQueryReceivedTrigger', () => {
  let trigger: TelegramCallbackQueryReceivedTrigger;
  let call: jest.Mock;

  beforeEach(() => {
    call = jest.fn();
    trigger = new TelegramCallbackQueryReceivedTrigger(
      makeFactory(call) as unknown as TelegramApiFactory,
    );
  });

  it('exposes the telegram-callback-query-received type', () => {
    expect(trigger.type).toBe('telegram-callback-query-received');
    expect(trigger.name).toMatch(/callback query/i);
  });

  describe('verifySignature', () => {
    const signingSecret = 'aGVsbG93b3JsZA';

    it('accepts a matching secret token header', () => {
      const headers = { 'x-telegram-bot-api-secret-token': signingSecret };
      expect(trigger.verifySignature({ rawBody: Buffer.from('{}'), headers, signingSecret })).toBe(
        true,
      );
    });

    it('rejects a wrong secret token header', () => {
      const headers = { 'x-telegram-bot-api-secret-token': 'nope' };
      expect(trigger.verifySignature({ rawBody: Buffer.from('{}'), headers, signingSecret })).toBe(
        false,
      );
    });
  });

  describe('onActivate', () => {
    it('calls setWebhook with allowed_updates=[callback_query] and a generated secret', async () => {
      call.mockResolvedValue({ status: 200, data: { ok: true, result: true } });

      const result = await trigger.onActivate(makeCtx());

      const [token, method, payload] = call.mock.calls[0];
      expect(token).toBe(BOT_TOKEN);
      expect(method).toBe('setWebhook');
      expect(payload.url).toBe(CALLBACK_URL);
      expect(payload.allowed_updates).toEqual(['callback_query']);
      expect(typeof payload.secret_token).toBe('string');
      expect(result.signingSecret).toBe(payload.secret_token);
    });

    it('throws when Telegram returns ok:false', async () => {
      call.mockResolvedValue({ status: 200, data: { ok: false, description: 'bad url' } });
      await expect(trigger.onActivate(makeCtx())).rejects.toThrow(/bad url/);
    });
  });

  describe('onDeactivate', () => {
    it('calls deleteWebhook', async () => {
      call.mockResolvedValue({ status: 200, data: { ok: true, result: true } });
      await trigger.onDeactivate(makeCtx({ providerSubId: 'telegram-abc' }));
      expect(call.mock.calls[0][1]).toBe('deleteWebhook');
    });

    it('does not throw on TelegramApiError (idempotent)', async () => {
      call.mockRejectedValue(new TelegramApiError(401, { description: 'Unauthorized' }));
      await expect(
        trigger.onDeactivate(makeCtx({ providerSubId: 'telegram-abc' })),
      ).resolves.not.toThrow();
    });
  });
});
