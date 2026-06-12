import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
import { createHmac, generateKeyPairSync, sign } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { EXECUTION_QUEUE_NAME } from '../executions/execution-queue.constants';
import { ProviderTriggerRegistry } from '../provider-triggers/provider-trigger.registry';
import { EntitlementsService } from '../billing/entitlements.service';
import {
  TwilioSmsReceivedTrigger,
  TWILIO_SMS_RECEIVED_TYPE,
  encodeTwilioSigningSecret,
} from '../provider-triggers/triggers/twilio/twilio-sms-received.trigger';
import { TwilioApiFactory } from '../provider-triggers/triggers/twilio/twilio-client.factory';
import {
  TelegramMessageReceivedTrigger,
  TELEGRAM_MESSAGE_RECEIVED_TYPE,
} from '../provider-triggers/triggers/telegram/telegram-message-received.trigger';
import { TelegramApiFactory } from '../provider-triggers/triggers/telegram/telegram-client.factory';
import {
  SlackMessageReceivedTrigger,
  SLACK_MESSAGE_RECEIVED_TYPE,
} from '../provider-triggers/triggers/slack/slack-message-received.trigger';
import {
  DiscordMessageReceivedTrigger,
  DISCORD_MESSAGE_RECEIVED_TYPE,
} from '../provider-triggers/triggers/discord/discord-message-received.trigger';
import { DiscordBotClientFactory } from '../provider-triggers/triggers/discord/discord-bot-client.factory';
import { ProviderWebhooksService } from './provider-webhooks.service';

/**
 * Integration test for the four communication push triggers (twilio,
 * telegram, slack, discord-bot). Drives inbound webhooks through the real
 * dispatcher end-to-end, asserts: PENDING execution row created with
 * triggerType='provider:<name>', queue.add called; bad signature → uniform
 * generic 404 (no existence oracle); inactive/missing subscription → generic 404.
 */
describe('ProviderWebhooksService — Communication integration', () => {
  let service: ProviderWebhooksService;
  let registry: ProviderTriggerRegistry;
  let prisma: {
    providerSubscription: { findUnique: jest.Mock };
    workflowExecution: { create: jest.Mock; findFirst: jest.Mock };
  };
  let queue: { add: jest.Mock };
  let crypto: { decrypt: jest.Mock };

  const subscriptionId = '11111111-1111-4111-8111-111111111111';
  const workflowId = '22222222-2222-4222-8222-222222222222';
  const userId = '33333333-3333-4333-8333-333333333333';
  const executionId = '44444444-4444-4444-8444-444444444444';

  beforeEach(async () => {
    prisma = {
      providerSubscription: { findUnique: jest.fn() },
      workflowExecution: {
        create: jest.fn(async () => ({ id: executionId, workflowId, status: 'PENDING' })),
        findFirst: jest.fn(async () => null),
      },
    };
    queue = { add: jest.fn(async () => undefined) };
    crypto = { decrypt: jest.fn() };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderWebhooksService,
        ProviderTriggerRegistry,
        TwilioSmsReceivedTrigger,
        TelegramMessageReceivedTrigger,
        SlackMessageReceivedTrigger,
        DiscordMessageReceivedTrigger,
        { provide: TwilioApiFactory, useValue: { call: jest.fn(), baseUrl: jest.fn() } },
        { provide: TelegramApiFactory, useValue: { call: jest.fn(), baseUrl: jest.fn() } },
        { provide: DiscordBotClientFactory, useValue: { call: jest.fn(), baseUrl: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
        { provide: getQueueToken(EXECUTION_QUEUE_NAME), useValue: queue },
        { provide: EntitlementsService, useValue: { assertCanRun: jest.fn() } },
      ],
    }).compile();

    service = mod.get(ProviderWebhooksService);
    registry = mod.get(ProviderTriggerRegistry);
    registry.register(TWILIO_SMS_RECEIVED_TYPE, mod.get(TwilioSmsReceivedTrigger));
    registry.register(TELEGRAM_MESSAGE_RECEIVED_TYPE, mod.get(TelegramMessageReceivedTrigger));
    registry.register(SLACK_MESSAGE_RECEIVED_TYPE, mod.get(SlackMessageReceivedTrigger));
    registry.register(DISCORD_MESSAGE_RECEIVED_TYPE, mod.get(DiscordMessageReceivedTrigger));
  });

  const activeSubscription = (
    overrides: Partial<{ provider: string; nodeId: string; definitionType: string }> = {},
  ) => ({
    id: subscriptionId,
    workflowId,
    nodeId: overrides.nodeId ?? 'trigger-1',
    provider: overrides.provider ?? 'twilio',
    providerSubId: 'remote-id',
    secretEnc: 'cipher',
    secretNonce: 'nonce',
    expiresAt: null,
    workflow: {
      id: workflowId,
      userId,
      isActive: true,
      definition: {
        nodes: [
          { id: 'trigger-1', type: overrides.definitionType ?? 'twilio-sms-received', config: {} },
        ],
        edges: [],
      },
    },
  });

  describe('Twilio SMS', () => {
    const AUTH_TOKEN = 'authtoken-12345';
    const CALLBACK_URL = `https://api.tietide.dev/v1/provider-webhooks/twilio/${subscriptionId}`;

    it('verifies X-Twilio-Signature, creates PENDING execution, and enqueues', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(activeSubscription());
      crypto.decrypt.mockReturnValue(encodeTwilioSigningSecret(AUTH_TOKEN, CALLBACK_URL));

      const params = { From: '+14155551234', To: '+14155555678', Body: 'hi', MessageSid: 'SM1' };
      const rawBody = Buffer.from(new URLSearchParams(params).toString());
      let s = CALLBACK_URL;
      for (const k of Object.keys(params).sort()) s += k + (params as Record<string, string>)[k];
      const sig = createHmac('sha1', AUTH_TOKEN).update(s, 'utf8').digest('base64');

      const result = await service.trigger({
        provider: 'twilio',
        subscriptionId,
        rawBody,
        headers: { 'x-twilio-signature': sig },
      });

      expect(result.executionId).toBe(executionId);
      expect(prisma.workflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workflowId,
            status: 'PENDING',
            triggerType: 'provider:twilio',
          }),
        }),
      );
      expect(queue.add).toHaveBeenCalled();
    });

    it('rejects bad X-Twilio-Signature with the uniform 404 (no existence oracle)', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(activeSubscription());
      crypto.decrypt.mockReturnValue(encodeTwilioSigningSecret(AUTH_TOKEN, CALLBACK_URL));
      await expect(
        service.trigger({
          provider: 'twilio',
          subscriptionId,
          rawBody: Buffer.from('From=%2B1&Body=hi'),
          headers: { 'x-twilio-signature': Buffer.from('00').toString('base64') },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
    });
  });

  describe('Telegram message', () => {
    it('verifies X-Telegram-Bot-Api-Secret-Token and enqueues a provider:telegram execution', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(
        activeSubscription({
          provider: 'telegram',
          definitionType: 'telegram-message-received',
        }),
      );
      const secret = 'a'.repeat(40);
      crypto.decrypt.mockReturnValue(secret);

      const result = await service.trigger({
        provider: 'telegram',
        subscriptionId,
        rawBody: Buffer.from(JSON.stringify({ update_id: 1, message: { text: 'hi' } })),
        headers: { 'x-telegram-bot-api-secret-token': secret },
      });
      expect(result.executionId).toBe(executionId);
      expect(prisma.workflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ triggerType: 'provider:telegram' }),
        }),
      );
    });

    it('rejects mismatched secret_token (constant-time compare returns false)', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(
        activeSubscription({
          provider: 'telegram',
          definitionType: 'telegram-message-received',
        }),
      );
      crypto.decrypt.mockReturnValue('expected-secret');
      await expect(
        service.trigger({
          provider: 'telegram',
          subscriptionId,
          rawBody: Buffer.from('{}'),
          headers: { 'x-telegram-bot-api-secret-token': 'wrong-token' },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('Slack message', () => {
    const SIGNING_SECRET = 'app-signing-secret';

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(1717000000000);
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('verifies v0 signature within window and enqueues a provider:slack execution', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(
        activeSubscription({ provider: 'slack', definitionType: 'slack-message-received' }),
      );
      crypto.decrypt.mockReturnValue(SIGNING_SECRET);

      const ts = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({ type: 'event_callback', event: { type: 'message' } });
      const rawBody = Buffer.from(body);
      const sig = createHmac('sha256', SIGNING_SECRET).update(`v0:${ts}:${body}`).digest('hex');

      const result = await service.trigger({
        provider: 'slack',
        subscriptionId,
        rawBody,
        headers: {
          'x-slack-request-timestamp': String(ts),
          'x-slack-signature': `v0=${sig}`,
        },
      });
      expect(result.executionId).toBe(executionId);
      expect(prisma.workflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ triggerType: 'provider:slack' }),
        }),
      );
    });

    it('rejects an expired Slack timestamp', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(
        activeSubscription({ provider: 'slack', definitionType: 'slack-message-received' }),
      );
      crypto.decrypt.mockReturnValue(SIGNING_SECRET);
      const oldTs = Math.floor(Date.now() / 1000) - 600;
      const body = '{}';
      const sig = createHmac('sha256', SIGNING_SECRET).update(`v0:${oldTs}:${body}`).digest('hex');

      await expect(
        service.trigger({
          provider: 'slack',
          subscriptionId,
          rawBody: Buffer.from(body),
          headers: {
            'x-slack-request-timestamp': String(oldTs),
            'x-slack-signature': `v0=${sig}`,
          },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('Discord interaction', () => {
    it('verifies Ed25519 signature and enqueues a provider:discord-bot execution', async () => {
      const { privateKey, publicKey } = generateKeyPairSync('ed25519');
      const der = publicKey.export({ format: 'der', type: 'spki' });
      const publicKeyHex = der.slice(der.length - 32).toString('hex');

      prisma.providerSubscription.findUnique.mockResolvedValue(
        activeSubscription({
          provider: 'discord-bot',
          definitionType: 'discord-message-received',
        }),
      );
      crypto.decrypt.mockReturnValue(publicKeyHex);

      const ts = '1717000000';
      const rawBody = Buffer.from(JSON.stringify({ type: 2, data: { name: 'tietide-trigger' } }));
      const message = Buffer.concat([Buffer.from(ts, 'utf8'), rawBody]);
      const sigHex = sign(null, message, privateKey).toString('hex');

      const result = await service.trigger({
        provider: 'discord-bot',
        subscriptionId,
        rawBody,
        headers: {
          'x-signature-ed25519': sigHex,
          'x-signature-timestamp': ts,
        },
      });
      expect(result.executionId).toBe(executionId);
      expect(prisma.workflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ triggerType: 'provider:discord-bot' }),
        }),
      );
      // No reply action in the (single-node) definition → immediate type-4 ack.
      expect(result.ack).toEqual({
        body: JSON.stringify({ type: 4, data: { content: 'Workflow started ✅' } }),
        contentType: 'application/json',
      });
    });

    it('defers (type 5) and still enqueues when the workflow has a reply action', async () => {
      const { privateKey, publicKey } = generateKeyPairSync('ed25519');
      const der = publicKey.export({ format: 'der', type: 'spki' });
      const publicKeyHex = der.slice(der.length - 32).toString('hex');

      const sub = activeSubscription({
        provider: 'discord-bot',
        definitionType: 'discord-message-received',
      });
      sub.workflow.definition = {
        nodes: [
          { id: 'trigger-1', type: 'discord-message-received', config: {} },
          { id: 'reply-1', type: 'discord-reply-to-command', config: { content: 'hi' } },
        ],
        edges: [],
      } as unknown as typeof sub.workflow.definition;
      prisma.providerSubscription.findUnique.mockResolvedValue(sub);
      crypto.decrypt.mockReturnValue(publicKeyHex);

      const ts = '1717000000';
      const rawBody = Buffer.from(JSON.stringify({ type: 2, data: { name: 'tietide-trigger' } }));
      const message = Buffer.concat([Buffer.from(ts, 'utf8'), rawBody]);
      const sigHex = sign(null, message, privateKey).toString('hex');

      const result = await service.trigger({
        provider: 'discord-bot',
        subscriptionId,
        rawBody,
        headers: { 'x-signature-ed25519': sigHex, 'x-signature-timestamp': ts },
      });

      expect(result.ack).toEqual({
        body: JSON.stringify({ type: 5 }),
        contentType: 'application/json',
      });
      expect(result.executionId).toBe(executionId);
      expect(prisma.workflowExecution.create).toHaveBeenCalled();
    });

    it('PONGs a verified PING (type 1) without enqueuing an execution', async () => {
      const { privateKey, publicKey } = generateKeyPairSync('ed25519');
      const der = publicKey.export({ format: 'der', type: 'spki' });
      const publicKeyHex = der.slice(der.length - 32).toString('hex');

      prisma.providerSubscription.findUnique.mockResolvedValue(
        activeSubscription({ provider: 'discord-bot', definitionType: 'discord-message-received' }),
      );
      crypto.decrypt.mockReturnValue(publicKeyHex);

      const ts = '1717000000';
      const rawBody = Buffer.from(JSON.stringify({ type: 1 }));
      const message = Buffer.concat([Buffer.from(ts, 'utf8'), rawBody]);
      const sigHex = sign(null, message, privateKey).toString('hex');

      const result = await service.trigger({
        provider: 'discord-bot',
        subscriptionId,
        rawBody,
        headers: { 'x-signature-ed25519': sigHex, 'x-signature-timestamp': ts },
      });

      expect(result.ack).toEqual({
        body: JSON.stringify({ type: 1 }),
        contentType: 'application/json',
      });
      expect(result.executionId).toBe('');
      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
    });

    it('rejects a PING carrying an invalid signature (Discord verification probe → uniform 404)', async () => {
      const { publicKey } = generateKeyPairSync('ed25519');
      const der = publicKey.export({ format: 'der', type: 'spki' });
      const publicKeyHex = der.slice(der.length - 32).toString('hex');

      prisma.providerSubscription.findUnique.mockResolvedValue(
        activeSubscription({ provider: 'discord-bot', definitionType: 'discord-message-received' }),
      );
      crypto.decrypt.mockReturnValue(publicKeyHex);

      await expect(
        service.trigger({
          provider: 'discord-bot',
          subscriptionId,
          rawBody: Buffer.from(JSON.stringify({ type: 1 })),
          headers: {
            'x-signature-ed25519': 'ab'.repeat(64),
            'x-signature-timestamp': '1717000000',
          },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
    });
  });

  describe('Inactive workflow / missing subscription', () => {
    it('returns generic 404 when subscription is missing', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(null);
      await expect(
        service.trigger({
          provider: 'twilio',
          subscriptionId,
          rawBody: Buffer.from(''),
          headers: {},
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns generic 404 when workflow is inactive', async () => {
      const sub = activeSubscription();
      prisma.providerSubscription.findUnique.mockResolvedValue({
        ...sub,
        workflow: { ...sub.workflow, isActive: false },
      });
      await expect(
        service.trigger({
          provider: 'twilio',
          subscriptionId,
          rawBody: Buffer.from(''),
          headers: {},
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns generic 404 when provider on the URL does not match the row', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(activeSubscription());
      await expect(
        service.trigger({
          provider: 'telegram', // Mismatch — sub.provider = 'twilio'
          subscriptionId,
          rawBody: Buffer.from(''),
          headers: {},
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
