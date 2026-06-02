import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

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
});
