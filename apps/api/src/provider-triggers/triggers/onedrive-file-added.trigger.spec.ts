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
import { OnedriveFileAddedTrigger, ONEDRIVE_FILE_ADDED_TYPE } from './onedrive-file-added.trigger';

const baseConnection: DecryptedConnection<MicrosoftOAuth2Config> = {
  id: '00000000-0000-0000-0000-000000000001',
  type: 'OAUTH2',
  provider: 'microsoft',
  config: {
    accessToken: 'access-token-1',
    refreshToken: 'refresh-token-1',
    scope: 'Files.Read offline_access',
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

describe('OnedriveFileAddedTrigger', () => {
  let trigger: OnedriveFileAddedTrigger;
  let graphFetch: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-08T00:00:00Z'));
    graphFetch = jest.fn();
    trigger = new OnedriveFileAddedTrigger(
      makeFactory(graphFetch) as unknown as MicrosoftGraphFactory,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('declares the right type and required connection', () => {
    expect(trigger.type).toBe(ONEDRIVE_FILE_ADDED_TYPE);
    expect(trigger.requiredConnectionType).toBe('microsoft');
  });

  describe('handleValidation', () => {
    it('echoes validationToken', () => {
      const result = trigger.handleValidation?.({
        query: { validationToken: 'drive-token' },
        headers: {},
        rawBody: new Uint8Array(),
      });
      expect(result).toEqual({ body: 'drive-token', contentType: 'text/plain' });
    });
  });

  describe('verifySignature', () => {
    const signingSecret = 'drive-secret-32-byte-clientstate';

    it('accepts matching clientState', () => {
      const body = Buffer.from(
        JSON.stringify({ value: [{ clientState: signingSecret, changeType: 'updated' }] }),
      );
      expect(trigger.verifySignature({ rawBody: body, headers: {}, signingSecret })).toBe(true);
    });

    it('rejects mismatched clientState', () => {
      const body = Buffer.from(JSON.stringify({ value: [{ clientState: 'wrong' }] }));
      expect(trigger.verifySignature({ rawBody: body, headers: {}, signingSecret })).toBe(false);
    });
  });

  describe('onActivate', () => {
    it('subscribes to /me/drive/root with changeType=updated and ~29 day expiration', async () => {
      graphFetch.mockResolvedValue({
        status: 201,
        data: { id: 'sub-drive', expirationDateTime: '2026-06-05T00:00:00.000Z' },
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

      const [, , init] = graphFetch.mock.calls[0] as [
        unknown,
        string,
        { method: string; body: string },
      ];
      const sentBody = JSON.parse(init.body) as Record<string, unknown>;
      expect(sentBody.changeType).toBe('updated');
      expect(sentBody.resource).toBe('/me/drive/root');
      expect(sentBody.notificationUrl).toBe(ctx.callbackUrl);
      expect(typeof sentBody.clientState).toBe('string');

      const requestedMs = Date.parse(sentBody.expirationDateTime as string);
      const nowMs = Date.parse('2026-05-08T00:00:00Z');
      const minutesAhead = (requestedMs - nowMs) / 60_000;
      expect(minutesAhead).toBeGreaterThan(0);
      // OneDrive max ~ 30 days = 43200 min; we request comfortably below that.
      expect(minutesAhead).toBeLessThanOrEqual(41760);

      expect(result.providerSubId).toBe('sub-drive');
      expect(result.expiresAt).toEqual(new Date('2026-06-05T00:00:00.000Z'));
    });

    it('throws when the response is missing an id', async () => {
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
        providerSubId: 'sub-drive',
        connection: baseConnection,
        config: {},
        logger: baseLogger,
      };
      await trigger.onDeactivate(ctx);
      const [, path, init] = graphFetch.mock.calls[0] as [unknown, string, { method: string }];
      expect(path).toBe('/v1.0/subscriptions/sub-drive');
      expect(init.method).toBe('DELETE');
    });

    it('swallows 404, rethrows others', async () => {
      graphFetch.mockRejectedValueOnce(new MicrosoftGraphHttpError(404, 'gone'));
      await expect(
        trigger.onDeactivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          providerSubId: 'sub-drive',
          connection: baseConnection,
          config: {},
          logger: baseLogger,
        }),
      ).resolves.toBeUndefined();

      graphFetch.mockRejectedValueOnce(new MicrosoftGraphHttpError(500, 'boom'));
      await expect(
        trigger.onDeactivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          providerSubId: 'sub-drive',
          connection: baseConnection,
          config: {},
          logger: baseLogger,
        }),
      ).rejects.toBeInstanceOf(MicrosoftGraphHttpError);
    });
  });
});
