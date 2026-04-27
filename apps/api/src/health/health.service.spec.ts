import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';
import { EXECUTION_QUEUE_NAME } from '../executions/execution-queue.constants';

describe('HealthService', () => {
  let service: HealthService;
  let prisma: { $queryRaw: jest.Mock };
  let queue: { client: Promise<{ ping: jest.Mock }> };
  let redisClient: { ping: jest.Mock };
  let fetchMock: jest.SpyInstance;
  let config: { get: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn() };
    redisClient = { ping: jest.fn() };
    queue = { client: Promise.resolve(redisClient) };
    config = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'AI_SERVICE_URL') return 'http://ai-service:8000';
        if (key === 'HEALTH_CHECK_TIMEOUT_MS') return '2000';
        return defaultValue;
      }),
    };

    fetchMock = jest.spyOn(global, 'fetch' as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(EXECUTION_QUEUE_NAME), useValue: queue },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  afterEach(() => {
    fetchMock.mockRestore();
    jest.clearAllMocks();
  });

  describe('checkDatabase', () => {
    it('should return connected when query succeeds', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const result = await service.checkDatabase();

      expect(result.status).toBe('connected');
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('should return disconnected when query throws', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));

      const result = await service.checkDatabase();

      expect(result.status).toBe('disconnected');
      expect(result.error).toBe('Connection refused');
    });

    it('should not leak internal stack traces in error field', async () => {
      const err = new Error('intricate failure');
      err.stack = 'Error: intricate failure\n    at internal/location.ts:42';
      prisma.$queryRaw.mockRejectedValue(err);

      const result = await service.checkDatabase();

      expect(result.status).toBe('disconnected');
      expect(result.error).not.toContain('internal/location.ts');
    });
  });

  describe('checkRedis', () => {
    it('should return connected when redis responds with PONG', async () => {
      redisClient.ping.mockResolvedValue('PONG');

      const result = await service.checkRedis();

      expect(result.status).toBe('connected');
    });

    it('should return disconnected when redis ping throws', async () => {
      redisClient.ping.mockRejectedValue(new Error('Redis unreachable'));

      const result = await service.checkRedis();

      expect(result.status).toBe('disconnected');
      expect(result.error).toBe('Redis unreachable');
    });

    it('should return disconnected when redis returns unexpected reply', async () => {
      redisClient.ping.mockResolvedValue('NOT_PONG');

      const result = await service.checkRedis();

      expect(result.status).toBe('disconnected');
    });
  });

  describe('checkAiService', () => {
    it('should return connected when AI service returns 200', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);

      const result = await service.checkAiService();

      expect(result.status).toBe('connected');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://ai-service:8000/health',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should return disconnected when AI service returns non-2xx', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);

      const result = await service.checkAiService();

      expect(result.status).toBe('disconnected');
      expect(result.error).toContain('503');
    });

    it('should return disconnected when fetch throws (network/timeout)', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.checkAiService();

      expect(result.status).toBe('disconnected');
      expect(result.error).toBe('ECONNREFUSED');
    });
  });

  describe('check (aggregate)', () => {
    it('should return ok when all dependencies are connected', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redisClient.ping.mockResolvedValue('PONG');
      fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);

      const result = await service.check();

      expect(result.status).toBe('ok');
      expect(result.checks.database.status).toBe('connected');
      expect(result.checks.redis.status).toBe('connected');
      expect(result.checks.ai.status).toBe('connected');
      expect(result.timestamp).toBeDefined();
    });

    it('should return fail when database is disconnected', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('db down'));
      redisClient.ping.mockResolvedValue('PONG');
      fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);

      const result = await service.check();

      expect(result.status).toBe('fail');
      expect(result.checks.database.status).toBe('disconnected');
    });

    it('should return fail when redis is disconnected', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redisClient.ping.mockRejectedValue(new Error('redis down'));
      fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);

      const result = await service.check();

      expect(result.status).toBe('fail');
      expect(result.checks.redis.status).toBe('disconnected');
    });

    it('should return degraded (not fail) when only AI service is down', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redisClient.ping.mockResolvedValue('PONG');
      fetchMock.mockRejectedValue(new Error('ai down'));

      const result = await service.check();

      expect(result.status).toBe('degraded');
      expect(result.checks.ai.status).toBe('disconnected');
    });
  });
});
