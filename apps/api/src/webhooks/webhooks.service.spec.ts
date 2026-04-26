import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EXECUTION_QUEUE_NAME } from '../executions/execution-queue.constants';
import { WebhooksService } from './webhooks.service';

interface PrismaMock {
  webhook: { findUnique: jest.Mock };
  workflowExecution: { create: jest.Mock };
}

interface QueueMock {
  add: jest.Mock;
}

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: PrismaMock;
  let queue: QueueMock;

  const path = 'inbox-abc';
  const hmacSecret = 'super-secret-hmac-key';
  const userId = 'owner-uuid';
  const workflowId = '550e8400-e29b-41d4-a716-446655440000';
  const executionId = '11111111-1111-4111-8111-111111111111';
  const fixedNowMs = 1714000000000;

  function sign(rawBody: Buffer | string, ts: string, secret = hmacSecret): string {
    const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    return createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  }

  function activeWebhook(): unknown {
    return {
      id: 'webhook-id',
      path,
      hmacSecret,
      isActive: true,
      workflow: { id: workflowId, userId },
    };
  }

  beforeEach(async () => {
    prisma = {
      webhook: { findUnique: jest.fn() },
      workflowExecution: { create: jest.fn() },
    };
    queue = { add: jest.fn(async () => undefined) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(EXECUTION_QUEUE_NAME), useValue: queue },
      ],
    }).compile();

    service = mod.get(WebhooksService);
    jest.useFakeTimers().setSystemTime(fixedNowMs);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('trigger', () => {
    it('should create a PENDING execution and enqueue a job when signature is valid and timestamp is fresh', async () => {
      const ts = Math.floor(fixedNowMs / 1000).toString();
      const rawBody = Buffer.from(JSON.stringify({ hello: 'world' }));
      const signature = sign(rawBody, ts);

      prisma.webhook.findUnique.mockResolvedValue(activeWebhook());
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'webhook',
        triggerData: { hello: 'world' },
        idempotencyKey: null,
        createdAt: new Date(fixedNowMs),
      });

      const result = await service.trigger({ path, rawBody, signature, timestamp: ts });

      expect(prisma.webhook.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { path },
        }),
      );
      expect(prisma.workflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workflowId,
            status: 'PENDING',
            triggerType: 'webhook',
            triggerData: { hello: 'world' },
          }),
        }),
      );
      expect(queue.add).toHaveBeenCalledWith(
        'execute',
        expect.objectContaining({
          executionId,
          workflowId,
          triggerType: 'webhook',
          userId,
          triggerData: { hello: 'world' },
        }),
        expect.objectContaining({ jobId: executionId, attempts: expect.any(Number) }),
      );
      expect(result).toEqual({ executionId, status: 'PENDING' });
    });

    it('should throw UnauthorizedException when the signature does not match', async () => {
      const ts = Math.floor(fixedNowMs / 1000).toString();
      const rawBody = Buffer.from('{}');
      prisma.webhook.findUnique.mockResolvedValue(activeWebhook());

      await expect(
        service.trigger({ path, rawBody, signature: 'a'.repeat(64), timestamp: ts }),
      ).rejects.toThrow(UnauthorizedException);
      expect(queue.add).not.toHaveBeenCalled();
      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when timestamp is older than the replay window', async () => {
      const expiredTs = Math.floor((fixedNowMs - 600 * 1000) / 1000).toString();
      const rawBody = Buffer.from('{}');
      const signature = sign(rawBody, expiredTs);
      prisma.webhook.findUnique.mockResolvedValue(activeWebhook());

      await expect(
        service.trigger({ path, rawBody, signature, timestamp: expiredTs }),
      ).rejects.toThrow(UnauthorizedException);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when timestamp is in the future beyond skew window', async () => {
      const futureTs = Math.floor((fixedNowMs + 600 * 1000) / 1000).toString();
      const rawBody = Buffer.from('{}');
      const signature = sign(rawBody, futureTs);
      prisma.webhook.findUnique.mockResolvedValue(activeWebhook());

      await expect(
        service.trigger({ path, rawBody, signature, timestamp: futureTs }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when signature header is missing', async () => {
      const ts = Math.floor(fixedNowMs / 1000).toString();
      prisma.webhook.findUnique.mockResolvedValue(activeWebhook());

      await expect(
        service.trigger({
          path,
          rawBody: Buffer.from('{}'),
          signature: undefined,
          timestamp: ts,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when timestamp header is missing', async () => {
      prisma.webhook.findUnique.mockResolvedValue(activeWebhook());

      await expect(
        service.trigger({
          path,
          rawBody: Buffer.from('{}'),
          signature: 'a'.repeat(64),
          timestamp: undefined,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when timestamp is not a valid integer', async () => {
      prisma.webhook.findUnique.mockResolvedValue(activeWebhook());

      await expect(
        service.trigger({
          path,
          rawBody: Buffer.from('{}'),
          signature: 'a'.repeat(64),
          timestamp: 'not-a-number',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw NotFoundException when the webhook path does not exist', async () => {
      prisma.webhook.findUnique.mockResolvedValue(null);

      await expect(
        service.trigger({
          path: 'missing',
          rawBody: Buffer.from('{}'),
          signature: 'a'.repeat(64),
          timestamp: '1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when the webhook is inactive', async () => {
      prisma.webhook.findUnique.mockResolvedValue({
        ...(activeWebhook() as Record<string, unknown>),
        isActive: false,
      });

      const ts = Math.floor(fixedNowMs / 1000).toString();
      const rawBody = Buffer.from('{}');
      const signature = sign(rawBody, ts);

      await expect(service.trigger({ path, rawBody, signature, timestamp: ts })).rejects.toThrow(
        NotFoundException,
      );
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should pass parsed JSON body as triggerData to the queued job', async () => {
      const ts = Math.floor(fixedNowMs / 1000).toString();
      const body = { event: 'order.created', orderId: 42 };
      const rawBody = Buffer.from(JSON.stringify(body));
      const signature = sign(rawBody, ts);

      prisma.webhook.findUnique.mockResolvedValue(activeWebhook());
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'webhook',
        triggerData: body,
        idempotencyKey: null,
        createdAt: new Date(),
      });

      await service.trigger({ path, rawBody, signature, timestamp: ts });

      const jobPayload = queue.add.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(jobPayload).toEqual(expect.objectContaining({ triggerData: body }));
    });

    it('should accept an empty body and pass an empty object as triggerData', async () => {
      const ts = Math.floor(fixedNowMs / 1000).toString();
      const rawBody = Buffer.alloc(0);
      const signature = sign(rawBody, ts);

      prisma.webhook.findUnique.mockResolvedValue(activeWebhook());
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'webhook',
        triggerData: {},
        idempotencyKey: null,
        createdAt: new Date(),
      });

      await service.trigger({ path, rawBody, signature, timestamp: ts });

      const jobPayload = queue.add.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(jobPayload).toEqual(expect.objectContaining({ triggerData: {} }));
    });

    it('should propagate requestId into the BullMQ job payload for correlation', async () => {
      const ts = Math.floor(fixedNowMs / 1000).toString();
      const rawBody = Buffer.from('{}');
      const signature = sign(rawBody, ts);

      prisma.webhook.findUnique.mockResolvedValue(activeWebhook());
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'webhook',
        triggerData: {},
        idempotencyKey: null,
        createdAt: new Date(),
      });

      await service.trigger({
        path,
        rawBody,
        signature,
        timestamp: ts,
        requestId: 'req-hook-corr',
      });

      const jobPayload = queue.add.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(jobPayload).toEqual(expect.objectContaining({ requestId: 'req-hook-corr' }));
    });

    it('should reject signatures of mismatched length without throwing a non-401 error', async () => {
      const ts = Math.floor(fixedNowMs / 1000).toString();
      prisma.webhook.findUnique.mockResolvedValue(activeWebhook());

      await expect(
        service.trigger({
          path,
          rawBody: Buffer.from('{}'),
          signature: 'short',
          timestamp: ts,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
