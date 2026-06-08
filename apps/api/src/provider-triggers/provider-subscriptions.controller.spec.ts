import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { NotFoundException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrgContextGuard } from '../common/guards/org-context.guard';
import { ProviderSubscriptionsController } from './provider-subscriptions.controller';
import { ProviderSubscriptionsService } from './provider-subscriptions.service';

describe('ProviderSubscriptionsController (integration)', () => {
  let app: INestApplication;
  let service: { listForWorkflow: jest.Mock };
  let authedUser: { id: string; email: string; role: string } | null;

  const workflowId = '550e8400-e29b-41d4-a716-446655440000';
  const subscription = {
    id: '3f1c0b2e-1111-4abc-8def-000000000001',
    nodeId: 'node-discord-1',
    provider: 'discord-bot',
    callbackUrl:
      'https://tietide.com/v1/provider-webhooks/discord-bot/3f1c0b2e-1111-4abc-8def-000000000001',
    expiresAt: null,
  };

  beforeEach(async () => {
    service = { listForWorkflow: jest.fn() };
    authedUser = { id: 'owner-uuid', email: 'owner@example.com', role: 'USER' };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProviderSubscriptionsController],
      providers: [{ provide: ProviderSubscriptionsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          if (!authedUser) {
            throw new UnauthorizedException('Missing or invalid token');
          }
          const req = ctx.switchToHttp().getRequest<{ user: unknown }>();
          req.user = authedUser;
          return true;
        },
      })
      .overrideGuard(OrgContextGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest<{ org: unknown }>();
          req.org = { id: 'org-uuid', role: 'SUPERADMIN' };
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return 401 when the JwtAuthGuard rejects the request', async () => {
    authedUser = null;
    await request(app.getHttpServer())
      .get(`/workflows/${workflowId}/provider-subscriptions`)
      .expect(401);
    expect(service.listForWorkflow).not.toHaveBeenCalled();
  });

  it('should return 200 with subscriptions scoped to the authenticated user', async () => {
    service.listForWorkflow.mockResolvedValue([subscription]);

    const res = await request(app.getHttpServer())
      .get(`/workflows/${workflowId}/provider-subscriptions`)
      .expect(200);

    expect(res.body).toEqual([subscription]);
    expect(service.listForWorkflow).toHaveBeenCalledWith('org-uuid', workflowId);
  });

  it('should return 400 when workflowId is not a UUID', async () => {
    await request(app.getHttpServer())
      .get('/workflows/not-a-uuid/provider-subscriptions')
      .expect(400);
    expect(service.listForWorkflow).not.toHaveBeenCalled();
  });

  it('should return 404 when the workflow is not found / not owned', async () => {
    service.listForWorkflow.mockRejectedValue(new NotFoundException('Workflow not found'));
    await request(app.getHttpServer())
      .get(`/workflows/${workflowId}/provider-subscriptions`)
      .expect(404);
  });
});
