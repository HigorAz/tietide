import { Test, type TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException } from '@nestjs/common';
import type { WorkflowDefinition } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CRON_QUEUE_NAME } from './cron.constants';
import { CronTriggerService } from './cron-trigger.service';

interface QueueMock {
  upsertJobScheduler: jest.Mock;
  removeJobScheduler: jest.Mock;
  getJobSchedulers: jest.Mock;
}

interface PrismaMock {
  workflow: { findMany: jest.Mock };
}

const cronWorkflow = (overrides: {
  id: string;
  userId?: string;
  isActive?: boolean;
  expression?: string;
  type?: string;
}) => {
  const definition: WorkflowDefinition = {
    nodes: [
      {
        id: 'trigger-1',
        type: overrides.type ?? 'cron-trigger',
        name: 'Cron',
        position: { x: 0, y: 0 },
        config: { expression: overrides.expression ?? '*/5 * * * *' },
      },
    ],
    edges: [],
  };
  return {
    id: overrides.id,
    userId: overrides.userId ?? 'user-1',
    isActive: overrides.isActive ?? true,
    definition,
  };
};

describe('CronTriggerService', () => {
  let service: CronTriggerService;
  let queue: QueueMock;
  let prisma: PrismaMock;

  beforeEach(async () => {
    queue = {
      upsertJobScheduler: jest.fn(async () => ({})),
      removeJobScheduler: jest.fn(async () => true),
      getJobSchedulers: jest.fn(async () => []),
    };
    prisma = { workflow: { findMany: jest.fn(async () => []) } };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        CronTriggerService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(CRON_QUEUE_NAME), useValue: queue },
      ],
    }).compile();

    service = mod.get(CronTriggerService);
  });

  describe('addRepeatableJob', () => {
    it('should upsert a job scheduler with the workflow-scoped scheduler id', async () => {
      await service.addRepeatableJob({
        workflowId: 'wf-1',
        expression: '*/5 * * * *',
        userId: 'user-1',
      });

      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
      const [schedulerId, repeatOpts, template] = queue.upsertJobScheduler.mock.calls[0];
      expect(schedulerId).toBe('cron:wf-1');
      expect(repeatOpts).toEqual(expect.objectContaining({ pattern: '*/5 * * * *' }));
      expect(template).toEqual(
        expect.objectContaining({
          name: expect.any(String),
          data: expect.objectContaining({ workflowId: 'wf-1', userId: 'user-1' }),
        }),
      );
    });

    it('should reject an invalid cron expression before touching the queue', async () => {
      await expect(
        service.addRepeatableJob({
          workflowId: 'wf-1',
          expression: 'not-a-cron',
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    });

    it('should be idempotent when called twice with the same args', async () => {
      const args = {
        workflowId: 'wf-1',
        expression: '*/5 * * * *',
        userId: 'user-1',
      };

      await service.addRepeatableJob(args);
      await service.addRepeatableJob(args);

      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
      const firstId = queue.upsertJobScheduler.mock.calls[0][0];
      const secondId = queue.upsertJobScheduler.mock.calls[1][0];
      expect(firstId).toBe(secondId);
    });
  });

  describe('removeRepeatableJob', () => {
    it('should remove the job scheduler keyed on the workflow id', async () => {
      await service.removeRepeatableJob('wf-1');

      expect(queue.removeJobScheduler).toHaveBeenCalledWith('cron:wf-1');
    });

    it('should not throw when the scheduler does not exist', async () => {
      queue.removeJobScheduler.mockResolvedValue(false);

      await expect(service.removeRepeatableJob('wf-missing')).resolves.toBeUndefined();
    });
  });

  describe('reconcile', () => {
    it('should add a repeatable for every active workflow with a cron trigger', async () => {
      prisma.workflow.findMany.mockResolvedValue([
        cronWorkflow({ id: 'wf-1', expression: '*/5 * * * *' }),
        cronWorkflow({ id: 'wf-2', expression: '0 9 * * *' }),
      ]);

      await service.reconcile();

      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
      const ids = queue.upsertJobScheduler.mock.calls.map((c) => c[0]).sort();
      expect(ids).toEqual(['cron:wf-1', 'cron:wf-2']);
    });

    it('should skip workflows whose first node is not a cron trigger', async () => {
      prisma.workflow.findMany.mockResolvedValue([
        cronWorkflow({ id: 'wf-cron' }),
        cronWorkflow({ id: 'wf-manual', type: 'manual-trigger' }),
      ]);

      await service.reconcile();

      const ids = queue.upsertJobScheduler.mock.calls.map((c) => c[0]);
      expect(ids).toEqual(['cron:wf-cron']);
    });

    it('should remove orphaned schedulers that no longer match any active cron workflow', async () => {
      prisma.workflow.findMany.mockResolvedValue([cronWorkflow({ id: 'wf-1' })]);
      queue.getJobSchedulers.mockResolvedValue([{ key: 'cron:wf-1' }, { key: 'cron:wf-stale' }]);

      await service.reconcile();

      expect(queue.removeJobScheduler).toHaveBeenCalledWith('cron:wf-stale');
      expect(queue.removeJobScheduler).not.toHaveBeenCalledWith('cron:wf-1');
    });

    it('should be safe to run multiple times without creating duplicates', async () => {
      prisma.workflow.findMany.mockResolvedValue([cronWorkflow({ id: 'wf-1' })]);

      await service.reconcile();
      await service.reconcile();

      const calls = queue.upsertJobScheduler.mock.calls.filter((c) => c[0] === 'cron:wf-1');
      expect(calls).toHaveLength(2);
      expect(calls[0][0]).toBe(calls[1][0]);
    });

    it('should ignore workflows with invalid cron expressions instead of crashing reconcile', async () => {
      prisma.workflow.findMany.mockResolvedValue([
        cronWorkflow({ id: 'wf-good', expression: '*/5 * * * *' }),
        cronWorkflow({ id: 'wf-bad', expression: 'not-a-cron' }),
      ]);

      await expect(service.reconcile()).resolves.toBeUndefined();

      const ids = queue.upsertJobScheduler.mock.calls.map((c) => c[0]);
      expect(ids).toEqual(['cron:wf-good']);
    });
  });

  describe('onModuleInit', () => {
    it('should run reconcile on startup', async () => {
      const reconcileSpy = jest.spyOn(service, 'reconcile').mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(reconcileSpy).toHaveBeenCalledTimes(1);
    });
  });
});
