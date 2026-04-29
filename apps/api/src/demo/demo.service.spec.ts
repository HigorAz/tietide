import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { DemoService } from './demo.service';
import { DEMO_WORKFLOWS } from './demo-workflows.fixtures';

describe('DemoService', () => {
  const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  let service: DemoService;
  let audit: { log: jest.Mock };
  let prisma: {
    workflow: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    webhook: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
  };

  const baseWorkflow = (overrides: Record<string, unknown> = {}) => ({
    id: 'wf-id',
    name: 'Demo workflow',
    isActive: false,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      workflow: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      webhook: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemoService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: audit },
      ],
    }).compile();

    service = module.get<DemoService>(DemoService);
    jest.clearAllMocks();
  });

  describe('seedForUser', () => {
    it('should create one workflow per fixture when none exist for the user', async () => {
      prisma.workflow.findFirst.mockResolvedValue(null);
      prisma.workflow.create.mockImplementation(({ data }: { data: { name: string } }) =>
        Promise.resolve(baseWorkflow({ id: `wf-${data.name}`, name: data.name })),
      );
      prisma.webhook.findFirst.mockResolvedValue(null);
      prisma.webhook.create.mockImplementation(({ data }: { data: { path: string } }) =>
        Promise.resolve({ id: `hk-${data.path}`, path: data.path }),
      );

      const result = await service.seedForUser(userId);

      expect(prisma.workflow.create).toHaveBeenCalledTimes(DEMO_WORKFLOWS.length);
      expect(result.workflows).toHaveLength(DEMO_WORKFLOWS.length);
      for (const seeded of result.workflows) {
        expect(seeded.alreadyExisted).toBe(false);
      }
    });

    it('should always persist with the caller userId, never from any other source', async () => {
      prisma.workflow.findFirst.mockResolvedValue(null);
      prisma.workflow.create.mockImplementation(({ data }: { data: { name: string } }) =>
        Promise.resolve(baseWorkflow({ id: `wf-${data.name}`, name: data.name })),
      );
      prisma.webhook.findFirst.mockResolvedValue(null);
      prisma.webhook.create.mockResolvedValue({ id: 'hk-1', path: 'demo' });

      await service.seedForUser(userId);

      for (const call of prisma.workflow.create.mock.calls) {
        expect(call[0].data.userId).toBe(userId);
      }
    });

    it('should mark fixtures with activate:true as isActive', async () => {
      prisma.workflow.findFirst.mockResolvedValue(null);
      prisma.workflow.create.mockImplementation(
        ({ data }: { data: { name: string; isActive?: boolean } }) =>
          Promise.resolve(
            baseWorkflow({
              id: `wf-${data.name}`,
              name: data.name,
              isActive: data.isActive ?? false,
            }),
          ),
      );
      prisma.webhook.findFirst.mockResolvedValue(null);
      prisma.webhook.create.mockResolvedValue({ id: 'hk-1', path: 'demo' });

      await service.seedForUser(userId);

      const activeFixtures = DEMO_WORKFLOWS.filter((w) => w.activate);
      const activeCalls = prisma.workflow.create.mock.calls.filter(
        (c) => c[0].data.isActive === true,
      );
      expect(activeCalls).toHaveLength(activeFixtures.length);
    });

    it('should create a webhook for fixtures that declare one', async () => {
      prisma.workflow.findFirst.mockResolvedValue(null);
      prisma.workflow.create.mockImplementation(({ data }: { data: { name: string } }) =>
        Promise.resolve(baseWorkflow({ id: `wf-${data.name}`, name: data.name })),
      );
      prisma.webhook.findFirst.mockResolvedValue(null);
      prisma.webhook.create.mockImplementation(({ data }: { data: { path: string } }) =>
        Promise.resolve({ id: `hk-${data.path}`, path: data.path }),
      );

      const result = await service.seedForUser(userId);

      const expectedWebhookCount = DEMO_WORKFLOWS.filter((w) => w.webhook).length;
      expect(prisma.webhook.create).toHaveBeenCalledTimes(expectedWebhookCount);

      const seededWithWebhook = result.workflows.filter(
        (w: { webhookPath?: string }) => w.webhookPath !== undefined,
      );
      expect(seededWithWebhook).toHaveLength(expectedWebhookCount);
      for (const seeded of seededWithWebhook) {
        expect(seeded.webhookPath!.length).toBeGreaterThan(0);
      }
    });

    it('should generate per-user webhook paths to avoid global collisions', async () => {
      prisma.workflow.findFirst.mockResolvedValue(null);
      prisma.workflow.create.mockImplementation(({ data }: { data: { name: string } }) =>
        Promise.resolve(baseWorkflow({ id: `wf-${data.name}`, name: data.name })),
      );
      prisma.webhook.findFirst.mockResolvedValue(null);
      prisma.webhook.create.mockImplementation(({ data }: { data: { path: string } }) =>
        Promise.resolve({ id: `hk-${data.path}`, path: data.path }),
      );

      await service.seedForUser(userId);

      for (const call of prisma.webhook.create.mock.calls) {
        const path = call[0].data.path as string;
        // Per-user prefix prevents two users from claiming the same path
        expect(path).toContain(userId.slice(0, 8));
      }
    });

    it('should generate cryptographically random hmac secrets per webhook', async () => {
      prisma.workflow.findFirst.mockResolvedValue(null);
      prisma.workflow.create.mockImplementation(({ data }: { data: { name: string } }) =>
        Promise.resolve(baseWorkflow({ id: `wf-${data.name}`, name: data.name })),
      );
      prisma.webhook.findFirst.mockResolvedValue(null);
      prisma.webhook.create.mockImplementation(({ data }: { data: { path: string } }) =>
        Promise.resolve({ id: `hk-${data.path}`, path: data.path }),
      );

      await service.seedForUser(userId);

      const secrets = prisma.webhook.create.mock.calls.map((c) => c[0].data.hmacSecret as string);
      for (const secret of secrets) {
        expect(secret).toMatch(/^[a-f0-9]{64}$/);
      }
      expect(new Set(secrets).size).toBe(secrets.length);
    });

    it('should be idempotent: reuses existing demo workflows on re-seed', async () => {
      let counter = 0;
      prisma.workflow.findFirst.mockImplementation(() =>
        Promise.resolve(baseWorkflow({ id: `existing-${++counter}` })),
      );
      prisma.webhook.findFirst.mockResolvedValue({ id: 'hk-existing', path: 'demo-existing' });

      const result = await service.seedForUser(userId);

      expect(prisma.workflow.create).not.toHaveBeenCalled();
      expect(prisma.webhook.create).not.toHaveBeenCalled();
      expect(result.workflows).toHaveLength(DEMO_WORKFLOWS.length);
      for (const seeded of result.workflows) {
        expect(seeded.alreadyExisted).toBe(true);
      }
    });

    it('should record an audit log entry for each newly created demo workflow', async () => {
      prisma.workflow.findFirst.mockResolvedValue(null);
      prisma.workflow.create.mockImplementation(({ data }: { data: { name: string } }) =>
        Promise.resolve(baseWorkflow({ id: `wf-${data.name}`, name: data.name })),
      );
      prisma.webhook.findFirst.mockResolvedValue(null);
      prisma.webhook.create.mockImplementation(({ data }: { data: { path: string } }) =>
        Promise.resolve({ id: `hk-${data.path}`, path: data.path }),
      );

      await service.seedForUser(userId);

      expect(audit.log).toHaveBeenCalled();
      const workflowAuditEntries = audit.log.mock.calls.filter(
        (c) => c[0].action === 'demo.seed' && c[0].resource === 'workflow',
      );
      expect(workflowAuditEntries).toHaveLength(DEMO_WORKFLOWS.length);
      for (const call of audit.log.mock.calls) {
        expect(call[0].userId).toBe(userId);
      }
    });

    it('should not record an audit entry when a fixture already exists', async () => {
      prisma.workflow.findFirst.mockResolvedValue(baseWorkflow({ id: 'pre-existing' }));
      prisma.webhook.findFirst.mockResolvedValue({ id: 'hk-existing', path: 'demo' });

      await service.seedForUser(userId);

      expect(audit.log).not.toHaveBeenCalled();
    });

    it('should query existing workflows scoped by userId AND name', async () => {
      prisma.workflow.findFirst.mockResolvedValue(null);
      prisma.workflow.create.mockImplementation(({ data }: { data: { name: string } }) =>
        Promise.resolve(baseWorkflow({ id: `wf-${data.name}`, name: data.name })),
      );
      prisma.webhook.findFirst.mockResolvedValue(null);
      prisma.webhook.create.mockResolvedValue({ id: 'hk-1', path: 'demo' });

      await service.seedForUser(userId);

      for (const call of prisma.workflow.findFirst.mock.calls) {
        expect(call[0].where.userId).toBe(userId);
        expect(typeof call[0].where.name).toBe('string');
      }
    });
  });
});
