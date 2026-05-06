import { Test, type TestingModule } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import { EXECUTION_EVENTS_PUBLISHER, ExecutionEventsService } from './execution-events.service';

describe('ExecutionEventsService', () => {
  let service: ExecutionEventsService;
  let publisher: { publish: jest.Mock };
  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };

  beforeEach(async () => {
    publisher = { publish: jest.fn(async () => 1) };
    logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutionEventsService,
        { provide: EXECUTION_EVENTS_PUBLISHER, useValue: publisher },
        { provide: Logger, useValue: logger },
      ],
    }).compile();

    service = moduleRef.get(ExecutionEventsService);
  });

  describe('publishStepStarted', () => {
    it('should publish to exec:{id} with the canonical envelope', async () => {
      const startedAt = new Date('2026-05-05T10:00:00Z');

      await service.publishStepStarted({
        executionId: 'E1',
        nodeId: 'N1',
        nodeType: 'http-request',
        startedAt,
      });

      expect(publisher.publish).toHaveBeenCalledTimes(1);
      const [channel, payload] = publisher.publish.mock.calls[0];
      expect(channel).toBe('exec:E1');
      const parsed = JSON.parse(payload);
      expect(parsed).toEqual({
        type: 'step.started',
        executionId: 'E1',
        nodeId: 'N1',
        nodeType: 'http-request',
        status: 'RUNNING',
        startedAt: startedAt.toISOString(),
        finishedAt: null,
        durationMs: null,
        input: null,
        output: null,
        error: null,
      });
    });
  });

  describe('publishStepCompleted', () => {
    it('should mask sensitive keys in output and pass-through input', async () => {
      const startedAt = new Date('2026-05-05T10:00:00Z');
      const finishedAt = new Date('2026-05-05T10:00:01Z');

      await service.publishStepCompleted({
        executionId: 'E1',
        nodeId: 'N1',
        nodeType: 'http-request',
        startedAt,
        finishedAt,
        durationMs: 1000,
        input: { userId: 'u1' },
        output: {
          token: 'tk',
          body: 'ok',
          headers: { Authorization: 'Bearer x', 'X-Custom': 'safe' },
        },
      });

      const parsed = JSON.parse(publisher.publish.mock.calls[0][1]);
      expect(parsed.type).toBe('step.completed');
      expect(parsed.status).toBe('SUCCESS');
      expect(parsed.startedAt).toBe(startedAt.toISOString());
      expect(parsed.finishedAt).toBe(finishedAt.toISOString());
      expect(parsed.durationMs).toBe(1000);
      expect(parsed.input).toEqual({ userId: 'u1' });
      expect(parsed.output.token).toBe('[REDACTED]');
      expect(parsed.output.body).toBe('ok');
      expect(parsed.output.headers.Authorization).toBe('[REDACTED]');
      expect(parsed.output.headers['X-Custom']).toBe('safe');
      expect(parsed.error).toBeNull();
    });
  });

  describe('publishStepFailed', () => {
    it('should include error info and mask sensitive keys in input', async () => {
      const startedAt = new Date('2026-05-05T10:00:00Z');
      const finishedAt = new Date('2026-05-05T10:00:00.005Z');

      await service.publishStepFailed({
        executionId: 'E1',
        nodeId: 'N1',
        nodeType: 'http-request',
        startedAt,
        finishedAt,
        durationMs: 5,
        input: { password: 'p', host: 'api.example.com' },
        error: { message: 'boom', code: 'EFOO' },
      });

      const parsed = JSON.parse(publisher.publish.mock.calls[0][1]);
      expect(parsed.type).toBe('step.failed');
      expect(parsed.status).toBe('FAILED');
      expect(parsed.error).toEqual({ message: 'boom', code: 'EFOO' });
      expect(parsed.input.password).toBe('[REDACTED]');
      expect(parsed.input.host).toBe('api.example.com');
      expect(parsed.output).toBeNull();
    });

    it('should default error.code to null when omitted', async () => {
      await service.publishStepFailed({
        executionId: 'E1',
        nodeId: 'N1',
        nodeType: 'http-request',
        startedAt: new Date(),
        finishedAt: new Date(),
        durationMs: 0,
        input: null,
        error: { message: 'x' },
      });

      const parsed = JSON.parse(publisher.publish.mock.calls[0][1]);
      expect(parsed.error).toEqual({ message: 'x', code: null });
    });
  });

  describe('publishStepSkipped', () => {
    it('should publish status SKIPPED with sanitized input/output', async () => {
      await service.publishStepSkipped({
        executionId: 'E1',
        nodeId: 'N2',
        nodeType: 'conditional',
        startedAt: new Date(),
        finishedAt: new Date(),
        durationMs: 0,
        input: { token: 't' },
        output: { skipped: true, passthrough: { token: 't' } },
      });

      const parsed = JSON.parse(publisher.publish.mock.calls[0][1]);
      expect(parsed.type).toBe('step.skipped');
      expect(parsed.status).toBe('SKIPPED');
      expect(parsed.input.token).toBe('[REDACTED]');
      expect(parsed.output.skipped).toBe(true);
      expect(parsed.output.passthrough.token).toBe('[REDACTED]');
    });
  });

  describe('publishExecutionCompleted', () => {
    it('should publish a SUCCESS terminal event', async () => {
      const finishedAt = new Date('2026-05-05T10:00:05Z');

      await service.publishExecutionCompleted({
        executionId: 'E1',
        finishedAt,
        status: 'SUCCESS',
      });

      const parsed = JSON.parse(publisher.publish.mock.calls[0][1]);
      expect(parsed).toEqual({
        type: 'execution.completed',
        executionId: 'E1',
        nodeId: null,
        nodeType: null,
        status: 'SUCCESS',
        startedAt: null,
        finishedAt: finishedAt.toISOString(),
        durationMs: null,
        input: null,
        output: null,
        error: null,
      });
    });

    it('should publish a FAILED terminal event with error', async () => {
      await service.publishExecutionCompleted({
        executionId: 'E1',
        finishedAt: new Date(),
        status: 'FAILED',
        error: { message: 'workflow failed' },
      });

      const parsed = JSON.parse(publisher.publish.mock.calls[0][1]);
      expect(parsed.status).toBe('FAILED');
      expect(parsed.error).toEqual({ message: 'workflow failed', code: null });
    });
  });

  describe('best-effort delivery', () => {
    it('should swallow publisher errors and log a warning, not throw', async () => {
      publisher.publish.mockRejectedValueOnce(new Error('redis down'));

      await expect(
        service.publishStepStarted({
          executionId: 'E1',
          nodeId: 'N1',
          nodeType: 't',
          startedAt: new Date(),
        }),
      ).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('JSON validity', () => {
    it('should produce valid JSON for every event type', async () => {
      const now = new Date();

      await service.publishStepStarted({
        executionId: 'E1',
        nodeId: 'N',
        nodeType: 't',
        startedAt: now,
      });
      await service.publishStepCompleted({
        executionId: 'E1',
        nodeId: 'N',
        nodeType: 't',
        startedAt: now,
        finishedAt: now,
        durationMs: 0,
        input: null,
        output: null,
      });
      await service.publishStepFailed({
        executionId: 'E1',
        nodeId: 'N',
        nodeType: 't',
        startedAt: now,
        finishedAt: now,
        durationMs: 0,
        input: null,
        error: { message: 'x' },
      });
      await service.publishStepSkipped({
        executionId: 'E1',
        nodeId: 'N',
        nodeType: 't',
        startedAt: now,
        finishedAt: now,
        durationMs: 0,
        input: null,
        output: null,
      });
      await service.publishExecutionCompleted({
        executionId: 'E1',
        finishedAt: now,
        status: 'SUCCESS',
      });

      expect(publisher.publish).toHaveBeenCalledTimes(5);
      for (const call of publisher.publish.mock.calls) {
        const [channel, payload] = call;
        expect(channel).toBe('exec:E1');
        expect(() => JSON.parse(payload)).not.toThrow();
      }
    });
  });
});
