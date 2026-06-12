import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { IP_THROTTLER_NAME } from '../common/throttler/throttler.config';

describe('MetricsController (integration)', () => {
  let app: INestApplication;
  let token: string | undefined;
  const render = jest.fn().mockResolvedValue('# HELP up\nup 1\n');

  beforeEach(async () => {
    token = undefined;
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        {
          provide: MetricsService,
          useValue: { render, registry: { contentType: 'text/plain; version=0.0.4' } },
        },
        { provide: ConfigService, useValue: { get: () => token } },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    render.mockClear();
    await app.close();
  });

  it('returns the exposition text when no token is configured', async () => {
    const res = await request(app.getHttpServer()).get('/metrics').expect(200);
    expect(res.text).toContain('up 1');
    expect(render).toHaveBeenCalled();
  });

  it('rejects with 401 when a token is configured but not presented', async () => {
    token = 'sekret';
    await request(app.getHttpServer()).get('/metrics').expect(401);
    expect(render).not.toHaveBeenCalled();
  });

  it('allows the scrape with the correct bearer token', async () => {
    token = 'sekret';
    await request(app.getHttpServer())
      .get('/metrics')
      .set('Authorization', 'Bearer sekret')
      .expect(200);
    expect(render).toHaveBeenCalled();
  });

  it('carries a per-IP throttle on the scrape route (not @SkipThrottle)', () => {
    const reflector = new Reflector();
    // @SkipThrottle() sets THROTTLER:SKIP metadata; a real throttle must not.
    const skip = reflector.getAllAndOverride('THROTTLER:SKIP', [
      MetricsController.prototype.scrape,
      MetricsController,
    ]);
    expect(skip).toBeFalsy();
    // @Throttle({ ip: ... }) stores the limit under THROTTLER:LIMIT<name>.
    const ipLimit = reflector.getAllAndOverride(`THROTTLER:LIMIT${IP_THROTTLER_NAME}`, [
      MetricsController.prototype.scrape,
      MetricsController,
    ]);
    expect(ipLimit).toBeDefined();
  });
});
