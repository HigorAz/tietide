import { Test, type TestingModule } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import type { WorkflowDefinition } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEventsService } from '../events/execution-events.service';
import { EngineService } from './engine.service';
import { WorkflowRunner, type RunArgs, type RunResult } from './workflow-runner';

interface PrismaMock {
  workflow: { findUnique: jest.Mock };
  workflowExecution: { update: jest.Mock };
}

interface RunnerMock {
  run: jest.Mock;
}

interface EventsMock {
  publishExecutionCompleted: jest.Mock;
}

type _RunnerRef = Pick<WorkflowRunner, 'run'>;
type _Args = RunArgs;
type _Result = RunResult;

const stubDefinition: WorkflowDefinition = {
  nodes: [{ id: 'A', type: 'stub', name: 'A', position: { x: 0, y: 0 }, config: {} }],
  edges: [],
};

describe('EngineService', () => {
  let engine: EngineService;
  let prisma: PrismaMock;
  let runner: RunnerMock;
  let events: EventsMock;

  beforeEach(async () => {
    prisma = {
      workflow: { findUnique: jest.fn() },
      workflowExecution: { update: jest.fn(async () => ({})) },
    };
    runner = {
      run: jest.fn<Promise<RunResult>, [RunArgs]>(async () => ({ status: 'SUCCESS' })),
    };
    events = {
      publishExecutionCompleted: jest.fn(async () => undefined),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        EngineService,
        { provide: PrismaService, useValue: prisma },
        { provide: WorkflowRunner, useValue: runner },
        { provide: Logger, useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn() } },
        { provide: ExecutionEventsService, useValue: events },
      ],
    }).compile();

    engine = mod.get(EngineService);
  });

  describe('execute', () => {
    it('should load workflow definition from Prisma by workflowId', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: 'wf-1', definition: stubDefinition });

      await engine.execute({ executionId: 'exec-1', workflowId: 'wf-1', triggerType: 'manual' });

      expect(prisma.workflow.findUnique).toHaveBeenCalledWith({
        where: { id: 'wf-1' },
        select: { id: true, definition: true },
      });
    });

    it('should transition execution PENDING -> RUNNING -> SUCCESS with timestamps', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: 'wf-1', definition: stubDefinition });
      runner.run.mockResolvedValue({ status: 'SUCCESS' });

      await engine.execute({ executionId: 'exec-1', workflowId: 'wf-1', triggerType: 'manual' });

      const calls = prisma.workflowExecution.update.mock.calls.map((c) => c[0]);
      expect(calls[0]).toEqual(
        expect.objectContaining({
          where: { id: 'exec-1' },
          data: expect.objectContaining({ status: 'RUNNING', startedAt: expect.any(Date) }),
        }),
      );
      expect(calls[1]).toEqual(
        expect.objectContaining({
          where: { id: 'exec-1' },
          data: expect.objectContaining({ status: 'SUCCESS', finishedAt: expect.any(Date) }),
        }),
      );
    });

    it('should mark execution FAILED with error when runner reports failure', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: 'wf-1', definition: stubDefinition });
      runner.run.mockResolvedValue({
        status: 'FAILED',
        error: 'node B exploded',
        failedNodeId: 'B',
      });

      await engine.execute({ executionId: 'exec-1', workflowId: 'wf-1', triggerType: 'manual' });

      const lastCall = prisma.workflowExecution.update.mock.calls.pop();
      expect(lastCall![0]).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            error: 'node B exploded',
            finishedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should mark execution FAILED when workflow not found', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await engine.execute({ executionId: 'exec-1', workflowId: 'missing', triggerType: 'manual' });

      expect(runner.run).not.toHaveBeenCalled();
      const lastCall = prisma.workflowExecution.update.mock.calls.pop();
      expect(lastCall![0].data.status).toBe('FAILED');
      expect(lastCall![0].data.error).toMatch(/not found/i);
    });

    it('should mark execution FAILED when runner throws unexpectedly', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: 'wf-1', definition: stubDefinition });
      runner.run.mockRejectedValue(new Error('unexpected'));

      await engine.execute({ executionId: 'exec-1', workflowId: 'wf-1', triggerType: 'manual' });

      const lastCall = prisma.workflowExecution.update.mock.calls.pop();
      expect(lastCall![0].data.status).toBe('FAILED');
      expect(lastCall![0].data.error).toContain('unexpected');
    });

    it('should forward requestId from job payload into runner.run for child-logger binding', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: 'wf-1', definition: stubDefinition });
      runner.run.mockResolvedValue({ status: 'SUCCESS' });

      await engine.execute({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        triggerType: 'manual',
        requestId: 'req-trace-001',
      });

      expect(runner.run).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'req-trace-001' }),
      );
    });

    it('should pass triggerData as initial input to the runner', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: 'wf-1', definition: stubDefinition });
      runner.run.mockResolvedValue({ status: 'SUCCESS' });

      await engine.execute({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        triggerType: 'manual',
        triggerData: { foo: 'bar' },
      });

      expect(runner.run).toHaveBeenCalledWith(
        expect.objectContaining({
          executionId: 'exec-1',
          workflowId: 'wf-1',
          definition: stubDefinition,
          triggerData: { foo: 'bar' },
        }),
      );
    });

    it('should default error to "Unknown failure" when runner returns FAILED with no error', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: 'wf-1', definition: stubDefinition });
      runner.run.mockResolvedValue({ status: 'FAILED' });

      await engine.execute({ executionId: 'exec-1', workflowId: 'wf-1', triggerType: 'manual' });

      const lastCall = prisma.workflowExecution.update.mock.calls.pop();
      expect(lastCall![0].data.status).toBe('FAILED');
      expect(lastCall![0].data.error).toBe('Unknown failure');
    });

    it('should set finishedAt on both success and failure paths', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: 'wf-1', definition: stubDefinition });
      runner.run.mockResolvedValue({ status: 'FAILED', error: 'boom' });

      await engine.execute({ executionId: 'exec-1', workflowId: 'wf-1', triggerType: 'manual' });

      const finalCall = prisma.workflowExecution.update.mock.calls.pop();
      expect(finalCall![0].data.finishedAt).toBeInstanceOf(Date);
    });

    describe('execution.completed events', () => {
      it('should publish execution.completed with SUCCESS exactly once on success path', async () => {
        prisma.workflow.findUnique.mockResolvedValue({ id: 'wf-1', definition: stubDefinition });
        runner.run.mockResolvedValue({ status: 'SUCCESS' });

        await engine.execute({ executionId: 'exec-1', workflowId: 'wf-1', triggerType: 'manual' });

        expect(events.publishExecutionCompleted).toHaveBeenCalledTimes(1);
        const args = events.publishExecutionCompleted.mock.calls[0][0];
        expect(args.executionId).toBe('exec-1');
        expect(args.status).toBe('SUCCESS');
        expect(args.finishedAt).toBeInstanceOf(Date);
        expect(args.error).toBeUndefined();
      });

      it('should publish execution.completed with FAILED + error when runner reports failure', async () => {
        prisma.workflow.findUnique.mockResolvedValue({ id: 'wf-1', definition: stubDefinition });
        runner.run.mockResolvedValue({ status: 'FAILED', error: 'node B exploded' });

        await engine.execute({ executionId: 'exec-1', workflowId: 'wf-1', triggerType: 'manual' });

        expect(events.publishExecutionCompleted).toHaveBeenCalledTimes(1);
        const args = events.publishExecutionCompleted.mock.calls[0][0];
        expect(args.status).toBe('FAILED');
        expect(args.error).toEqual({ message: 'node B exploded' });
      });

      it('should publish execution.completed with FAILED when workflow not found', async () => {
        prisma.workflow.findUnique.mockResolvedValue(null);

        await engine.execute({
          executionId: 'exec-1',
          workflowId: 'missing',
          triggerType: 'manual',
        });

        expect(events.publishExecutionCompleted).toHaveBeenCalledTimes(1);
        const args = events.publishExecutionCompleted.mock.calls[0][0];
        expect(args.status).toBe('FAILED');
        expect(args.error?.message).toMatch(/not found/i);
      });

      it('should publish execution.completed with FAILED when runner crashes', async () => {
        prisma.workflow.findUnique.mockResolvedValue({ id: 'wf-1', definition: stubDefinition });
        runner.run.mockRejectedValue(new Error('unexpected'));

        await engine.execute({ executionId: 'exec-1', workflowId: 'wf-1', triggerType: 'manual' });

        expect(events.publishExecutionCompleted).toHaveBeenCalledTimes(1);
        const args = events.publishExecutionCompleted.mock.calls[0][0];
        expect(args.status).toBe('FAILED');
        expect(args.error?.message).toContain('unexpected');
      });
    });

    // W1.8: a retryable failure on a top-level BullMQ job must be surfaced (thrown)
    // so BullMQ retries it; the row is left RUNNING until retries are exhausted
    // (the processor marks it FAILED then). Non-retryable, dry-run, and child
    // (no attemptsAllowed) failures keep the original mark-FAILED-and-return path.
    describe('retry surfacing (W1.8)', () => {
      const retryableFailure = {
        status: 'FAILED' as const,
        error: 'node B exploded',
        retryable: true,
      };

      it('throws and leaves the execution RUNNING for a retryable top-level failure', async () => {
        prisma.workflow.findUnique.mockResolvedValue({ id: 'wf-1', definition: stubDefinition });
        runner.run.mockResolvedValue(retryableFailure);

        await expect(
          engine.execute({
            executionId: 'exec-1',
            workflowId: 'wf-1',
            triggerType: 'manual',
            attemptsAllowed: 3,
          }),
        ).rejects.toThrow('node B exploded');

        // No update marked the row FAILED, and no terminal event was published —
        // the row stays RUNNING so the retry can resume it.
        const failedUpdate = prisma.workflowExecution.update.mock.calls.find(
          (c) => c[0]?.data?.status === 'FAILED',
        );
        expect(failedUpdate).toBeUndefined();
        expect(events.publishExecutionCompleted).not.toHaveBeenCalled();
      });

      it('marks FAILED without throwing for a non-retryable (structural) failure', async () => {
        prisma.workflow.findUnique.mockResolvedValue({ id: 'wf-1', definition: stubDefinition });
        runner.run.mockResolvedValue({
          status: 'FAILED',
          error: 'cycle detected',
          retryable: false,
        });

        await engine.execute({
          executionId: 'exec-1',
          workflowId: 'wf-1',
          triggerType: 'manual',
          attemptsAllowed: 3,
        });

        const lastCall = prisma.workflowExecution.update.mock.calls.pop();
        expect(lastCall![0].data.status).toBe('FAILED');
        expect(events.publishExecutionCompleted).toHaveBeenCalledTimes(1);
      });

      it('marks FAILED without throwing for a child execution (no attemptsAllowed)', async () => {
        prisma.workflow.findUnique.mockResolvedValue({ id: 'wf-1', definition: stubDefinition });
        runner.run.mockResolvedValue(retryableFailure);

        await engine.execute({
          executionId: 'exec-1',
          workflowId: 'wf-1',
          triggerType: 'iterator',
        });

        const lastCall = prisma.workflowExecution.update.mock.calls.pop();
        expect(lastCall![0].data.status).toBe('FAILED');
      });

      it('does not retry a dry-run failure even when retryable', async () => {
        prisma.workflow.findUnique.mockResolvedValue({ id: 'wf-1', definition: stubDefinition });
        runner.run.mockResolvedValue(retryableFailure);

        await engine.execute({
          executionId: 'exec-1',
          workflowId: 'wf-1',
          triggerType: 'test',
          isDryRun: true,
          attemptsAllowed: 3,
        });

        const lastCall = prisma.workflowExecution.update.mock.calls.pop();
        expect(lastCall![0].data.status).toBe('FAILED');
      });

      it('throws for an unexpected runner crash on a top-level job', async () => {
        prisma.workflow.findUnique.mockResolvedValue({ id: 'wf-1', definition: stubDefinition });
        runner.run.mockRejectedValue(new Error('db blip'));

        await expect(
          engine.execute({
            executionId: 'exec-1',
            workflowId: 'wf-1',
            triggerType: 'manual',
            attemptsAllowed: 3,
          }),
        ).rejects.toThrow('db blip');
      });

      it('failExecution marks the row FAILED and publishes the terminal event', async () => {
        await engine.failExecution('exec-1', 'exhausted');

        const lastCall = prisma.workflowExecution.update.mock.calls.pop();
        expect(lastCall![0]).toEqual(
          expect.objectContaining({
            where: { id: 'exec-1' },
            data: expect.objectContaining({ status: 'FAILED', error: 'exhausted' }),
          }),
        );
        expect(events.publishExecutionCompleted).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'FAILED', error: { message: 'exhausted' } }),
        );
      });
    });

    describe('dry-run mode', () => {
      const overrideDefinition: WorkflowDefinition = {
        nodes: [{ id: 'X', type: 'stub', name: 'X', position: { x: 0, y: 0 }, config: {} }],
        edges: [],
      };

      it('should run definitionOverride instead of the saved workflow definition when provided', async () => {
        prisma.workflow.findUnique.mockResolvedValue({ id: 'wf-1', definition: stubDefinition });
        runner.run.mockResolvedValue({ status: 'SUCCESS' });

        await engine.execute({
          executionId: 'exec-1',
          workflowId: 'wf-1',
          triggerType: 'test',
          isDryRun: true,
          definitionOverride: overrideDefinition,
        });

        expect(runner.run).toHaveBeenCalledWith(
          expect.objectContaining({
            definition: overrideDefinition,
            isDryRun: true,
          }),
        );
      });

      it('should pass isDryRun=true into runner.run when payload sets the flag', async () => {
        prisma.workflow.findUnique.mockResolvedValue({ id: 'wf-1', definition: stubDefinition });
        runner.run.mockResolvedValue({ status: 'SUCCESS' });

        await engine.execute({
          executionId: 'exec-1',
          workflowId: 'wf-1',
          triggerType: 'test',
          isDryRun: true,
        });

        expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({ isDryRun: true }));
      });

      it('should default isDryRun to false on the runner when payload omits the flag', async () => {
        prisma.workflow.findUnique.mockResolvedValue({ id: 'wf-1', definition: stubDefinition });
        runner.run.mockResolvedValue({ status: 'SUCCESS' });

        await engine.execute({ executionId: 'exec-1', workflowId: 'wf-1', triggerType: 'manual' });

        expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({ isDryRun: false }));
      });

      it('should still mark execution FAILED when workflow row missing even if override is provided', async () => {
        // Workflow row is the source of truth for ownership; override does not bypass it.
        prisma.workflow.findUnique.mockResolvedValue(null);

        await engine.execute({
          executionId: 'exec-1',
          workflowId: 'missing',
          triggerType: 'test',
          isDryRun: true,
          definitionOverride: overrideDefinition,
        });

        expect(runner.run).not.toHaveBeenCalled();
        const lastCall = prisma.workflowExecution.update.mock.calls.pop();
        expect(lastCall![0].data.status).toBe('FAILED');
      });
    });
  });
});
