import type { ExecutionContext, NodeInput } from '@tietide/sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { EngineService } from '../../engine/engine.service';
import { RecursionDepthExceededError } from '../../engine/workflow-runner';
import {
  SUBWORKFLOW_NODE_TYPE,
  SubworkflowAction,
  SubworkflowFailedError,
  SubworkflowTargetNotFoundError,
} from './subworkflow';

interface PrismaMock {
  workflow: { findFirst: jest.Mock };
  workflowExecution: { findUnique: jest.Mock; create: jest.Mock };
  executionStep: { findFirst: jest.Mock };
}

const TARGET_WF = '11111111-2222-3333-4444-555555555555';
const PARENT_EXEC = 'parent-exec-1';

const makeContext = (overrides: Partial<ExecutionContext> = {}): ExecutionContext => ({
  executionId: PARENT_EXEC,
  workflowId: 'caller-wf',
  nodeId: 'subwf-1',
  isDryRun: false,
  depth: 0,
  logger: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  },
  getSecret: async () => 'secret',
  getConnection: async () => {
    throw new Error('not implemented');
  },
  markConnectionForRefresh: async () => undefined,
  ...overrides,
});

describe('SubworkflowAction', () => {
  let prisma: PrismaMock;
  let engine: { execute: jest.Mock };
  let action: SubworkflowAction;

  beforeEach(() => {
    prisma = {
      workflow: { findFirst: jest.fn() },
      workflowExecution: { findUnique: jest.fn(), create: jest.fn() },
      executionStep: { findFirst: jest.fn() },
    };
    engine = { execute: jest.fn(async () => undefined) };
    action = new SubworkflowAction(
      prisma as unknown as PrismaService,
      engine as unknown as EngineService,
    );
  });

  it('should declare type "subworkflow" and category "logic"', () => {
    expect(action.type).toBe(SUBWORKFLOW_NODE_TYPE);
    expect(action.type).toBe('subworkflow');
    expect(action.category).toBe('logic');
  });

  describe('execute', () => {
    const baseInput: NodeInput = {
      data: {},
      params: {
        workflowId: TARGET_WF,
        inputMapping: { item: 'a', n: 1 },
      },
    };

    it('should throw RecursionDepthExceededError when depth has reached the limit', async () => {
      // 5 is MAX_RECURSION_DEPTH; calling the subworkflow at depth=5 would
      // produce a child at depth 6 — beyond the limit.
      await expect(action.execute(baseInput, makeContext({ depth: 5 }))).rejects.toThrow(
        RecursionDepthExceededError,
      );
    });

    it('should reject when the target workflow does not belong to the caller (IDOR guard)', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: PARENT_EXEC,
        workflow: { userId: 'user-a' },
      });
      // Cross-user lookup returns null because the where clause requires same userId.
      prisma.workflow.findFirst.mockResolvedValue(null);

      await expect(action.execute(baseInput, makeContext())).rejects.toThrow(
        SubworkflowTargetNotFoundError,
      );
      expect(engine.execute).not.toHaveBeenCalled();
    });

    it('should create a child WorkflowExecution with parentExecutionId, triggerType, and inputMapping', async () => {
      prisma.workflowExecution.findUnique
        .mockResolvedValueOnce({ id: PARENT_EXEC, workflow: { userId: 'user-a' } })
        .mockResolvedValueOnce({ status: 'SUCCESS', error: null });
      prisma.workflow.findFirst.mockResolvedValue({ id: TARGET_WF });
      prisma.workflowExecution.create.mockResolvedValue({ id: 'child-1' });
      prisma.executionStep.findFirst.mockResolvedValue(null);

      await action.execute(baseInput, makeContext());

      expect(prisma.workflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workflowId: TARGET_WF,
            parentExecutionId: PARENT_EXEC,
            status: 'PENDING',
            triggerType: 'subworkflow',
            triggerData: { item: 'a', n: 1 },
          }),
        }),
      );
    });

    it('should invoke EngineService.execute with depth+1 for the child execution', async () => {
      prisma.workflowExecution.findUnique
        .mockResolvedValueOnce({ id: PARENT_EXEC, workflow: { userId: 'user-a' } })
        .mockResolvedValueOnce({ status: 'SUCCESS', error: null });
      prisma.workflow.findFirst.mockResolvedValue({ id: TARGET_WF });
      prisma.workflowExecution.create.mockResolvedValue({ id: 'child-1' });
      prisma.executionStep.findFirst.mockResolvedValue(null);

      await action.execute(baseInput, makeContext({ depth: 2 }));

      expect(engine.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          executionId: 'child-1',
          workflowId: TARGET_WF,
          parentExecutionId: PARENT_EXEC,
          depth: 3,
          triggerData: { item: 'a', n: 1 },
        }),
      );
    });

    it('should forward the child return-node output as the subworkflow output', async () => {
      prisma.workflowExecution.findUnique
        .mockResolvedValueOnce({ id: PARENT_EXEC, workflow: { userId: 'user-a' } })
        .mockResolvedValueOnce({ status: 'SUCCESS', error: null });
      prisma.workflow.findFirst.mockResolvedValue({ id: TARGET_WF });
      prisma.workflowExecution.create.mockResolvedValue({ id: 'child-1' });
      prisma.executionStep.findFirst.mockResolvedValueOnce({
        outputData: { value: { processed: true, n: 42 } },
      });

      const out = await action.execute(baseInput, makeContext());

      expect(out.data).toEqual({ processed: true, n: 42 });
      // Should NOT call the fallback findFirst for any-success-step.
      expect(prisma.executionStep.findFirst).toHaveBeenCalledTimes(1);
    });

    it('should fall back to the latest SUCCESS step when the child has no return node', async () => {
      prisma.workflowExecution.findUnique
        .mockResolvedValueOnce({ id: PARENT_EXEC, workflow: { userId: 'user-a' } })
        .mockResolvedValueOnce({ status: 'SUCCESS', error: null });
      prisma.workflow.findFirst.mockResolvedValue({ id: TARGET_WF });
      prisma.workflowExecution.create.mockResolvedValue({ id: 'child-1' });
      prisma.executionStep.findFirst
        .mockResolvedValueOnce(null) // no return node
        .mockResolvedValueOnce({ outputData: { ok: 'fallback' } }); // latest success

      const out = await action.execute(baseInput, makeContext());

      expect(out.data).toEqual({ ok: 'fallback' });
    });

    it('should wrap a non-object return value as { value }', async () => {
      prisma.workflowExecution.findUnique
        .mockResolvedValueOnce({ id: PARENT_EXEC, workflow: { userId: 'user-a' } })
        .mockResolvedValueOnce({ status: 'SUCCESS', error: null });
      prisma.workflow.findFirst.mockResolvedValue({ id: TARGET_WF });
      prisma.workflowExecution.create.mockResolvedValue({ id: 'child-1' });
      prisma.executionStep.findFirst.mockResolvedValueOnce({
        outputData: { value: 'just-a-string' },
      });

      const out = await action.execute(baseInput, makeContext());

      expect(out.data).toEqual({ value: 'just-a-string' });
    });

    it('should throw SubworkflowFailedError when the child execution did not succeed', async () => {
      prisma.workflowExecution.findUnique
        .mockResolvedValueOnce({ id: PARENT_EXEC, workflow: { userId: 'user-a' } })
        .mockResolvedValueOnce({ status: 'FAILED', error: 'inner blew up' });
      prisma.workflow.findFirst.mockResolvedValue({ id: TARGET_WF });
      prisma.workflowExecution.create.mockResolvedValue({ id: 'child-1' });

      await expect(action.execute(baseInput, makeContext())).rejects.toThrow(
        SubworkflowFailedError,
      );
    });
  });
});
