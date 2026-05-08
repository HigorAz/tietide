import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { LibraryService } from './library.service';
import { DEMO_WORKFLOWS } from '../demo/demo-workflows.fixtures';

describe('LibraryService', () => {
  let service: LibraryService;
  let prisma: {
    workflow: { create: jest.Mock };
    webhook: { create: jest.Mock };
  };
  let audit: { log: jest.Mock };

  const userId = 'user-uuid-1';

  beforeEach(async () => {
    prisma = {
      workflow: { create: jest.fn() },
      webhook: { create: jest.fn() },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibraryService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: audit },
      ],
    }).compile();

    service = module.get<LibraryService>(LibraryService);
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('should return one entry per fixture', () => {
      const result = service.list();
      expect(result).toHaveLength(DEMO_WORKFLOWS.length);
    });

    it('should expose slug, name, description, category and nodeTypes for every template (AC: schema)', () => {
      const result = service.list();
      for (const template of result) {
        expect(typeof template.slug).toBe('string');
        expect(template.slug.length).toBeGreaterThan(0);
        expect(typeof template.name).toBe('string');
        expect(template.name.length).toBeGreaterThan(0);
        expect(typeof template.description).toBe('string');
        expect(template.description.length).toBeGreaterThan(0);
        expect(typeof template.category).toBe('string');
        expect(template.category.length).toBeGreaterThan(0);
        expect(Array.isArray(template.nodeTypes)).toBe(true);
        expect(template.nodeTypes.length).toBeGreaterThan(0);
      }
    });

    it('should return at least 4 templates (AC: GET /v1/library/templates returns at least 4)', () => {
      expect(service.list().length).toBeGreaterThanOrEqual(4);
    });

    it('should derive nodeTypes from the fixture definition (deduped) for the webhook fixture', () => {
      const result = service.list();
      const webhookTemplate = result.find((t) => t.slug === 'webhook-conditional-notification');
      expect(webhookTemplate).toBeDefined();
      expect(webhookTemplate!.nodeTypes).toEqual(
        expect.arrayContaining(['webhook-trigger', 'http-request', 'conditional']),
      );
      // Two http-request nodes in the fixture should appear once in the deduped list.
      const httpCount = webhookTemplate!.nodeTypes.filter((t) => t === 'http-request').length;
      expect(httpCount).toBe(1);
    });

    it('should not leak the underlying fixture definition or webhook config', () => {
      const result = service.list();
      for (const template of result) {
        expect(template).not.toHaveProperty('definition');
        expect(template).not.toHaveProperty('webhook');
        expect(template).not.toHaveProperty('activate');
      }
    });
  });

  describe('instantiate', () => {
    const persistedWorkflow = {
      id: 'new-workflow-uuid',
      name: 'Demo: Cron → Fetch → Archive',
      description: 'cron description',
      definition: { nodes: [], edges: [] },
      isActive: false,
      version: 1,
      folderId: null,
      createdAt: new Date('2026-05-04T10:00:00Z'),
      updatedAt: new Date('2026-05-04T10:00:00Z'),
      _count: { executions: 0 },
      documentation: null,
      tags: [],
    };

    beforeEach(() => {
      prisma.workflow.create.mockResolvedValue(persistedWorkflow);
      prisma.webhook.create.mockResolvedValue({ path: 'whatever' });
    });

    it('should create a Workflow row owned by the requesting user (AC: instantiate creates Workflow owned by caller)', async () => {
      await service.instantiate(userId, 'cron-fetch-process');

      expect(prisma.workflow.create).toHaveBeenCalledTimes(1);
      const call = prisma.workflow.create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(call.data).toEqual(
        expect.objectContaining({
          userId,
          name: 'Demo: Cron → Fetch → Archive',
          description:
            'Hourly cron pulls fresh data from a public endpoint and forwards the response to an archive sink.',
          isActive: false,
        }),
      );
      expect(call.data.definition).toBeDefined();
    });

    it('should always default isActive to false even when the fixture is active (security)', async () => {
      // The webhook fixture has activate=true. Library instantiation must not auto-activate.
      await service.instantiate(userId, 'webhook-conditional-notification');

      const call = prisma.workflow.create.mock.calls[0][0] as { data: { isActive: boolean } };
      expect(call.data.isActive).toBe(false);
    });

    it('should provision a Webhook row when the fixture has webhook config', async () => {
      await service.instantiate(userId, 'webhook-conditional-notification');

      expect(prisma.webhook.create).toHaveBeenCalledTimes(1);
      const call = prisma.webhook.create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(call.data).toEqual(
        expect.objectContaining({
          workflowId: persistedWorkflow.id,
          isActive: true,
        }),
      );
      // Path should start with the fixture's pathSuffix and include a unique component.
      expect(typeof call.data.path).toBe('string');
      expect(call.data.path as string).toMatch(/^webhook-demo-/);
      // HMAC secret is a fresh random hex string of non-trivial length.
      expect(typeof call.data.hmacSecret).toBe('string');
      expect((call.data.hmacSecret as string).length).toBeGreaterThanOrEqual(32);
    });

    it('should NOT create a Webhook row when the fixture has no webhook config', async () => {
      await service.instantiate(userId, 'cron-fetch-process');

      expect(prisma.webhook.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for an unknown slug (AC: 404 for unknown slug)', async () => {
      await expect(service.instantiate(userId, 'no-such-template')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.workflow.create).not.toHaveBeenCalled();
    });

    it('should record an audit log entry with action "library.instantiate" and the slug', async () => {
      await service.instantiate(userId, 'cron-fetch-process');

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'library.instantiate',
          resource: 'workflow',
          resourceId: persistedWorkflow.id,
          metadata: expect.objectContaining({ slug: 'cron-fetch-process' }),
        }),
      );
    });

    it('should not dedup: two consecutive instantiations of the same slug create two distinct workflows', async () => {
      prisma.workflow.create
        .mockResolvedValueOnce({ ...persistedWorkflow, id: 'first' })
        .mockResolvedValueOnce({ ...persistedWorkflow, id: 'second' });

      const a = await service.instantiate(userId, 'cron-fetch-process');
      const b = await service.instantiate(userId, 'cron-fetch-process');

      expect(prisma.workflow.create).toHaveBeenCalledTimes(2);
      expect(a.id).toBe('first');
      expect(b.id).toBe('second');
    });

    it('should give each webhook instantiation a unique path so concurrent instantiations never collide', async () => {
      await service.instantiate(userId, 'webhook-conditional-notification');
      await service.instantiate(userId, 'webhook-conditional-notification');

      expect(prisma.webhook.create).toHaveBeenCalledTimes(2);
      const paths = prisma.webhook.create.mock.calls.map(
        (call) => (call[0] as { data: { path: string } }).data.path,
      );
      expect(new Set(paths).size).toBe(2);
    });

    it('should return the created workflow shape (no userId leak)', async () => {
      const result = await service.instantiate(userId, 'cron-fetch-process');

      expect(result).toEqual(
        expect.objectContaining({
          id: persistedWorkflow.id,
          name: persistedWorkflow.name,
          isActive: false,
        }),
      );
      expect(result).not.toHaveProperty('userId');
    });
  });
});
