import type { ExecutionContext, INestApplication } from '@nestjs/common';
import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { WorkflowDocumentationController } from './workflow-documentation.controller';
import { WorkflowDocumentationService } from './workflow-documentation.service';

jest.setTimeout(15000);

describe('WorkflowDocumentationController (integration)', () => {
  let app: INestApplication;
  let docs: {
    findExisting: jest.Mock;
    regenerate: jest.Mock;
  };
  let authedUser: { id: string; email: string; role: string } | null;

  const uuid = '550e8400-e29b-41d4-a716-446655440000';
  const updatedAt = new Date('2026-04-26T01:00:00Z');
  const sections = {
    overview: 'ov',
    prerequisites: 'pre',
    trigger: 'trig',
    walkthrough: 'wt',
    dataFlow: 'flow',
    decisions: 'dec',
    errorHandling: 'err',
  };
  const result = {
    workflowId: uuid,
    version: 3,
    documentation: '# Demo\nGenerated text',
    sections,
    model: 'llama3.1:8b',
    generatedAt: updatedAt,
  };
  // ETag / Last-Modified are second-resolution. Truncate updatedAt to seconds.
  const lastModifiedSeconds = Math.floor(updatedAt.getTime() / 1000) * 1000;
  const expectedEtag = `"${uuid}-${lastModifiedSeconds}"`;
  const expectedLastModified = new Date(lastModifiedSeconds).toUTCString();

  beforeEach(async () => {
    docs = {
      findExisting: jest.fn(),
      regenerate: jest.fn(),
    };
    authedUser = { id: 'owner-uuid', email: 'owner@example.com', role: 'USER' };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowDocumentationController],
      providers: [{ provide: WorkflowDocumentationService, useValue: docs }],
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

  describe('GET /workflows/:id/documentation', () => {
    it('should return 200 with the docs body and ETag/Last-Modified headers when one exists', async () => {
      docs.findExisting.mockResolvedValue(result);

      const res = await request(app.getHttpServer())
        .get(`/workflows/${uuid}/documentation`)
        .expect(200);

      expect(docs.findExisting).toHaveBeenCalledWith('owner-uuid', uuid);
      expect(res.headers.etag).toBe(expectedEtag);
      expect(res.headers['last-modified']).toBe(expectedLastModified);
      expect(res.body).toMatchObject({
        workflowId: uuid,
        version: 3,
        documentation: '# Demo\nGenerated text',
        sections,
        model: 'llama3.1:8b',
      });
      expect(res.body).not.toHaveProperty('cached');
    });

    it('should return 404 when no documentation exists for the workflow', async () => {
      docs.findExisting.mockResolvedValue(null);

      await request(app.getHttpServer()).get(`/workflows/${uuid}/documentation`).expect(404);
    });

    it('should return 401 when the guard rejects', async () => {
      authedUser = null;

      await request(app.getHttpServer()).get(`/workflows/${uuid}/documentation`).expect(401);
      expect(docs.findExisting).not.toHaveBeenCalled();
    });

    it('should return 403 when service throws ForbiddenException', async () => {
      docs.findExisting.mockRejectedValue(new ForbiddenException('No access'));

      await request(app.getHttpServer()).get(`/workflows/${uuid}/documentation`).expect(403);
    });

    it('should return 400 when id is not a UUID', async () => {
      await request(app.getHttpServer()).get('/workflows/not-a-uuid/documentation').expect(400);
      expect(docs.findExisting).not.toHaveBeenCalled();
    });

    it('should return 304 with empty body when If-None-Match matches the current ETag', async () => {
      docs.findExisting.mockResolvedValue(result);

      const res = await request(app.getHttpServer())
        .get(`/workflows/${uuid}/documentation`)
        .set('If-None-Match', expectedEtag)
        .expect(304);

      expect(res.body).toEqual({});
      expect(res.text === '' || res.text === undefined).toBe(true);
    });

    it('should return 304 when If-None-Match is wildcard "*"', async () => {
      docs.findExisting.mockResolvedValue(result);

      await request(app.getHttpServer())
        .get(`/workflows/${uuid}/documentation`)
        .set('If-None-Match', '*')
        .expect(304);
    });

    it('should return 304 when If-Modified-Since is at or after the resource updatedAt', async () => {
      docs.findExisting.mockResolvedValue(result);

      await request(app.getHttpServer())
        .get(`/workflows/${uuid}/documentation`)
        .set('If-Modified-Since', expectedLastModified)
        .expect(304);
    });

    it('should return 200 when If-Modified-Since is before updatedAt', async () => {
      docs.findExisting.mockResolvedValue(result);

      const before = new Date(lastModifiedSeconds - 60_000).toUTCString();
      const res = await request(app.getHttpServer())
        .get(`/workflows/${uuid}/documentation`)
        .set('If-Modified-Since', before)
        .expect(200);

      expect(res.body.workflowId).toBe(uuid);
    });

    it('should return 200 when If-Modified-Since is malformed', async () => {
      docs.findExisting.mockResolvedValue(result);

      await request(app.getHttpServer())
        .get(`/workflows/${uuid}/documentation`)
        .set('If-Modified-Since', 'not-a-date')
        .expect(200);
    });
  });

  describe('POST /workflows/:id/documentation/regenerate', () => {
    it('should return 200 with the freshly generated body and no cached field', async () => {
      docs.regenerate.mockResolvedValue(result);

      const res = await request(app.getHttpServer())
        .post(`/workflows/${uuid}/documentation/regenerate`)
        .expect(200);

      expect(docs.regenerate).toHaveBeenCalledWith('owner-uuid', uuid);
      expect(res.body).toMatchObject({
        workflowId: uuid,
        version: 3,
        documentation: '# Demo\nGenerated text',
      });
      expect(res.body).not.toHaveProperty('cached');
    });

    it('should return 401 when the guard rejects', async () => {
      authedUser = null;

      await request(app.getHttpServer())
        .post(`/workflows/${uuid}/documentation/regenerate`)
        .expect(401);
      expect(docs.regenerate).not.toHaveBeenCalled();
    });

    it('should return 400 when id is not a UUID', async () => {
      await request(app.getHttpServer())
        .post('/workflows/not-a-uuid/documentation/regenerate')
        .expect(400);
      expect(docs.regenerate).not.toHaveBeenCalled();
    });

    it('should return 404 when service throws NotFoundException', async () => {
      docs.regenerate.mockRejectedValue(new NotFoundException('Workflow not found'));

      await request(app.getHttpServer())
        .post(`/workflows/${uuid}/documentation/regenerate`)
        .expect(404);
    });

    it('should return 403 when service throws ForbiddenException', async () => {
      docs.regenerate.mockRejectedValue(new ForbiddenException('No access'));

      await request(app.getHttpServer())
        .post(`/workflows/${uuid}/documentation/regenerate`)
        .expect(403);
    });

    it('should return 503 when AI service is unavailable', async () => {
      docs.regenerate.mockRejectedValue(new ServiceUnavailableException('AI service unavailable'));

      const res = await request(app.getHttpServer())
        .post(`/workflows/${uuid}/documentation/regenerate`)
        .expect(503);
      expect(res.body.message ?? res.body.error).toBeDefined();
    });
  });

  describe('POST /workflows/:id/generate-docs (removed legacy alias, #214)', () => {
    it('should return 404 — the deprecated alias is gone (use documentation/regenerate)', async () => {
      await request(app.getHttpServer()).post(`/workflows/${uuid}/generate-docs`).expect(404);
    });
  });
});
