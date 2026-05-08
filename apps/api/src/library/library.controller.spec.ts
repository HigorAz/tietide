import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { NotFoundException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';

jest.setTimeout(15000);

describe('LibraryController (integration)', () => {
  let app: INestApplication;
  let libraryService: { list: jest.Mock; instantiate: jest.Mock };
  let authedUser: { id: string; email: string; role: string } | null;

  const templates = [
    {
      slug: 'webhook-conditional-notification',
      name: 'Demo: Webhook → Enrich → IF → Notify',
      description: 'Webhook fixture',
      category: 'Webhook',
      nodeTypes: ['webhook-trigger', 'http-request', 'conditional'],
    },
    {
      slug: 'cron-fetch-process',
      name: 'Demo: Cron → Fetch → Archive',
      description: 'Cron fixture',
      category: 'Schedule',
      nodeTypes: ['cron-trigger', 'http-request'],
    },
    {
      slug: 'manual-ai-docs-showcase',
      name: 'Demo: Manual → Multi-step (AI Docs Showcase)',
      description: 'AI fixture',
      category: 'AI',
      nodeTypes: ['manual-trigger', 'http-request', 'conditional'],
    },
    {
      slug: 'manual-failure-dlq',
      name: 'Demo: Manual → Failure (DLQ Showcase)',
      description: 'DLQ fixture',
      category: 'Reliability',
      nodeTypes: ['manual-trigger', 'http-request'],
    },
  ];

  const instantiated = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Demo: Cron → Fetch → Archive',
    description: 'Cron fixture',
    definition: { nodes: [], edges: [] },
    isActive: false,
    version: 1,
    folderId: null,
    createdAt: new Date('2026-05-04T10:00:00Z'),
    updatedAt: new Date('2026-05-04T10:00:00Z'),
    executionCount: 0,
    documentation: null,
    tags: [],
  };

  beforeEach(async () => {
    libraryService = { list: jest.fn(), instantiate: jest.fn() };
    authedUser = { id: 'owner-uuid', email: 'owner@example.com', role: 'USER' };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LibraryController],
      providers: [{ provide: LibraryService, useValue: libraryService }],
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

  describe('GET /library/templates', () => {
    it('should return 200 with the array of templates (AC: returns at least 4 templates)', async () => {
      libraryService.list.mockReturnValue(templates);

      const res = await request(app.getHttpServer()).get('/library/templates').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(4);
    });

    it('should include slug, name, description, category, nodeTypes on every template (AC: shape)', async () => {
      libraryService.list.mockReturnValue(templates);

      const res = await request(app.getHttpServer()).get('/library/templates').expect(200);

      for (const template of res.body) {
        expect(template).toEqual(
          expect.objectContaining({
            slug: expect.any(String),
            name: expect.any(String),
            description: expect.any(String),
            category: expect.any(String),
            nodeTypes: expect.any(Array),
          }),
        );
      }
    });

    it('should return 401 when the guard rejects the request', async () => {
      authedUser = null;

      await request(app.getHttpServer()).get('/library/templates').expect(401);
      expect(libraryService.list).not.toHaveBeenCalled();
    });
  });

  describe('POST /library/templates/:slug/instantiate', () => {
    it('should return 201 and the new workflow when the slug is known', async () => {
      libraryService.instantiate.mockResolvedValue(instantiated);

      const res = await request(app.getHttpServer())
        .post('/library/templates/cron-fetch-process/instantiate')
        .expect(201);

      expect(res.body).toEqual(
        expect.objectContaining({
          id: instantiated.id,
          name: instantiated.name,
          isActive: false,
        }),
      );
    });

    it('should call the service with the authenticated user id, not anything from the body (AC: ownership)', async () => {
      libraryService.instantiate.mockResolvedValue(instantiated);

      await request(app.getHttpServer())
        .post('/library/templates/cron-fetch-process/instantiate')
        .send({ userId: 'forged-id' })
        .expect(201);

      expect(libraryService.instantiate).toHaveBeenCalledWith('owner-uuid', 'cron-fetch-process');
    });

    it('should return 404 when the service raises NotFoundException (AC: unknown slug)', async () => {
      libraryService.instantiate.mockRejectedValue(
        new NotFoundException("Template 'no-such' not found"),
      );

      await request(app.getHttpServer()).post('/library/templates/no-such/instantiate').expect(404);
    });

    it('should return 401 when the guard rejects the request (AC: requires JWT)', async () => {
      authedUser = null;

      await request(app.getHttpServer())
        .post('/library/templates/cron-fetch-process/instantiate')
        .expect(401);

      expect(libraryService.instantiate).not.toHaveBeenCalled();
    });
  });
});
