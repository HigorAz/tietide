import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { NotFoundException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OrgContextGuard } from '../common/guards/org-context.guard';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';

jest.setTimeout(15000);

describe('LibraryController (integration)', () => {
  let app: INestApplication;
  let libraryService: { list: jest.Mock; instantiate: jest.Mock };
  let authedUser: { id: string; email: string; role: string } | null;

  const templates = [
    {
      slug: 'lead-capture-to-crm',
      name: 'Lead capture → CRM → hot-lead alert',
      description: 'Sales template',
      category: 'Sales',
      nodeTypes: ['webhook-trigger', 'code', 'hubspot-create-contact', 'conditional'],
    },
    {
      slug: 'daily-hn-ai-digest',
      name: 'Daily Hacker News AI digest',
      description: 'Marketing template',
      category: 'Marketing',
      nodeTypes: ['cron-trigger', 'http-request', 'code', 'iterator'],
    },
    {
      slug: 'github-issue-ai-triage',
      name: 'GitHub issue AI triage',
      description: 'Engineering template',
      category: 'Engineering',
      nodeTypes: ['github-issue-opened', 'claude-messages', 'code', 'conditional'],
    },
    {
      slug: 'weather-ops-alert',
      name: 'Weather ops alert',
      description: 'Operations template',
      category: 'Operations & Finance',
      nodeTypes: ['cron-trigger', 'http-request', 'code', 'telegram-send-message'],
    },
  ];

  const instantiated = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Lead capture → CRM → hot-lead alert',
    description: 'Sales template',
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
        .post('/library/templates/lead-capture-to-crm/instantiate')
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
        .post('/library/templates/lead-capture-to-crm/instantiate')
        .send({ userId: 'forged-id' })
        .expect(201);

      expect(libraryService.instantiate).toHaveBeenCalledWith(
        'org-uuid',
        'owner-uuid',
        'lead-capture-to-crm',
      );
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
        .post('/library/templates/lead-capture-to-crm/instantiate')
        .expect(401);

      expect(libraryService.instantiate).not.toHaveBeenCalled();
    });
  });
});
