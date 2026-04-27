import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: { check: jest.Mock };

  beforeEach(async () => {
    healthService = { check: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return ok with all checks when everything is healthy', async () => {
    const payload = {
      status: 'ok' as const,
      checks: {
        database: { status: 'connected' as const },
        redis: { status: 'connected' as const },
        ai: { status: 'connected' as const },
      },
      timestamp: '2026-04-27T12:00:00.000Z',
    };
    healthService.check.mockResolvedValue(payload);

    const result = await controller.check();

    expect(result).toEqual(payload);
  });

  it('should return degraded payload when only AI service is down', async () => {
    const payload = {
      status: 'degraded' as const,
      checks: {
        database: { status: 'connected' as const },
        redis: { status: 'connected' as const },
        ai: { status: 'disconnected' as const, error: 'unreachable' },
      },
      timestamp: '2026-04-27T12:00:00.000Z',
    };
    healthService.check.mockResolvedValue(payload);

    const result = await controller.check();

    expect(result.status).toBe('degraded');
    expect(result.checks.ai.status).toBe('disconnected');
  });

  it('should throw 503 when a critical dependency is down', async () => {
    healthService.check.mockResolvedValue({
      status: 'fail',
      checks: {
        database: { status: 'disconnected', error: 'down' },
        redis: { status: 'connected' },
        ai: { status: 'connected' },
      },
      timestamp: '2026-04-27T12:00:00.000Z',
    });

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('liveness should always return ok regardless of dependencies', () => {
    const result = controller.live();

    expect(result.status).toBe('ok');
    expect(result.timestamp).toBeDefined();
  });
});
