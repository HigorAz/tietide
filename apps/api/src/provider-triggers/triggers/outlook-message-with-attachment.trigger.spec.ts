import type { Logger as NestLogger } from '@nestjs/common';
import type {
  ActivationContext,
  DeactivationContext,
  DecryptedConnection,
  Logger as SdkLogger,
} from '@tietide/sdk';
import type { MicrosoftOAuth2Config } from '@tietide/shared';
import {
  MicrosoftGraphFactory,
  MicrosoftGraphHttpError,
  type GraphResponse,
} from './microsoft/microsoft-graph.factory';
import {
  OutlookMessageWithAttachmentTrigger,
  OUTLOOK_MESSAGE_WITH_ATTACHMENT_TYPE,
} from './outlook-message-with-attachment.trigger';

const baseConnection: DecryptedConnection<MicrosoftOAuth2Config> = {
  id: '00000000-0000-0000-0000-000000000001',
  type: 'OAUTH2',
  provider: 'microsoft',
  config: {
    accessToken: 'access-token-1',
    refreshToken: 'refresh-token-1',
    scope: 'Mail.Read offline_access',
    tokenType: 'Bearer',
  },
  refreshToken: 'refresh-token-1',
} as DecryptedConnection<MicrosoftOAuth2Config>;

const baseLogger: SdkLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as unknown as NestLogger as unknown as SdkLogger;

const makeFactory = (
  graphFetch: jest.Mock = jest.fn(),
): jest.Mocked<Pick<MicrosoftGraphFactory, 'graphFetch'>> =>
  ({ graphFetch }) as unknown as jest.Mocked<Pick<MicrosoftGraphFactory, 'graphFetch'>>;

describe('OutlookMessageWithAttachmentTrigger', () => {
  let trigger: OutlookMessageWithAttachmentTrigger;
  let graphFetch: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-08T00:00:00Z'));
    graphFetch = jest.fn();
    trigger = new OutlookMessageWithAttachmentTrigger(
      makeFactory(graphFetch) as unknown as MicrosoftGraphFactory,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('declares the right type and required connection', () => {
    expect(trigger.type).toBe(OUTLOOK_MESSAGE_WITH_ATTACHMENT_TYPE);
    expect(trigger.requiredConnectionType).toBe('microsoft');
  });

  describe('handleValidation', () => {
    it('echoes validationToken (inherited from MicrosoftBaseTrigger)', () => {
      const result = trigger.handleValidation?.({
        query: { validationToken: 'att-token' },
        headers: {},
        rawBody: new Uint8Array(),
      });
      expect(result).toEqual({ body: 'att-token', contentType: 'text/plain' });
    });
  });

  describe('verifySignature', () => {
    const signingSecret = 'attachment-secret-32-byte-clientstate';

    it('accepts a notification with matching clientState (timingSafeEqual)', () => {
      const body = Buffer.from(
        JSON.stringify({ value: [{ clientState: signingSecret, changeType: 'created' }] }),
      );
      expect(trigger.verifySignature({ rawBody: body, headers: {}, signingSecret })).toBe(true);
    });

    it('rejects mismatched clientState', () => {
      const body = Buffer.from(JSON.stringify({ value: [{ clientState: 'nope' }] }));
      expect(trigger.verifySignature({ rawBody: body, headers: {}, signingSecret })).toBe(false);
    });
  });

  describe('onActivate', () => {
    const activate = (config: Record<string, unknown>): Promise<unknown> =>
      trigger.onActivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        callbackUrl: 'https://api.tietide.dev/v1/provider-webhooks/microsoft/sub-1',
        connection: baseConnection,
        config,
        logger: baseLogger,
      } as ActivationContext);

    it('subscribes to the Inbox with a hasAttachments filter and changeType=created', async () => {
      graphFetch.mockResolvedValue({
        status: 201,
        data: { id: 'sub-att', expirationDateTime: '2026-05-10T22:30:00.000Z' },
      } as GraphResponse);

      const result = (await activate({})) as { providerSubId: string; signingSecret: string };

      const [, path, init] = graphFetch.mock.calls[0] as [unknown, string, { body: string }];
      expect(path).toBe('/v1.0/subscriptions');
      const sentBody = JSON.parse(init.body) as { changeType: string; resource: string };
      expect(sentBody.changeType).toBe('created');
      expect(sentBody.resource).toContain("/me/mailFolders('Inbox')/messages");
      expect(decodeURIComponent(sentBody.resource)).toContain('hasAttachments eq true');
      expect(result.providerSubId).toBe('sub-att');
      expect(result.signingSecret).toHaveLength(43); // 32 bytes base64url
    });

    it('AND-merges optional config.filter with the hasAttachments filter', async () => {
      graphFetch.mockResolvedValue({
        status: 201,
        data: { id: 'sub-att', expirationDateTime: '2026-05-10T22:30:00.000Z' },
      } as GraphResponse);

      await activate({ filter: "from/emailAddress/address eq 'boss@example.com'" });

      const [, , init] = graphFetch.mock.calls[0] as [unknown, string, { body: string }];
      const decoded = decodeURIComponent((JSON.parse(init.body) as { resource: string }).resource);
      expect(decoded).toContain('hasAttachments eq true');
      expect(decoded).toContain('and');
      expect(decoded).toContain("from/emailAddress/address eq 'boss@example.com'");
    });

    it('throws when the subscription response is missing an id', async () => {
      graphFetch.mockResolvedValue({ status: 201, data: {} } as GraphResponse);
      await expect(activate({})).rejects.toThrow(/missing id/);
    });
  });

  describe('onDeactivate', () => {
    it('DELETEs the subscription and swallows 404', async () => {
      graphFetch.mockRejectedValue(new MicrosoftGraphHttpError(404, 'gone'));

      const ctx: DeactivationContext = {
        workflowId: 'wf-1',
        nodeId: 'node-1',
        providerSubId: 'sub-att',
        connection: baseConnection,
        config: {},
        logger: baseLogger,
      };
      await expect(trigger.onDeactivate(ctx)).resolves.toBeUndefined();
      const [, path, init] = graphFetch.mock.calls[0] as [unknown, string, { method: string }];
      expect(path).toBe('/v1.0/subscriptions/sub-att');
      expect(init.method).toBe('DELETE');
    });
  });
});
