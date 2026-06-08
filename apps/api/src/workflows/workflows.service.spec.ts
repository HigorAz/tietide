import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { ActivationService } from '../provider-triggers/activation.service';
import { WorkflowsService } from './workflows.service';

describe('WorkflowsService', () => {
  let service: WorkflowsService;
  let audit: { log: jest.Mock };
  let prisma: {
    workflow: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    workflowVersion: {
      create: jest.Mock;
    };
    folder: {
      findFirst: jest.Mock;
    };
    tag: {
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const orgId = 'org-uuid-1';
  const otherOrgId = 'org-uuid-2';
  const userId = 'user-uuid-1';
  const workflowId = 'workflow-uuid-1';

  const validDefinition = {
    nodes: [
      {
        id: 'n1',
        type: 'manual-trigger',
        name: 'Start',
        position: { x: 0, y: 0 },
        config: {},
      },
    ],
    edges: [],
  };

  const persisted = {
    id: workflowId,
    name: 'Demo',
    description: null,
    definition: validDefinition,
    isActive: false,
    version: 1,
    folderId: null as string | null,
    createdAt: new Date('2026-04-17T00:00:00Z'),
    updatedAt: new Date('2026-04-17T00:00:00Z'),
    _count: { executions: 0 },
    documentation: null as { updatedAt: Date; version: number } | null,
    tags: [] as { tag: { id: string; name: string; color: string | null } }[],
  };

  const {
    _count: _persistedCount,
    documentation: _persistedDoc,
    tags: _persistedTags,
    ...persistedFields
  } = persisted;
  const persistedResponse = {
    ...persistedFields,
    executionCount: _persistedCount.executions,
    documentation: _persistedDoc,
    tags: _persistedTags.map((t) => t.tag),
  };

  beforeEach(async () => {
    prisma = {
      workflow: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      workflowVersion: {
        create: jest.fn().mockResolvedValue({}),
      },
      folder: {
        findFirst: jest.fn(),
      },
      tag: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    // Default: $transaction passes the mocked prisma through as the "tx" client
    prisma.$transaction.mockImplementation(async (cb: unknown) => {
      if (typeof cb === 'function') {
        return (cb as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return undefined;
    });
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const activation = {
      activateForWorkflow: jest.fn().mockResolvedValue(undefined),
      deactivateForWorkflow: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: audit },
        { provide: ActivationService, useValue: activation },
      ],
    }).compile();

    service = module.get<WorkflowsService>(WorkflowsService);
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (cb: unknown) => {
      if (typeof cb === 'function') {
        return (cb as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return undefined;
    });
    prisma.workflowVersion.create.mockResolvedValue({});
  });

  describe('create', () => {
    const dto = { name: 'Demo', definition: validDefinition };

    it('should persist with userId from the caller and return the row', async () => {
      prisma.workflow.create.mockResolvedValue(persisted);

      const result = await service.create(orgId, userId, dto);

      expect(prisma.workflow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            organizationId: orgId,
            userId,
            name: 'Demo',
            description: null,
            definition: validDefinition,
          },
        }),
      );
      expect(result).toEqual(persistedResponse);
    });

    it('should accept an optional description', async () => {
      prisma.workflow.create.mockResolvedValue(persisted);

      await service.create(orgId, userId, { ...dto, description: 'Notes' });

      expect(prisma.workflow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ description: 'Notes' }),
        }),
      );
    });

    it('should exclude userId from the selected/returned columns', async () => {
      prisma.workflow.create.mockResolvedValue(persisted);

      await service.create(orgId, userId, dto);

      const call = prisma.workflow.create.mock.calls[0][0] as { select: Record<string, boolean> };
      expect(call.select).toBeDefined();
      expect(call.select.userId).toBeFalsy();
    });

    it('should record an audit log entry with action "workflow.create"', async () => {
      prisma.workflow.create.mockResolvedValue(persisted);

      await service.create(orgId, userId, dto);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'workflow.create',
          resource: 'workflow',
          resourceId: workflowId,
        }),
      );
    });

    it('should accept definitions containing a "code" node now that the sandboxed executor is registered', async () => {
      prisma.workflow.create.mockResolvedValue(persisted);
      const definitionWithCode = {
        nodes: [
          ...validDefinition.nodes,
          {
            id: 'n2',
            type: 'code',
            name: 'Run JS',
            position: { x: 100, y: 0 },
            config: { code: 'return input;', language: 'javascript' },
          },
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      };

      await service.create(orgId, userId, { name: 'Demo', definition: definitionWithCode });

      expect(prisma.workflow.create).toHaveBeenCalled();
    });

    describe('node-type allow-list & config safety (W2.7)', () => {
      async function expectDefinitionRejection(
        definition: { nodes: unknown[]; edges: unknown[] },
        messageNeedle: string,
      ) {
        const promise = service.create(orgId, userId, {
          name: 'Demo',
          definition: definition as unknown as typeof validDefinition,
        });
        await expect(promise).rejects.toThrow(UnprocessableEntityException);
        try {
          await promise;
        } catch (err) {
          const body = (err as UnprocessableEntityException).getResponse() as {
            message: string;
            issues: { path: unknown[]; message: string }[];
          };
          expect(body.message).toBe('Workflow definition is not executable');
          expect(body.issues.some((i) => i.message.includes(messageNeedle))).toBe(true);
        }
        expect(prisma.workflow.create).not.toHaveBeenCalled();
        expect(prisma.workflowVersion.create).not.toHaveBeenCalled();
      }

      it('rejects a node whose type is not in the known-node allow-list', async () => {
        await expectDefinitionRejection(
          {
            nodes: [
              {
                id: 'n1',
                type: 'totally-made-up-node',
                name: 'Evil',
                position: { x: 0, y: 0 },
                config: {},
              },
            ],
            edges: [],
          },
          'Unknown node type',
        );
      });

      it('rejects a node whose config carries a prototype-pollution key', async () => {
        // `constructor`/`prototype` survive JSON parsing as plain own keys (only
        // `__proto__` is special-cased away by the runtime), so this exercises
        // the save-boundary executable-schema gate. The `__proto__` variant is
        // caught one layer earlier at the HTTP DTO (see safe-node-config spec).
        await expectDefinitionRejection(
          {
            nodes: [
              {
                id: 'n1',
                type: 'manual-trigger',
                name: 'Start',
                position: { x: 0, y: 0 },
                config: { constructor: { polluted: true } },
              },
            ],
            edges: [],
          },
          'constructor',
        );
      });

      it('rejects a config nested beyond the maximum depth', async () => {
        let deep: Record<string, unknown> = { leaf: true };
        for (let i = 0; i < 30; i++) {
          deep = { nested: deep };
        }
        await expectDefinitionRejection(
          {
            nodes: [
              {
                id: 'n1',
                type: 'manual-trigger',
                name: 'Start',
                position: { x: 0, y: 0 },
                config: deep,
              },
            ],
            edges: [],
          },
          'nesting',
        );
      });

      it('accepts a known node type with a normal nested config', async () => {
        prisma.workflow.create.mockResolvedValue(persisted);
        await service.create(orgId, userId, {
          name: 'Demo',
          definition: {
            nodes: [
              {
                id: 'n1',
                type: 'manual-trigger',
                name: 'Start',
                position: { x: 0, y: 0 },
                config: {},
              },
              {
                id: 'n2',
                type: 'http-request',
                name: 'Call',
                position: { x: 100, y: 0 },
                config: { method: 'GET', headers: { 'x-a': '1' }, body: { nested: { ok: true } } },
              },
            ],
            edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
          } as unknown as typeof validDefinition,
        });
        expect(prisma.workflow.create).toHaveBeenCalled();
      });
    });

    describe('topology validation', () => {
      const trigger = (id: string, type = 'manual-trigger', name = id) => ({
        id,
        type,
        name,
        position: { x: 0, y: 0 },
        config: {},
      });
      const action = (id: string, type = 'http-request', name = id) => ({
        id,
        type,
        name,
        position: { x: 0, y: 0 },
        config: {},
      });
      const edge = (id: string, source: string, target: string) => ({ id, source, target });

      async function expectTopologyRejection(
        definition: { nodes: unknown[]; edges: unknown[] },
        expectedCode: string,
      ) {
        const promise = service.create(orgId, userId, {
          name: 'Demo',
          definition: definition as unknown as typeof validDefinition,
        });
        await expect(promise).rejects.toThrow(UnprocessableEntityException);
        try {
          await promise;
        } catch (err) {
          const body = (err as UnprocessableEntityException).getResponse() as {
            issues: { code: string; path: unknown[]; message: string }[];
          };
          expect(Array.isArray(body.issues)).toBe(true);
          expect(body.issues.some((i) => i.code === expectedCode)).toBe(true);
        }
        expect(prisma.workflow.create).not.toHaveBeenCalled();
        expect(prisma.workflowVersion.create).not.toHaveBeenCalled();
        expect(audit.log).not.toHaveBeenCalled();
      }

      it('rejects a definition with zero triggers (self-loop A->A)', async () => {
        await expectTopologyRejection(
          { nodes: [action('A')], edges: [edge('e1', 'A', 'A')] },
          'no_trigger',
        );
      });

      it('rejects a definition with more than one trigger', async () => {
        await expectTopologyRejection(
          {
            nodes: [trigger('t1'), trigger('t2'), action('a1')],
            edges: [edge('e1', 't1', 'a1'), edge('e2', 't2', 'a1')],
          },
          'multiple_triggers',
        );
      });

      it('rejects a definition containing a cycle downstream of the trigger', async () => {
        await expectTopologyRejection(
          {
            nodes: [trigger('t'), action('A'), action('B')],
            edges: [edge('e0', 't', 'A'), edge('e1', 'A', 'B'), edge('e2', 'B', 'A')],
          },
          'cycle',
        );
      });

      it('rejects a definition with an edge that references a non-existent node id', async () => {
        await expectTopologyRejection(
          {
            nodes: [trigger('t'), action('A')],
            edges: [edge('e1', 't', 'A'), edge('e2', 'A', 'ghost')],
          },
          'dangling_edge',
        );
      });
    });

    it('should seed an initial WorkflowVersion v1 with the new definition', async () => {
      prisma.workflow.create.mockResolvedValue(persisted);

      await service.create(orgId, userId, dto);

      expect(prisma.workflowVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workflowId,
          version: 1,
          definition: validDefinition,
          createdById: userId,
        }),
      });
    });

    it('should perform create + initial snapshot in a single $transaction', async () => {
      prisma.workflow.create.mockResolvedValue(persisted);

      await service.create(orgId, userId, dto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('list', () => {
    // The list projection drops the heavy `definition` JSONB (W3.2).
    const { definition: _omitDef, ...persistedListItem } = persistedResponse;

    it('should query Prisma scoped to the caller userId only with a keyset order', async () => {
      prisma.workflow.findMany.mockResolvedValue([]);

      await service.list(orgId);

      expect(prisma.workflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: orgId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
    });

    it('should fetch limit + 1 rows to detect a next page', async () => {
      prisma.workflow.findMany.mockResolvedValue([]);

      await service.list(orgId, { limit: 10 });

      const call = prisma.workflow.findMany.mock.calls[0][0] as { take: number };
      expect(call.take).toBe(11);
    });

    it('should return items wrapped with a null nextCursor when not full', async () => {
      prisma.workflow.findMany.mockResolvedValue([persisted]);

      const result = await service.list(orgId);

      expect(result).toEqual({ items: [persistedListItem], nextCursor: null });
    });

    it('should NOT request or return the heavy definition field', async () => {
      prisma.workflow.findMany.mockResolvedValue([persisted]);

      const result = await service.list(orgId);

      const call = prisma.workflow.findMany.mock.calls[0][0] as {
        select: Record<string, unknown>;
      };
      expect(call.select.definition).toBeFalsy();
      expect(result.items[0]).not.toHaveProperty('definition');
    });

    it('should set nextCursor and slice to the page when an extra row is fetched', async () => {
      const rows = [
        { ...persisted, id: 'wf-a', createdAt: new Date('2026-04-03T00:00:00Z') },
        { ...persisted, id: 'wf-b', createdAt: new Date('2026-04-02T00:00:00Z') },
        { ...persisted, id: 'wf-c', createdAt: new Date('2026-04-01T00:00:00Z') },
      ];
      prisma.workflow.findMany.mockResolvedValue(rows);

      const result = await service.list(orgId, { limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.items.map((w) => w.id)).toEqual(['wf-a', 'wf-b']);
      expect(typeof result.nextCursor).toBe('string');
    });

    it('should apply a keyset where-clause when a cursor is supplied', async () => {
      prisma.workflow.findMany.mockResolvedValue([persisted]);
      // Cursor encoding mirrors the service: { v: createdAt ISO, id }.
      const cursor = Buffer.from(
        JSON.stringify({ v: '2026-04-10T00:00:00.000Z', id: 'wf-x' }),
        'utf8',
      ).toString('base64url');

      await service.list(orgId, { cursor });

      const call = prisma.workflow.findMany.mock.calls[0][0] as {
        where: { AND?: unknown[] };
      };
      expect(call.where.AND).toBeDefined();
    });

    it('should request the execution count via Prisma _count', async () => {
      prisma.workflow.findMany.mockResolvedValue([]);

      await service.list(orgId);

      const call = prisma.workflow.findMany.mock.calls[0][0] as {
        select: Record<string, unknown>;
      };
      expect(call.select._count).toEqual({ select: { executions: true } });
    });

    it('should map _count.executions to executionCount', async () => {
      prisma.workflow.findMany.mockResolvedValue([{ ...persisted, _count: { executions: 7 } }]);

      const { items } = await service.list(orgId);

      expect(items[0].executionCount).toBe(7);
      expect(items[0]).not.toHaveProperty('_count');
    });

    it('should exclude userId from the response select', async () => {
      prisma.workflow.findMany.mockResolvedValue([]);

      await service.list(orgId);

      const call = prisma.workflow.findMany.mock.calls[0][0] as {
        select: Record<string, boolean>;
      };
      expect(call.select).toBeDefined();
      expect(call.select.userId).toBeFalsy();
    });

    it('should map documentation { updatedAt, version } to { generatedAt, version }', async () => {
      const docUpdated = new Date('2026-05-01T10:00:00Z');
      prisma.workflow.findMany.mockResolvedValue([
        { ...persisted, documentation: { updatedAt: docUpdated, version: 3 } },
      ]);

      const { items } = await service.list(orgId);

      expect(items[0].documentation).toEqual({ generatedAt: docUpdated, version: 3 });
    });

    it('should expose documentation as null when none exists', async () => {
      prisma.workflow.findMany.mockResolvedValue([{ ...persisted, documentation: null }]);

      const { items } = await service.list(orgId);

      expect(items[0].documentation).toBeNull();
    });
  });

  describe('findOne', () => {
    it('should return the workflow when the caller owns it', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ ...persisted, organizationId: orgId });

      const result = await service.findOne(orgId, workflowId);

      expect(prisma.workflow.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: workflowId } }),
      );
      expect(result).toEqual(expect.objectContaining({ id: workflowId }));
    });

    it('should throw NotFoundException when the row does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await expect(service.findOne(orgId, workflowId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when the row belongs to another user', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ ...persisted, organizationId: otherOrgId });

      await expect(service.findOne(orgId, workflowId)).rejects.toThrow(ForbiddenException);
    });

    it('should not leak userId in the returned payload', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ ...persisted, organizationId: orgId });

      const result = await service.findOne(orgId, workflowId);

      expect(result).not.toHaveProperty('userId');
    });

    it('should include documentation metadata when present', async () => {
      const docUpdated = new Date('2026-05-02T08:30:00Z');
      prisma.workflow.findUnique.mockResolvedValue({
        ...persisted,
        organizationId: orgId,
        documentation: { updatedAt: docUpdated, version: 2 },
      });

      const result = await service.findOne(orgId, workflowId);

      expect(result.documentation).toEqual({ generatedAt: docUpdated, version: 2 });
    });

    it('should expose documentation as null when none exists', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        ...persisted,
        organizationId: orgId,
        documentation: null,
      });

      const result = await service.findOne(orgId, workflowId);

      expect(result.documentation).toBeNull();
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.workflow.findUnique.mockResolvedValue({ ...persisted, organizationId: orgId });
      prisma.workflow.update.mockResolvedValue({ ...persisted, version: 2 });
    });

    it('should apply partial fields without bumping version when definition is unchanged', async () => {
      await service.update(orgId, userId, workflowId, { name: 'Renamed' });

      const call = prisma.workflow.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(call.data.name).toBe('Renamed');
      expect(call.data.version).toBeUndefined();
    });

    it('should accept an updated definition and persist it verbatim', async () => {
      const newDef = {
        nodes: [
          ...validDefinition.nodes,
          {
            id: 'n2',
            type: 'http-request',
            name: 'Call API',
            position: { x: 100, y: 0 },
            config: {},
          },
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      };

      await service.update(orgId, userId, workflowId, { definition: newDef });

      expect(prisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ definition: newDef }),
        }),
      );
    });

    it('should NOT bump version when only isActive changes', async () => {
      await service.update(orgId, userId, workflowId, { isActive: true });

      const call = prisma.workflow.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(call.data.isActive).toBe(true);
      expect(call.data.version).toBeUndefined();
    });

    it('should bump version by 1 ONLY when definition changes', async () => {
      prisma.workflow.findUnique.mockResolvedValueOnce({ ...persisted, organizationId: orgId });
      prisma.workflow.findUnique.mockResolvedValueOnce({
        definition: validDefinition,
        version: 1,
      });
      const newDef = { ...validDefinition };
      await service.update(orgId, userId, workflowId, { definition: newDef });

      expect(prisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: 2 }),
        }),
      );
    });

    it('should snapshot the NEW definition at the NEW version when definition changes', async () => {
      // WorkflowVersion(1) already exists from create; on update we snapshot the
      // new state at v+1 (every version has exactly one row).
      prisma.workflow.findUnique.mockResolvedValueOnce({ ...persisted, organizationId: orgId });
      prisma.workflow.findUnique.mockResolvedValueOnce({
        definition: validDefinition,
        version: 1,
      });
      const newDef = {
        nodes: [
          ...validDefinition.nodes,
          {
            id: 'n2',
            type: 'http-request',
            name: 'Call API',
            position: { x: 100, y: 0 },
            config: {},
          },
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      };

      await service.update(orgId, userId, workflowId, {
        definition: newDef,
        versionMessage: 'tweak',
      });

      expect(prisma.workflowVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workflowId,
          version: 2,
          definition: newDef,
          createdById: userId,
          message: 'tweak',
        }),
      });
    });

    it('should NOT call workflowVersion.create when only name/isActive change', async () => {
      await service.update(orgId, userId, workflowId, { name: 'Renamed' });
      await service.update(orgId, userId, workflowId, { isActive: true });
      await service.update(orgId, userId, workflowId, { description: 'noted' });

      expect(prisma.workflowVersion.create).not.toHaveBeenCalled();
    });

    it('should wrap snapshot + update in a single $transaction when definition changes', async () => {
      prisma.workflow.findUnique.mockResolvedValueOnce({ ...persisted, organizationId: orgId });
      prisma.workflow.findUnique.mockResolvedValueOnce({
        definition: validDefinition,
        version: 1,
      });
      const newDef = { ...validDefinition };
      await service.update(orgId, userId, workflowId, { definition: newDef });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should NOT use $transaction when definition is unchanged', async () => {
      await service.update(orgId, userId, workflowId, { name: 'Renamed' });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the row does not exist', async () => {
      prisma.workflow.findUnique.mockReset();
      prisma.workflow.findUnique.mockResolvedValue(null);

      await expect(service.update(orgId, userId, workflowId, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.workflow.update).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when the row belongs to another user', async () => {
      prisma.workflow.findUnique.mockReset();
      prisma.workflow.findUnique.mockResolvedValue({ ...persisted, organizationId: otherOrgId });

      await expect(service.update(orgId, userId, workflowId, { name: 'X' })).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.workflow.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException with an empty body and not touch Prisma', async () => {
      prisma.workflow.findUnique.mockReset();
      await expect(service.update(orgId, userId, workflowId, {})).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.workflow.findUnique).not.toHaveBeenCalled();
      expect(prisma.workflow.update).not.toHaveBeenCalled();
    });

    it('should accept description: null to clear it', async () => {
      await service.update(orgId, userId, workflowId, { description: null });

      expect(prisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ description: null }),
        }),
      );
    });

    it('should return the updated row without userId', async () => {
      const result = await service.update(orgId, userId, workflowId, { name: 'Renamed' });

      expect(result).not.toHaveProperty('userId');
      expect(result.version).toBe(2);
    });

    it('should record an audit log entry with action "workflow.update"', async () => {
      await service.update(orgId, userId, workflowId, { name: 'Renamed' });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'workflow.update',
          resource: 'workflow',
          resourceId: workflowId,
        }),
      );
    });

    it('should accept definitions containing a "code" node now that the sandboxed executor is registered', async () => {
      const definitionWithCode = {
        nodes: [
          ...validDefinition.nodes,
          {
            id: 'n2',
            type: 'code',
            name: 'Run JS',
            position: { x: 100, y: 0 },
            config: { code: 'return input;', language: 'javascript' },
          },
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      };

      await service.update(orgId, userId, workflowId, { definition: definitionWithCode });

      expect(prisma.workflow.update).toHaveBeenCalled();
    });

    describe('topology validation', () => {
      const trigger = (id: string, type = 'manual-trigger', name = id) => ({
        id,
        type,
        name,
        position: { x: 0, y: 0 },
        config: {},
      });
      const action = (id: string, type = 'http-request', name = id) => ({
        id,
        type,
        name,
        position: { x: 0, y: 0 },
        config: {},
      });
      const edge = (id: string, source: string, target: string) => ({ id, source, target });

      async function expectTopologyRejection(
        definition: { nodes: unknown[]; edges: unknown[] },
        expectedCode: string,
      ) {
        const promise = service.update(orgId, userId, workflowId, {
          definition: definition as unknown as typeof validDefinition,
        });
        await expect(promise).rejects.toThrow(UnprocessableEntityException);
        try {
          await promise;
        } catch (err) {
          const body = (err as UnprocessableEntityException).getResponse() as {
            issues: { code: string; path: unknown[]; message: string }[];
          };
          expect(body.issues.some((i) => i.code === expectedCode)).toBe(true);
        }
        expect(prisma.workflow.update).not.toHaveBeenCalled();
        expect(prisma.workflowVersion.create).not.toHaveBeenCalled();
      }

      it('rejects an update with zero triggers (self-loop)', async () => {
        await expectTopologyRejection(
          { nodes: [action('A')], edges: [edge('e1', 'A', 'A')] },
          'no_trigger',
        );
      });

      it('rejects an update with more than one trigger', async () => {
        await expectTopologyRejection(
          {
            nodes: [trigger('t1'), trigger('t2'), action('a1')],
            edges: [edge('e1', 't1', 'a1'), edge('e2', 't2', 'a1')],
          },
          'multiple_triggers',
        );
      });

      it('rejects an update with a cycle downstream of the trigger', async () => {
        await expectTopologyRejection(
          {
            nodes: [trigger('t'), action('A'), action('B')],
            edges: [edge('e0', 't', 'A'), edge('e1', 'A', 'B'), edge('e2', 'B', 'A')],
          },
          'cycle',
        );
      });

      it('rejects an update with a dangling edge', async () => {
        await expectTopologyRejection(
          {
            nodes: [trigger('t'), action('A')],
            edges: [edge('e1', 't', 'A'), edge('e2', 'A', 'ghost')],
          },
          'dangling_edge',
        );
      });
    });
  });

  describe('list — filters', () => {
    const folderUuid = '550e8400-e29b-41d4-a716-446655440010';
    const tagUuidA = '550e8400-e29b-41d4-a716-446655440020';
    const tagUuidB = '550e8400-e29b-41d4-a716-446655440021';

    it('passes folderId=null to where when filter.folderId === null', async () => {
      prisma.workflow.findMany.mockResolvedValue([]);

      await service.list(orgId, { folderId: null });

      expect(prisma.workflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: orgId, folderId: null } }),
      );
    });

    it('passes folderId=<uuid> to where when filter.folderId is a uuid', async () => {
      prisma.workflow.findMany.mockResolvedValue([]);

      await service.list(orgId, { folderId: folderUuid });

      expect(prisma.workflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: orgId, folderId: folderUuid } }),
      );
    });

    it('omits folderId from where when filter.folderId is undefined', async () => {
      prisma.workflow.findMany.mockResolvedValue([]);

      await service.list(orgId, {});

      const call = prisma.workflow.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where).toEqual({ organizationId: orgId });
    });

    it('builds tags.some filter when tagIds provided', async () => {
      prisma.workflow.findMany.mockResolvedValue([]);

      await service.list(orgId, { tagIds: [tagUuidA, tagUuidB] });

      expect(prisma.workflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: orgId, tags: { some: { tagId: { in: [tagUuidA, tagUuidB] } } } },
        }),
      );
    });

    it('skips tags filter when tagIds is empty', async () => {
      prisma.workflow.findMany.mockResolvedValue([]);

      await service.list(orgId, { tagIds: [] });

      const call = prisma.workflow.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where).toEqual({ organizationId: orgId });
    });

    it('combines folderId and tagIds filters', async () => {
      prisma.workflow.findMany.mockResolvedValue([]);

      await service.list(orgId, { folderId: folderUuid, tagIds: [tagUuidA] });

      expect(prisma.workflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: orgId,
            folderId: folderUuid,
            tags: { some: { tagId: { in: [tagUuidA] } } },
          },
        }),
      );
    });

    it('maps nested tags to flat WorkflowTagSummary array in response', async () => {
      const tagRow = { tag: { id: tagUuidA, name: 'client-a', color: '#3366cc' } };
      prisma.workflow.findMany.mockResolvedValue([{ ...persisted, tags: [tagRow] }]);

      const {
        items: [row],
      } = await service.list(orgId);

      expect(row.tags).toEqual([{ id: tagUuidA, name: 'client-a', color: '#3366cc' }]);
    });
  });

  describe('update — folderId and tagIds', () => {
    const folderUuid = '550e8400-e29b-41d4-a716-446655440010';
    const tagUuidA = '550e8400-e29b-41d4-a716-446655440020';

    beforeEach(() => {
      prisma.workflow.findUnique.mockResolvedValue({ ...persisted, organizationId: orgId });
      prisma.workflow.update.mockResolvedValue({ ...persisted, version: 1 });
    });

    it('connects folder when folderId is a uuid the user owns', async () => {
      prisma.folder.findFirst.mockResolvedValue({ id: folderUuid });

      await service.update(orgId, userId, workflowId, { folderId: folderUuid });

      expect(prisma.folder.findFirst).toHaveBeenCalledWith({
        where: { id: folderUuid, organizationId: orgId },
        select: { id: true },
      });
      expect(prisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ folder: { connect: { id: folderUuid } } }),
        }),
      );
    });

    it('rejects folderId belonging to another user (NotFoundException)', async () => {
      prisma.folder.findFirst.mockResolvedValue(null);

      await expect(
        service.update(orgId, userId, workflowId, { folderId: folderUuid }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.workflow.update).not.toHaveBeenCalled();
    });

    it('disconnects folder when folderId is null', async () => {
      await service.update(orgId, userId, workflowId, { folderId: null });

      expect(prisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ folder: { disconnect: true } }),
        }),
      );
    });

    it('replaces tag set with deleteMany + create when tagIds provided', async () => {
      prisma.tag.findMany.mockResolvedValue([{ id: tagUuidA }]);

      await service.update(orgId, userId, workflowId, { tagIds: [tagUuidA] });

      expect(prisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tags: {
              deleteMany: {},
              create: [{ tag: { connect: { id: tagUuidA } } }],
            },
          }),
        }),
      );
    });

    it('rejects when any tagId belongs to another user (NotFoundException)', async () => {
      prisma.tag.findMany.mockResolvedValue([]); // none owned

      await expect(
        service.update(orgId, userId, workflowId, { tagIds: [tagUuidA] }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.workflow.update).not.toHaveBeenCalled();
    });

    it('clears tags when tagIds is an empty array', async () => {
      await service.update(orgId, userId, workflowId, { tagIds: [] });

      expect(prisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tags: { deleteMany: {}, create: [] },
          }),
        }),
      );
      // No need to validate tags when array is empty
      expect(prisma.tag.findMany).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete when the caller owns the row', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ ...persisted, organizationId: orgId });
      prisma.workflow.deleteMany.mockResolvedValue({ count: 1 });

      await service.remove(orgId, userId, workflowId);

      expect(prisma.workflow.deleteMany).toHaveBeenCalledWith({
        where: { id: workflowId, organizationId: orgId },
      });
    });

    it('should record an audit log entry with action "workflow.delete"', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ ...persisted, organizationId: orgId });
      prisma.workflow.deleteMany.mockResolvedValue({ count: 1 });

      await service.remove(orgId, userId, workflowId);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'workflow.delete',
          resource: 'workflow',
          resourceId: workflowId,
        }),
      );
    });

    it('should throw NotFoundException when the row does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await expect(service.remove(orgId, userId, workflowId)).rejects.toThrow(NotFoundException);

      expect(prisma.workflow.deleteMany).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when the row belongs to another user', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ ...persisted, organizationId: otherOrgId });

      await expect(service.remove(orgId, userId, workflowId)).rejects.toThrow(ForbiddenException);

      expect(prisma.workflow.deleteMany).not.toHaveBeenCalled();
    });
  });
});
