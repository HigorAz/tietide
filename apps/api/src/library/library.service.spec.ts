import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { PaymentRequiredException } from '../billing/payment-required.exception';
import { LibraryService } from './library.service';
import { LIBRARY_TEMPLATES } from './templates';

// Representative templates: one webhook-backed (provisions a Webhook on
// instantiate) and one schedule-backed (no webhook).
const WEBHOOK_SLUG = 'lead-capture-to-crm';
const NO_WEBHOOK_SLUG = 'daily-hn-ai-digest';
const webhookTemplate = LIBRARY_TEMPLATES.find((t) => t.slug === WEBHOOK_SLUG)!;
const noWebhookTemplate = LIBRARY_TEMPLATES.find((t) => t.slug === NO_WEBHOOK_SLUG)!;

describe('LibraryService', () => {
  let service: LibraryService;
  let prisma: {
    workflow: { create: jest.Mock };
    webhook: { create: jest.Mock };
  };
  let audit: { log: jest.Mock };
  let entitlements: { assertCanCreateWorkflow: jest.Mock };

  const orgId = 'org-uuid-1';
  const userId = 'user-uuid-1';

  beforeEach(async () => {
    prisma = {
      workflow: { create: jest.fn() },
      webhook: { create: jest.fn() },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    entitlements = { assertCanCreateWorkflow: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibraryService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: audit },
        { provide: EntitlementsService, useValue: entitlements },
      ],
    }).compile();

    service = module.get<LibraryService>(LibraryService);
    jest.clearAllMocks();
    entitlements.assertCanCreateWorkflow.mockResolvedValue(undefined);
  });

  describe('list', () => {
    it('should return one entry per library template', () => {
      const result = service.list();
      expect(result).toHaveLength(LIBRARY_TEMPLATES.length);
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

    it('should return at least 9 templates (AC: ≥9 templates)', () => {
      expect(service.list().length).toBeGreaterThanOrEqual(9);
    });

    it('should derive nodeTypes from the definition (deduped) for a template with repeated node types', () => {
      const result = service.list();
      // daily-hn-ai-digest has two http-request nodes; they dedupe to one entry.
      const digest = result.find((t) => t.slug === NO_WEBHOOK_SLUG);
      expect(digest).toBeDefined();
      expect(digest!.nodeTypes).toEqual(expect.arrayContaining(['cron-trigger', 'http-request']));
      const httpCount = digest!.nodeTypes.filter((t) => t === 'http-request').length;
      expect(httpCount).toBe(1);
    });

    it('should not leak the underlying definition or webhook config', () => {
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
      name: noWebhookTemplate.name,
      description: noWebhookTemplate.description,
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
      await service.instantiate(orgId, userId, NO_WEBHOOK_SLUG);

      expect(prisma.workflow.create).toHaveBeenCalledTimes(1);
      const call = prisma.workflow.create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(call.data).toEqual(
        expect.objectContaining({
          organizationId: orgId,
          userId,
          name: noWebhookTemplate.name,
          description: noWebhookTemplate.description,
          isActive: false,
        }),
      );
      expect(call.data.definition).toBeDefined();
    });

    it('should enforce the workflow entitlement before persisting (W5.24)', async () => {
      await service.instantiate(orgId, userId, NO_WEBHOOK_SLUG);

      expect(entitlements.assertCanCreateWorkflow).toHaveBeenCalledWith(orgId);
    });

    it('should throw 402 (reason "workflows") and not persist when at the workflow cap (W5.24)', async () => {
      entitlements.assertCanCreateWorkflow.mockRejectedValueOnce(
        new PaymentRequiredException('workflows', 'cap reached'),
      );

      await expect(service.instantiate(orgId, userId, NO_WEBHOOK_SLUG)).rejects.toBeInstanceOf(
        PaymentRequiredException,
      );
      expect(prisma.workflow.create).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('should always default isActive to false (security)', async () => {
      await service.instantiate(orgId, userId, WEBHOOK_SLUG);

      const call = prisma.workflow.create.mock.calls[0][0] as { data: { isActive: boolean } };
      expect(call.data.isActive).toBe(false);
    });

    it('should provision a Webhook row when the template declares webhook config', async () => {
      await service.instantiate(orgId, userId, WEBHOOK_SLUG);

      expect(prisma.webhook.create).toHaveBeenCalledTimes(1);
      const call = prisma.webhook.create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(call.data).toEqual(
        expect.objectContaining({
          workflowId: persistedWorkflow.id,
          isActive: true,
        }),
      );
      expect(typeof call.data.path).toBe('string');
      expect(call.data.path as string).toMatch(
        new RegExp(`^${webhookTemplate.webhook!.pathSuffix}-`),
      );
      expect(typeof call.data.hmacSecret).toBe('string');
      expect((call.data.hmacSecret as string).length).toBeGreaterThanOrEqual(32);
    });

    it('should NOT create a Webhook row when the template has no webhook config', async () => {
      await service.instantiate(orgId, userId, NO_WEBHOOK_SLUG);

      expect(prisma.webhook.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for an unknown slug (AC: 404 for unknown slug)', async () => {
      await expect(service.instantiate(orgId, userId, 'no-such-template')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.workflow.create).not.toHaveBeenCalled();
    });

    it('should record an audit log entry with action "library.instantiate" and the slug', async () => {
      await service.instantiate(orgId, userId, NO_WEBHOOK_SLUG);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          organizationId: orgId,
          action: 'library.instantiate',
          resource: 'workflow',
          resourceId: persistedWorkflow.id,
          metadata: expect.objectContaining({ slug: NO_WEBHOOK_SLUG }),
        }),
      );
    });

    it('should not dedup: two consecutive instantiations of the same slug create two distinct workflows', async () => {
      prisma.workflow.create
        .mockResolvedValueOnce({ ...persistedWorkflow, id: 'first' })
        .mockResolvedValueOnce({ ...persistedWorkflow, id: 'second' });

      const a = await service.instantiate(orgId, userId, NO_WEBHOOK_SLUG);
      const b = await service.instantiate(orgId, userId, NO_WEBHOOK_SLUG);

      expect(prisma.workflow.create).toHaveBeenCalledTimes(2);
      expect(a.id).toBe('first');
      expect(b.id).toBe('second');
    });

    it('should give each webhook instantiation a unique path so concurrent instantiations never collide', async () => {
      await service.instantiate(orgId, userId, WEBHOOK_SLUG);
      await service.instantiate(orgId, userId, WEBHOOK_SLUG);

      expect(prisma.webhook.create).toHaveBeenCalledTimes(2);
      const paths = prisma.webhook.create.mock.calls.map(
        (call) => (call[0] as { data: { path: string } }).data.path,
      );
      expect(new Set(paths).size).toBe(2);
    });

    it('should return the created workflow shape (no userId leak)', async () => {
      const result = await service.instantiate(orgId, userId, NO_WEBHOOK_SLUG);

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
