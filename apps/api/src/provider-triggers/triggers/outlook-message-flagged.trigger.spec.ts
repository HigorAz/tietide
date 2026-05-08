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
  OutlookMessageFlaggedTrigger,
  OUTLOOK_MESSAGE_FLAGGED_TYPE,
} from './outlook-message-flagged.trigger';

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

describe('OutlookMessageFlaggedTrigger', () => {
  let trigger: OutlookMessageFlaggedTrigger;
  let graphFetch: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-08T00:00:00Z'));
    graphFetch = jest.fn();
    trigger = new OutlookMessageFlaggedTrigger(
      makeFactory(graphFetch) as unknown as MicrosoftGraphFactory,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('declares the right type and required connection', () => {
    expect(trigger.type).toBe(OUTLOOK_MESSAGE_FLAGGED_TYPE);
    expect(trigger.requiredConnectionType).toBe('microsoft');
  });

  describe('handleValidation', () => {
    it('echoes validationToken (inherited from MicrosoftBaseTrigger)', () => {
      const result = trigger.handleValidation?.({
        query: { validationToken: 'flag-token' },
        headers: {},
        rawBody: new Uint8Array(),
      });
      expect(result).toEqual({ body: 'flag-token', contentType: 'text/plain' });
    });
  });

  describe('verifySignature', () => {
    const signingSecret = 'flagged-secret-32-byte-clientstate';

    it('accepts a notification with matching clientState', () => {
      const body = Buffer.from(
        JSON.stringify({
          value: [{ clientState: signingSecret, changeType: 'updated' }],
        }),
      );
      expect(trigger.verifySignature({ rawBody: body, headers: {}, signingSecret })).toBe(true);
    });

    it('rejects mismatched clientState', () => {
      const body = Buffer.from(JSON.stringify({ value: [{ clientState: 'nope' }] }));
      expect(trigger.verifySignature({ rawBody: body, headers: {}, signingSecret })).toBe(false);
    });
  });

  describe('onActivate', () => {
    it("subscribes to /me/messages with pre-filter flag/flagStatus eq 'flagged' and changeType=updated", async () => {
      graphFetch.mockResolvedValue({
        status: 201,
        data: { id: 'sub-flag', expirationDateTime: '2026-05-10T22:30:00.000Z' },
      } as GraphResponse);

      await trigger.onActivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        callbackUrl: 'https://api.tietide.dev/v1/provider-webhooks/microsoft/sub-1',
        connection: baseConnection,
        config: {},
        logger: baseLogger,
      });

      const [, , init] = graphFetch.mock.calls[0] as [unknown, string, { body: string }];
      const sentBody = JSON.parse(init.body) as Record<string, unknown>;
      expect(sentBody.changeType).toBe('updated');
      expect(sentBody.resource).toContain('/me/messages');
      expect(decodeURIComponent(sentBody.resource as string)).toContain(
        "flag/flagStatus eq 'flagged'",
      );
    });

    it('AND-merges optional config.filter with the pre-applied flagged filter', async () => {
      graphFetch.mockResolvedValue({
        status: 201,
        data: { id: 'sub-flag', expirationDateTime: '2026-05-10T22:30:00.000Z' },
      } as GraphResponse);

      await trigger.onActivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        callbackUrl: 'https://api.tietide.dev/v1/provider-webhooks/microsoft/sub-1',
        connection: baseConnection,
        config: { filter: "from/emailAddress/address eq 'boss@example.com'" },
        logger: baseLogger,
      });

      const [, , init] = graphFetch.mock.calls[0] as [unknown, string, { body: string }];
      const sentBody = JSON.parse(init.body) as { resource: string };
      const decoded = decodeURIComponent(sentBody.resource);
      expect(decoded).toContain("flag/flagStatus eq 'flagged'");
      expect(decoded).toContain('and');
      expect(decoded).toContain("from/emailAddress/address eq 'boss@example.com'");
    });
  });

  describe('onDeactivate', () => {
    it('DELETEs the subscription and swallows 404', async () => {
      graphFetch.mockRejectedValue(new MicrosoftGraphHttpError(404, 'gone'));

      const ctx: DeactivationContext = {
        workflowId: 'wf-1',
        nodeId: 'node-1',
        providerSubId: 'sub-flag',
        connection: baseConnection,
        config: {},
        logger: baseLogger,
      };
      await expect(trigger.onDeactivate(ctx)).resolves.toBeUndefined();
      const [, path, init] = graphFetch.mock.calls[0] as [unknown, string, { method: string }];
      expect(path).toBe('/v1.0/subscriptions/sub-flag');
      expect(init.method).toBe('DELETE');
    });
  });
});

void ({} as ActivationContext);
