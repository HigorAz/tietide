import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminAuditLogController } from './admin-audit-log.controller';
import { AuditLogService } from './audit-log.service';

jest.setTimeout(15000);

describe('AdminAuditLogController integration', () => {
  let app: INestApplication;
  let auditService: {
    findMany: jest.Mock;
    findAllForExport: jest.Mock;
    listFilterValues: jest.Mock;
    log: jest.Mock;
  };
  let authedUser: { id: string; email: string; role: string } | null;

  beforeEach(async () => {
    auditService = {
      findMany: jest.fn(),
      findAllForExport: jest.fn(),
      listFilterValues: jest.fn(),
      log: jest.fn(),
    };
    authedUser = { id: 'admin-uuid', email: 'admin@example.com', role: 'ADMIN' };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminAuditLogController],
      providers: [{ provide: AuditLogService, useValue: auditService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          if (!authedUser) throw new UnauthorizedException('Missing or invalid token');
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

  const sampleRow = {
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'admin-uuid',
    userEmail: 'admin@example.com',
    action: 'env-var.create',
    resource: 'env-var',
    resourceId: 'ev-1',
    metadata: { key: 'API_BASE_URL' },
    createdAt: new Date('2026-05-08T12:00:00.000Z').toISOString(),
  };

  describe('RolesGuard enforcement', () => {
    it('should return 401 when no JWT', async () => {
      authedUser = null;
      await request(app.getHttpServer()).get('/admin/audit').expect(401);
    });

    it('should return 403 when caller is a USER (not ADMIN)', async () => {
      authedUser = { id: 'u', email: 'u@x', role: 'USER' };
      await request(app.getHttpServer()).get('/admin/audit').expect(403);
      expect(auditService.findMany).not.toHaveBeenCalled();
    });

    it('should allow an ADMIN to list', async () => {
      auditService.findMany.mockResolvedValue({ items: [], nextCursor: null });
      await request(app.getHttpServer()).get('/admin/audit').expect(200);
    });

    it('should return 403 on /filters when caller is USER', async () => {
      authedUser = { id: 'u', email: 'u@x', role: 'USER' };
      await request(app.getHttpServer()).get('/admin/audit/filters').expect(403);
    });

    it('should return 403 on /export when caller is USER', async () => {
      authedUser = { id: 'u', email: 'u@x', role: 'USER' };
      await request(app.getHttpServer()).get('/admin/audit/export').expect(403);
    });
  });

  describe('GET /admin/audit', () => {
    it('should pass parsed filters to the service', async () => {
      auditService.findMany.mockResolvedValue({ items: [sampleRow], nextCursor: null });

      const res = await request(app.getHttpServer())
        .get('/admin/audit')
        .query({
          userId: '99999999-9999-4999-8999-999999999999',
          action: 'env-var.create',
          resource: 'env-var',
          from: '2026-05-01T00:00:00.000Z',
          to: '2026-05-08T00:00:00.000Z',
          limit: '25',
        })
        .expect(200);

      expect(auditService.findMany).toHaveBeenCalledWith({
        filters: {
          userId: '99999999-9999-4999-8999-999999999999',
          action: 'env-var.create',
          resource: 'env-var',
          from: '2026-05-01T00:00:00.000Z',
          to: '2026-05-08T00:00:00.000Z',
        },
        cursor: undefined,
        limit: 25,
      });
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({ id: sampleRow.id, action: 'env-var.create' });
    });

    it('should pass cursor through to the service', async () => {
      auditService.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer())
        .get('/admin/audit')
        .query({
          cursor:
            'eyJjcmVhdGVkQXQiOiIyMDI2LTA1LTA4VDEyOjAwOjAwLjAwMFoiLCJpZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSJ9',
        })
        .expect(200);

      expect(auditService.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor:
            'eyJjcmVhdGVkQXQiOiIyMDI2LTA1LTA4VDEyOjAwOjAwLjAwMFoiLCJpZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSJ9',
        }),
      );
    });

    it('should reject unknown query params (whitelist)', async () => {
      await request(app.getHttpServer()).get('/admin/audit').query({ injected: 'x' }).expect(400);
    });

    it('should reject limit > 100', async () => {
      await request(app.getHttpServer()).get('/admin/audit').query({ limit: '500' }).expect(400);
    });

    it('should reject malformed userId (non-uuid)', async () => {
      await request(app.getHttpServer())
        .get('/admin/audit')
        .query({ userId: 'not-a-uuid' })
        .expect(400);
    });

    it('should reject malformed cursor character', async () => {
      await request(app.getHttpServer())
        .get('/admin/audit')
        .query({ cursor: 'not valid!' })
        .expect(400);
    });
  });

  describe('GET /admin/audit/filters', () => {
    it('should return distinct users, actions, resources for ADMIN', async () => {
      auditService.listFilterValues.mockResolvedValue({
        users: [{ id: 'u1', email: 'a@x.com' }],
        actions: ['env-var.create'],
        resources: ['env-var'],
      });

      const res = await request(app.getHttpServer()).get('/admin/audit/filters').expect(200);

      expect(res.body).toEqual({
        users: [{ id: 'u1', email: 'a@x.com' }],
        actions: ['env-var.create'],
        resources: ['env-var'],
      });
    });
  });

  describe('GET /admin/audit/export', () => {
    it('should return a CSV with header + data rows for ADMIN', async () => {
      auditService.findAllForExport.mockResolvedValue([sampleRow]);

      const res = await request(app.getHttpServer())
        .get('/admin/audit/export')
        .query({ action: 'env-var.create' })
        .expect(200);

      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="audit-.+\.csv"/);

      const lines = res.text.split('\n');
      expect(lines[0]).toBe('id,createdAt,userId,userEmail,action,resource,resourceId,metadata');
      expect(lines[1]).toContain('11111111-1111-4111-8111-111111111111');
      expect(lines[1]).toContain('env-var.create');
      expect(lines[1]).toContain('admin@example.com');
    });

    it('should pass filters through to findAllForExport (no cursor / limit)', async () => {
      auditService.findAllForExport.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/admin/audit/export')
        .query({ action: 'env-var.delete', resource: 'env-var' })
        .expect(200);

      expect(auditService.findAllForExport).toHaveBeenCalledWith({
        filters: { action: 'env-var.delete', resource: 'env-var' },
      });
    });

    it('should escape CSV quotes and commas inside JSON-stringified metadata', async () => {
      auditService.findAllForExport.mockResolvedValue([
        { ...sampleRow, metadata: { note: 'a, b' } },
      ]);

      const res = await request(app.getHttpServer()).get('/admin/audit/export').expect(200);
      const lines = res.text.split('\n');
      const dataLine = lines[1];
      // metadata field contains a comma so the whole CSV cell must be wrapped in double quotes
      // and each interior double quote (from JSON) must be doubled per RFC 4180.
      expect(dataLine).toMatch(/"\{""note"":""a, b""\}"$/);
    });

    it('should write an audit.export entry when an admin exports', async () => {
      auditService.findAllForExport.mockResolvedValue([]);

      await request(app.getHttpServer()).get('/admin/audit/export').expect(200);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-uuid',
          action: 'audit.export',
          resource: 'audit',
        }),
      );
    });
  });
});
