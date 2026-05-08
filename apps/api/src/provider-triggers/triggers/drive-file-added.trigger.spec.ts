import { DriveFileAddedTrigger, DRIVE_FILE_ADDED_TYPE } from './drive-file-added.trigger';
import type { GoogleClientFactory } from './google/google-client.factory';

interface DriveMockHandle {
  watch: jest.Mock;
  channelsStop: jest.Mock;
}

function makeFactory(handle: DriveMockHandle): jest.Mocked<GoogleClientFactory> {
  return {
    drive: jest.fn(() => ({
      files: { watch: handle.watch },
      channels: { stop: handle.channelsStop },
    })) as unknown as jest.Mock,
    gmail: jest.fn(),
    verifyOidcToken: jest.fn(),
  } as unknown as jest.Mocked<GoogleClientFactory>;
}

const baseLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const baseConnection = {
  id: 'conn-1',
  type: 'OAUTH2',
  provider: 'google',
  config: {
    accessToken: 'at',
    refreshToken: 'rt',
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    tokenType: 'Bearer',
  },
  refreshToken: 'rt',
};

describe('DriveFileAddedTrigger', () => {
  let trigger: DriveFileAddedTrigger;
  let drive: DriveMockHandle;
  let factory: jest.Mocked<GoogleClientFactory>;

  beforeEach(() => {
    drive = { watch: jest.fn(), channelsStop: jest.fn() };
    factory = makeFactory(drive);
    trigger = new DriveFileAddedTrigger(factory);
    jest.useFakeTimers().setSystemTime(new Date('2026-05-08T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('exports the canonical type string', () => {
    expect(DRIVE_FILE_ADDED_TYPE).toBe('drive-file-added');
    expect(trigger.type).toBe('drive-file-added');
  });

  describe('verifySignature', () => {
    const signingSecret = 'tok-abcdefghijklmnopqrstuvwxyz123456';
    const rawBody = Buffer.from('{}');

    it('accepts a matching X-Goog-Channel-Token (case-insensitive header)', () => {
      const headers = { 'x-goog-channel-token': signingSecret };
      expect(trigger.verifySignature({ rawBody, headers, signingSecret })).toBe(true);
    });

    it('also accepts the title-cased header form Google sends', () => {
      const headers = { 'X-Goog-Channel-Token': signingSecret };
      expect(trigger.verifySignature({ rawBody, headers, signingSecret })).toBe(true);
    });

    it('rejects when the token does not match', () => {
      const headers = { 'x-goog-channel-token': 'something-else-of-similar-length-here' };
      expect(trigger.verifySignature({ rawBody, headers, signingSecret })).toBe(false);
    });

    it('rejects when the header is missing', () => {
      expect(trigger.verifySignature({ rawBody, headers: {}, signingSecret })).toBe(false);
    });

    it('rejects when the token length differs (without throwing)', () => {
      const headers = { 'x-goog-channel-token': 'short' };
      expect(trigger.verifySignature({ rawBody, headers, signingSecret })).toBe(false);
    });
  });

  describe('onActivate', () => {
    it('creates a Drive watch channel with the callback URL and returns a composite providerSubId + 6.5d expiry', async () => {
      const expirationMs = Date.now() + 6.5 * 24 * 60 * 60 * 1000;
      drive.watch.mockResolvedValue({
        data: {
          kind: 'api#channel',
          id: 'channel-uuid',
          resourceId: 'resource-abc',
          expiration: String(expirationMs),
        },
      });

      const result = await trigger.onActivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        callbackUrl: 'https://api.tietide.dev/v1/provider-webhooks/google/sub-1',
        connection: baseConnection,
        config: { parentFolderId: 'folder-A' },
        logger: baseLogger,
      });

      expect(factory.drive).toHaveBeenCalledWith(baseConnection);
      expect(drive.watch).toHaveBeenCalledTimes(1);
      const arg = drive.watch.mock.calls[0]![0];
      expect(arg.fileId).toBe('folder-A');
      expect(arg.requestBody.type).toBe('web_hook');
      expect(arg.requestBody.address).toBe(
        'https://api.tietide.dev/v1/provider-webhooks/google/sub-1',
      );
      expect(typeof arg.requestBody.id).toBe('string');
      expect(arg.requestBody.id.length).toBeGreaterThan(0);
      expect(arg.requestBody.token).toBe(arg.requestBody.token); // reused below
      expect(typeof arg.requestBody.expiration).toBe('string');

      expect(result.providerSubId).toBe('channel-uuid|resource-abc');
      expect(result.signingSecret).toBe(arg.requestBody.token);
      expect(result.signingSecret.length).toBeGreaterThanOrEqual(32);
      expect(result.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('onDeactivate', () => {
    it('parses the composite providerSubId and calls channels.stop', async () => {
      drive.channelsStop.mockResolvedValue({});

      await trigger.onDeactivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        providerSubId: 'channel-uuid|resource-abc',
        connection: baseConnection,
        config: {},
        logger: baseLogger,
      });

      expect(drive.channelsStop).toHaveBeenCalledWith({
        requestBody: { id: 'channel-uuid', resourceId: 'resource-abc' },
      });
    });

    it('is idempotent on 404 (channel already stopped)', async () => {
      const err = Object.assign(new Error('Channel not found'), { code: 404 });
      drive.channelsStop.mockRejectedValue(err);

      await expect(
        trigger.onDeactivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          providerSubId: 'channel-uuid|resource-abc',
          connection: baseConnection,
          config: {},
          logger: baseLogger,
        }),
      ).resolves.not.toThrow();
    });

    it('throws on non-404 errors', async () => {
      const err = Object.assign(new Error('Internal'), { code: 500 });
      drive.channelsStop.mockRejectedValue(err);

      await expect(
        trigger.onDeactivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          providerSubId: 'channel-uuid|resource-abc',
          connection: baseConnection,
          config: {},
          logger: baseLogger,
        }),
      ).rejects.toThrow('Internal');
    });

    it('throws when providerSubId is malformed', async () => {
      await expect(
        trigger.onDeactivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          providerSubId: 'not-a-composite',
          connection: baseConnection,
          config: {},
          logger: baseLogger,
        }),
      ).rejects.toThrow(/composite/i);
    });
  });
});
