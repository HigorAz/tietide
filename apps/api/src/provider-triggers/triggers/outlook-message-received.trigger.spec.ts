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
  OutlookMessageReceivedTrigger,
  OUTLOOK_MESSAGE_RECEIVED_TYPE,
} from './outlook-message-received.trigger';

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

describe('OutlookMessageReceivedTrigger', () => {
  let trigger: OutlookMessageReceivedTrigger;
  let graphFetch: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-08T00:00:00Z'));
    graphFetch = jest.fn();
    trigger = new OutlookMessageReceivedTrigger(
      makeFactory(graphFetch) as unknown as MicrosoftGraphFactory,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('declares the right type and required connection', () => {
    expect(trigger.type).toBe(OUTLOOK_MESSAGE_RECEIVED_TYPE);
    expect(trigger.requiredConnectionType).toBe('microsoft');
  });

  describe('handleValidation', () => {
    it('echoes validationToken as text/plain when present', () => {
      const result = trigger.handleValidation?.({
        query: { validationToken: 'abc-123' },
        headers: {},
        rawBody: new Uint8Array(),
      });
      expect(result).toEqual({ body: 'abc-123', contentType: 'text/plain' });
    });

    it('returns null when validationToken is absent', () => {
      const result = trigger.handleValidation?.({
        query: {},
        headers: {},
        rawBody: new Uint8Array(),
      });
      expect(result).toBeNull();
    });
  });

  describe('verifySignature', () => {
    const signingSecret = 'super-secret-32-byte-client-state-aaa';

    it('accepts a notification whose value[].clientState matches', () => {
      const body = Buffer.from(
        JSON.stringify({
          value: [
            {
              subscriptionId: 'sub-1',
              clientState: signingSecret,
              changeType: 'created',
              resource: "Users/me/Messages('AAA')",
            },
          ],
        }),
      );
      const ok = trigger.verifySignature({ rawBody: body, headers: {}, signingSecret });
      expect(ok).toBe(true);
    });

    it('rejects when clientState does not match (timing-safe)', () => {
      const body = Buffer.from(
        JSON.stringify({ value: [{ clientState: 'wrong', changeType: 'created' }] }),
      );
      expect(trigger.verifySignature({ rawBody: body, headers: {}, signingSecret })).toBe(false);
    });

    it('rejects when body is empty / unparseable', () => {
      expect(
        trigger.verifySignature({
          rawBody: Buffer.from(''),
          headers: {},
          signingSecret,
        }),
      ).toBe(false);
      expect(
        trigger.verifySignature({
          rawBody: Buffer.from('{not-json'),
          headers: {},
          signingSecret,
        }),
      ).toBe(false);
    });

    it('rejects when at least one notification in the batch has a wrong clientState', () => {
      const body = Buffer.from(
        JSON.stringify({
          value: [
            { clientState: signingSecret, changeType: 'created' },
            { clientState: 'imposter', changeType: 'created' },
          ],
        }),
      );
      expect(trigger.verifySignature({ rawBody: body, headers: {}, signingSecret })).toBe(false);
    });
  });

  describe('onActivate', () => {
    it('POSTs /v1.0/subscriptions with the Inbox messages resource and returns providerSubId', async () => {
      graphFetch.mockResolvedValue({
        status: 201,
        data: {
          id: 'sub-graph-uuid',
          expirationDateTime: '2026-05-10T22:30:00.000Z',
        },
      } as GraphResponse);

      const ctx: ActivationContext = {
        workflowId: 'wf-1',
        nodeId: 'node-1',
        callbackUrl: 'https://api.tietide.dev/v1/provider-webhooks/microsoft/sub-1',
        connection: baseConnection,
        config: {},
        logger: baseLogger,
      };
      const result = await trigger.onActivate(ctx);

      expect(graphFetch).toHaveBeenCalledTimes(1);
      const [conn, path, init] = graphFetch.mock.calls[0] as [
        unknown,
        string,
        { method: string; body: string },
      ];
      expect(conn).toBe(baseConnection);
      expect(path).toBe('/v1.0/subscriptions');
      expect(init.method).toBe('POST');
      const sentBody = JSON.parse(init.body) as Record<string, unknown>;
      expect(sentBody.changeType).toBe('created');
      expect(sentBody.notificationUrl).toBe(ctx.callbackUrl);
      expect(sentBody.resource).toBe("/me/mailFolders('Inbox')/messages");
      expect(typeof sentBody.expirationDateTime).toBe('string');
      expect(typeof sentBody.clientState).toBe('string');
      expect((sentBody.clientState as string).length).toBeGreaterThanOrEqual(32);

      expect(result.providerSubId).toBe('sub-graph-uuid');
      expect(result.signingSecret.length).toBeGreaterThanOrEqual(32);
      expect(result.expiresAt).toEqual(new Date('2026-05-10T22:30:00.000Z'));
    });

    it('caps requested expirationDateTime under the 4230-minute Outlook limit', async () => {
      graphFetch.mockResolvedValue({
        status: 201,
        data: { id: 'sub-x', expirationDateTime: '2026-05-10T22:30:00.000Z' },
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
      const sentBody = JSON.parse(init.body) as { expirationDateTime: string };
      const requestedMs = Date.parse(sentBody.expirationDateTime);
      const nowMs = Date.parse('2026-05-08T00:00:00Z');
      const minutesAhead = (requestedMs - nowMs) / 60_000;
      expect(minutesAhead).toBeGreaterThan(0);
      expect(minutesAhead).toBeLessThanOrEqual(4230);
    });

    it('appends optional config.filter to the resource', async () => {
      graphFetch.mockResolvedValue({
        status: 201,
        data: { id: 'sub-x', expirationDateTime: '2026-05-10T22:30:00.000Z' },
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
      expect(sentBody.resource).toContain("/me/mailFolders('Inbox')/messages");
      expect(sentBody.resource).toContain('$filter=');
      expect(sentBody.resource).toContain('boss%40example.com');
    });

    it('throws when the Graph response is missing an id', async () => {
      graphFetch.mockResolvedValue({ status: 201, data: {} } as GraphResponse);

      await expect(
        trigger.onActivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          callbackUrl: 'https://api.tietide.dev/v1/provider-webhooks/microsoft/sub-1',
          connection: baseConnection,
          config: {},
          logger: baseLogger,
        }),
      ).rejects.toThrow(/missing id/i);
    });
  });

  describe('onDeactivate', () => {
    it('DELETEs /v1.0/subscriptions/{providerSubId}', async () => {
      graphFetch.mockResolvedValue({ status: 204, data: null } as GraphResponse);

      const ctx: DeactivationContext = {
        workflowId: 'wf-1',
        nodeId: 'node-1',
        providerSubId: 'sub-graph-uuid',
        connection: baseConnection,
        config: {},
        logger: baseLogger,
      };
      await trigger.onDeactivate(ctx);

      const [, path, init] = graphFetch.mock.calls[0] as [unknown, string, { method: string }];
      expect(path).toBe('/v1.0/subscriptions/sub-graph-uuid');
      expect(init.method).toBe('DELETE');
    });

    it('swallows 404 (subscription already deleted)', async () => {
      graphFetch.mockRejectedValue(new MicrosoftGraphHttpError(404, 'gone'));

      await expect(
        trigger.onDeactivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          providerSubId: 'sub-graph-uuid',
          connection: baseConnection,
          config: {},
          logger: baseLogger,
        }),
      ).resolves.toBeUndefined();
    });

    it('rethrows non-404 errors', async () => {
      graphFetch.mockRejectedValue(new MicrosoftGraphHttpError(500, 'boom'));

      await expect(
        trigger.onDeactivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          providerSubId: 'sub-graph-uuid',
          connection: baseConnection,
          config: {},
          logger: baseLogger,
        }),
      ).rejects.toBeInstanceOf(MicrosoftGraphHttpError);
    });
  });
});
