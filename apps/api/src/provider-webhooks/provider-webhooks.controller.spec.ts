import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { json, raw, type Express } from 'express';
import request from 'supertest';
import type { BasePushTrigger } from '@tietide/sdk';
import { ProviderWebhooksController } from './provider-webhooks.controller';
import { ProviderWebhooksService } from './provider-webhooks.service';
import { ProviderTriggerRegistry } from '../provider-triggers/provider-trigger.registry';

jest.setTimeout(15000);

class FakeMicrosoftTrigger implements Pick<BasePushTrigger, 'type'> {
  readonly type = 'outlook-message-received';
  handleValidation(input: {
    query: Record<string, string | string[] | undefined>;
    headers: Record<string, string | string[] | undefined>;
    rawBody: Uint8Array;
  }): { body: string; contentType: string } | null {
    const t = input.query.validationToken;
    if (typeof t === 'string' && t.length > 0) {
      return { body: t, contentType: 'text/plain' };
    }
    return null;
  }
  // verifySignature only matters for the non-validation flow, mocked in service.
  verifySignature(): boolean {
    return true;
  }
}

class FakeStripeTrigger {
  readonly type = 'stripe-event-received';
  // No handleValidation — Stripe does not need an out-of-band challenge.
  verifySignature(): boolean {
    return true;
  }
}

describe('ProviderWebhooksController', () => {
  let app: INestApplication;
  let triggerService: { trigger: jest.Mock };
  let registry: ProviderTriggerRegistry;

  beforeAll(async () => {
    triggerService = { trigger: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ProviderWebhooksController],
      providers: [
        { provide: ProviderWebhooksService, useValue: triggerService },
        ProviderTriggerRegistry,
      ],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    // mirror the real bootstrap's body-parser wiring (raw for HMAC verification)
    const expressApp = app.getHttpAdapter().getInstance() as Express;
    expressApp.use(raw({ type: '*/*' }));
    expressApp.use(json());

    registry = moduleRef.get(ProviderTriggerRegistry);
    registry.register(
      'outlook-message-received',
      new FakeMicrosoftTrigger() as unknown as BasePushTrigger,
    );
    registry.register(
      'stripe-event-received',
      new FakeStripeTrigger() as unknown as BasePushTrigger,
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    triggerService.trigger.mockReset();
  });

  describe('Microsoft validation handshake', () => {
    it('echoes validationToken as text/plain BEFORE consulting the service', async () => {
      const res = await request(app.getHttpServer())
        .post('/provider-webhooks/microsoft/00000000-0000-0000-0000-000000000010')
        .query({ validationToken: 'tietide-graph-test-token' })
        .send();

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      expect(res.text).toBe('tietide-graph-test-token');
      expect(triggerService.trigger).not.toHaveBeenCalled();
    });
  });

  describe('non-validation flow', () => {
    it('falls through to ProviderWebhooksService.trigger when validationToken is absent', async () => {
      triggerService.trigger.mockResolvedValue({ executionId: 'exec-1', status: 'PENDING' });

      const res = await request(app.getHttpServer())
        .post('/provider-webhooks/microsoft/00000000-0000-0000-0000-000000000011')
        .set('Content-Type', 'application/json')
        .send({ value: [{ clientState: 'whatever', resource: '/me/messages/x' }] });

      expect(res.status).toBe(HttpStatus.ACCEPTED);
      expect(triggerService.trigger).toHaveBeenCalledTimes(1);
      const arg = triggerService.trigger.mock.calls[0][0] as {
        provider: string;
        subscriptionId: string;
      };
      expect(arg.provider).toBe('microsoft');
      expect(arg.subscriptionId).toBe('00000000-0000-0000-0000-000000000011');
    });

    it('does not echo validationToken for providers whose trigger has no handleValidation (stripe)', async () => {
      triggerService.trigger.mockResolvedValue({ executionId: 'exec-2', status: 'PENDING' });

      const res = await request(app.getHttpServer())
        .post('/provider-webhooks/stripe/00000000-0000-0000-0000-000000000020')
        .query({ validationToken: 'should-not-echo' })
        .send();

      // Should fall through — Stripe has no handleValidation.
      expect(res.status).toBe(HttpStatus.ACCEPTED);
      expect(triggerService.trigger).toHaveBeenCalledTimes(1);
    });
  });
});
