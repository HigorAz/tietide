import type { INestApplication } from '@nestjs/common';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

describe('WebhooksController (integration)', () => {
  let app: INestApplication;
  let webhooksService: { trigger: jest.Mock };

  const path = 'inbox-abc';
  const executionId = '11111111-1111-4111-8111-111111111111';

  beforeEach(async () => {
    webhooksService = { trigger: jest.fn() };

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [{ provide: WebhooksService, useValue: webhooksService }],
    }).compile();

    app = mod.createNestApplication({ rawBody: true });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /webhooks/:path', () => {
    it('should return 202 with executionId on success', async () => {
      webhooksService.trigger.mockResolvedValue({ executionId, status: 'PENDING' });

      const res = await request(app.getHttpServer())
        .post(`/webhooks/${path}`)
        .set('content-type', 'application/json')
        .set('x-webhook-signature', 'valid-sig')
        .set('x-webhook-timestamp', '1714000000')
        .send({ hello: 'world' })
        .expect(202);

      expect(res.body).toEqual({ executionId, status: 'PENDING' });
      expect(webhooksService.trigger).toHaveBeenCalledWith(
        expect.objectContaining({
          path,
          signature: 'valid-sig',
          timestamp: '1714000000',
          rawBody: expect.any(Buffer),
        }),
      );
    });

    it('should return 401 when service throws UnauthorizedException for invalid HMAC', async () => {
      webhooksService.trigger.mockRejectedValue(new UnauthorizedException('Invalid signature'));

      await request(app.getHttpServer())
        .post(`/webhooks/${path}`)
        .set('content-type', 'application/json')
        .send({})
        .expect(401);
    });

    it('should return 401 when service throws UnauthorizedException for expired timestamp', async () => {
      webhooksService.trigger.mockRejectedValue(new UnauthorizedException('Expired timestamp'));

      await request(app.getHttpServer())
        .post(`/webhooks/${path}`)
        .set('content-type', 'application/json')
        .send({})
        .expect(401);
    });

    it('should return 404 when service throws NotFoundException', async () => {
      webhooksService.trigger.mockRejectedValue(new NotFoundException('Webhook not found'));

      await request(app.getHttpServer())
        .post(`/webhooks/${path}`)
        .set('content-type', 'application/json')
        .send({})
        .expect(404);
    });

    it('should be public — no JWT required', async () => {
      webhooksService.trigger.mockResolvedValue({ executionId, status: 'PENDING' });

      await request(app.getHttpServer())
        .post(`/webhooks/${path}`)
        .set('content-type', 'application/json')
        .send({})
        .expect(202);
    });

    it('should pass the exact raw bytes received to the service', async () => {
      webhooksService.trigger.mockResolvedValue({ executionId, status: 'PENDING' });
      const body = JSON.stringify({ a: 1, b: 'two' });

      await request(app.getHttpServer())
        .post(`/webhooks/${path}`)
        .set('content-type', 'application/json')
        .send(body)
        .expect(202);

      const arg = webhooksService.trigger.mock.calls[0]?.[0] as { rawBody: Buffer };
      expect(Buffer.isBuffer(arg.rawBody)).toBe(true);
      expect(arg.rawBody.toString('utf8')).toBe(body);
    });

    it('should forward the x-request-id header to the service for correlation', async () => {
      webhooksService.trigger.mockResolvedValue({ executionId, status: 'PENDING' });

      await request(app.getHttpServer())
        .post(`/webhooks/${path}`)
        .set('content-type', 'application/json')
        .set('x-request-id', 'req-hook-1')
        .send({})
        .expect(202);

      expect(webhooksService.trigger).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'req-hook-1' }),
      );
    });

    it('should treat missing webhook headers as undefined and let service decide', async () => {
      webhooksService.trigger.mockRejectedValue(
        new UnauthorizedException('Missing signature headers'),
      );

      await request(app.getHttpServer())
        .post(`/webhooks/${path}`)
        .set('content-type', 'application/json')
        .send({})
        .expect(401);

      expect(webhooksService.trigger).toHaveBeenCalledWith(
        expect.objectContaining({
          signature: undefined,
          timestamp: undefined,
        }),
      );
    });
  });
});
