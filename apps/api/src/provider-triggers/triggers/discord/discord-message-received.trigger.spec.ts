import { generateKeyPairSync, KeyObject, sign } from 'crypto';
import { DiscordMessageReceivedTrigger } from './discord-message-received.trigger';
import { DiscordApiError, type DiscordBotClientFactory } from './discord-bot-client.factory';

const APP_ID = '1234567890';
const BOT_TOKEN = 'BotTokenABC';

interface KeyPair {
  privateKey: KeyObject;
  publicKeyHex: string; // raw 32-byte hex
}

const generateEd25519 = (): KeyPair => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  // Export as raw 32 bytes — the SPKI-DER export ends with the raw key bytes.
  const der = publicKey.export({ format: 'der', type: 'spki' });
  const raw = der.slice(der.length - 32);
  return { privateKey, publicKeyHex: raw.toString('hex') };
};

const signEd25519 = (privateKey: KeyObject, timestamp: string, body: Buffer): string => {
  const message = Buffer.concat([Buffer.from(timestamp, 'utf8'), body]);
  return sign(null, message, privateKey).toString('hex');
};

const makeFactory = (
  call: jest.Mock = jest.fn(),
): jest.Mocked<Pick<DiscordBotClientFactory, 'call' | 'baseUrl'>> => ({
  call,
  baseUrl: jest.fn(),
});

describe('DiscordMessageReceivedTrigger', () => {
  let trigger: DiscordMessageReceivedTrigger;
  let call: jest.Mock;

  beforeEach(() => {
    call = jest.fn();
    trigger = new DiscordMessageReceivedTrigger(
      makeFactory(call) as unknown as DiscordBotClientFactory,
    );
  });

  describe('verifySignature', () => {
    it('accepts a valid Ed25519 signature over (timestamp || rawBody)', () => {
      const { privateKey, publicKeyHex } = generateEd25519();
      const rawBody = Buffer.from('{"type":2}');
      const timestamp = '1717000000';
      const sigHex = signEd25519(privateKey, timestamp, rawBody);

      expect(
        trigger.verifySignature({
          rawBody,
          headers: { 'x-signature-ed25519': sigHex, 'x-signature-timestamp': timestamp },
          signingSecret: publicKeyHex,
        }),
      ).toBe(true);
    });

    it('rejects when the body is tampered after signing', () => {
      const { privateKey, publicKeyHex } = generateEd25519();
      const rawBody = Buffer.from('{"type":2}');
      const timestamp = '1717000000';
      const sigHex = signEd25519(privateKey, timestamp, rawBody);
      const tampered = Buffer.from('{"type":3}');
      expect(
        trigger.verifySignature({
          rawBody: tampered,
          headers: { 'x-signature-ed25519': sigHex, 'x-signature-timestamp': timestamp },
          signingSecret: publicKeyHex,
        }),
      ).toBe(false);
    });

    it('rejects when the public key does not match the signing key', () => {
      const k1 = generateEd25519();
      const k2 = generateEd25519();
      const rawBody = Buffer.from('{"type":2}');
      const timestamp = '1717000000';
      const sigHex = signEd25519(k1.privateKey, timestamp, rawBody);
      expect(
        trigger.verifySignature({
          rawBody,
          headers: { 'x-signature-ed25519': sigHex, 'x-signature-timestamp': timestamp },
          signingSecret: k2.publicKeyHex,
        }),
      ).toBe(false);
    });

    it('rejects when headers are missing', () => {
      const { publicKeyHex } = generateEd25519();
      expect(
        trigger.verifySignature({
          rawBody: Buffer.from('{}'),
          headers: {},
          signingSecret: publicKeyHex,
        }),
      ).toBe(false);
    });

    it('rejects malformed signature hex', () => {
      const { publicKeyHex } = generateEd25519();
      expect(
        trigger.verifySignature({
          rawBody: Buffer.from('{}'),
          headers: { 'x-signature-ed25519': 'NOTHEX', 'x-signature-timestamp': '1' },
          signingSecret: publicKeyHex,
        }),
      ).toBe(false);
    });

    it('rejects malformed public key hex', () => {
      expect(
        trigger.verifySignature({
          rawBody: Buffer.from('{}'),
          headers: { 'x-signature-ed25519': 'aa'.repeat(64), 'x-signature-timestamp': '1' },
          signingSecret: 'NOTAHEXKEY',
        }),
      ).toBe(false);
    });
  });

  describe('ackHandshake (PING → PONG, post-verification)', () => {
    it('does NOT implement handleValidation (PING must go through signature verification)', () => {
      // Discord URL verification sends bad-signature probes that must 401; a
      // pre-verification handleValidation would PONG them and fail verification.
      expect(trigger.handleValidation).toBeUndefined();
    });

    it('responds with PONG ({type:1}) for a verified PING body', () => {
      expect(trigger.ackHandshake({ type: 1 })).toEqual({
        body: JSON.stringify({ type: 1 }),
        contentType: 'application/json',
      });
    });

    it('returns null for non-PING bodies (lets the normal execution flow run)', () => {
      expect(trigger.ackHandshake({ type: 2, data: { name: 'x' } })).toBeNull();
      expect(trigger.ackHandshake({})).toBeNull();
    });
  });

  describe('onActivate', () => {
    const PUBLIC_KEY = 'a'.repeat(64);

    it('registers a guild slash command and returns providerSubId+publicKey', async () => {
      call.mockResolvedValue({ status: 200, data: { id: 'cmd-123' } });
      const result = await trigger.onActivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        callbackUrl: 'https://api.tietide.dev/v1/provider-webhooks/discord-bot/sub-1',
        connection: {
          id: 'conn-1',
          type: 'CUSTOM',
          provider: 'discord-bot',
          config: { applicationId: APP_ID, publicKey: PUBLIC_KEY, botToken: BOT_TOKEN },
        },
        config: { commandName: 'tietide', guildId: '999' },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      });

      const [token, method, path, payload] = call.mock.calls[0];
      expect(token).toBe(BOT_TOKEN);
      expect(method).toBe('POST');
      expect(path).toBe(`/applications/${APP_ID}/guilds/999/commands`);
      expect(payload).toEqual({
        name: 'tietide',
        description: 'TieTide workflow trigger',
        type: 1,
      });

      expect(result.providerSubId).toBe('cmd-123:guild:999');
      expect(result.signingSecret).toBe(PUBLIC_KEY);
    });

    it('registers globally when guildId is not set', async () => {
      call.mockResolvedValue({ status: 200, data: { id: 'cmd-456' } });
      const result = await trigger.onActivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        callbackUrl: 'https://api.tietide.dev/v1/provider-webhooks/discord-bot/sub-1',
        connection: {
          id: 'conn-1',
          type: 'CUSTOM',
          provider: 'discord-bot',
          config: { applicationId: APP_ID, publicKey: PUBLIC_KEY, botToken: BOT_TOKEN },
        },
        config: {},
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      });
      const [, , path] = call.mock.calls[0];
      expect(path).toBe(`/applications/${APP_ID}/commands`);
      expect(result.providerSubId).toBe('cmd-456:global');
    });

    it('throws when Discord did not return a command id', async () => {
      call.mockResolvedValue({ status: 200, data: {} });
      await expect(
        trigger.onActivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          callbackUrl: 'https://api.tietide.dev/v1/provider-webhooks/discord-bot/sub-1',
          connection: {
            id: 'conn-1',
            type: 'CUSTOM',
            provider: 'discord-bot',
            config: { applicationId: APP_ID, publicKey: PUBLIC_KEY, botToken: BOT_TOKEN },
          },
          config: {},
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        }),
      ).rejects.toThrow(/command id/);
    });
  });

  describe('onDeactivate', () => {
    const PUBLIC_KEY = 'a'.repeat(64);
    const baseConn = {
      id: 'conn-1',
      type: 'CUSTOM',
      provider: 'discord-bot',
      config: { applicationId: APP_ID, publicKey: PUBLIC_KEY, botToken: BOT_TOKEN },
    } as const;

    it('DELETEs the registered guild command', async () => {
      call.mockResolvedValue({ status: 204, data: null });
      await trigger.onDeactivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        providerSubId: 'cmd-123:guild:999',
        connection: baseConn,
        config: {},
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      });
      const [, method, path] = call.mock.calls[0];
      expect(method).toBe('DELETE');
      expect(path).toBe(`/applications/${APP_ID}/guilds/999/commands/cmd-123`);
    });

    it('idempotently swallows 404 (command already deleted)', async () => {
      call.mockRejectedValue(new DiscordApiError(404, { code: 10063 }));
      await expect(
        trigger.onDeactivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          providerSubId: 'cmd-gone:global',
          connection: baseConn,
          config: {},
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        }),
      ).resolves.not.toThrow();
    });
  });
});
