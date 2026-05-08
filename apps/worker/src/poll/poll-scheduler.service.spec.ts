import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PollTriggerRegistry } from './poll-trigger.registry';
import { POLL_QUEUE_NAME, POLL_SCHEDULER_PREFIX } from './poll.constants';
import { PollSchedulerService } from './poll-scheduler.service';

interface QueueMock {
  upsertJobScheduler: jest.Mock;
  removeJobScheduler: jest.Mock;
  getJobSchedulers: jest.Mock;
}
interface PrismaMock {
  workflow: { findMany: jest.Mock };
}

describe('PollSchedulerService', () => {
  let service: PollSchedulerService;
  let queue: QueueMock;
  let prisma: PrismaMock;
  let registry: PollTriggerRegistry;

  beforeEach(async () => {
    queue = {
      upsertJobScheduler: jest.fn(async () => undefined),
      removeJobScheduler: jest.fn(async () => undefined),
      getJobSchedulers: jest.fn(async () => []),
    };
    prisma = { workflow: { findMany: jest.fn(async () => []) } };
    registry = new PollTriggerRegistry();
    registry.register('sheets-row-added', { defaultIntervalSeconds: 300 } as never);

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        PollSchedulerService,
        { provide: PrismaService, useValue: prisma },
        { provide: PollTriggerRegistry, useValue: registry },
        { provide: getQueueToken(POLL_QUEUE_NAME), useValue: queue },
      ],
    }).compile();

    service = mod.get(PollSchedulerService);
  });

  describe('reconcile', () => {
    it('upserts a scheduler per active workflow with a poll trigger node', async () => {
      prisma.workflow.findMany.mockResolvedValueOnce([
        {
          id: 'wf-1',
          userId: 'u1',
          isActive: true,
          definition: {
            nodes: [
              {
                id: 'trigger-1',
                type: 'sheets-row-added',
                config: { connectionId: 'conn-1' },
              },
            ],
            edges: [],
          },
        },
      ]);

      await service.reconcile();

      expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
        `${POLL_SCHEDULER_PREFIX}wf-1:trigger-1`,
        expect.objectContaining({ every: 300 * 1000 }),
        expect.objectContaining({
          name: 'poll-tick',
          data: expect.objectContaining({
            workflowId: 'wf-1',
            nodeId: 'trigger-1',
            type: 'sheets-row-added',
            userId: 'u1',
          }),
        }),
      );
    });

    it('honors a per-node config.intervalSeconds override', async () => {
      prisma.workflow.findMany.mockResolvedValueOnce([
        {
          id: 'wf-1',
          userId: 'u1',
          isActive: true,
          definition: {
            nodes: [
              {
                id: 'trigger-1',
                type: 'sheets-row-added',
                config: { connectionId: 'conn-1', intervalSeconds: 60 },
              },
            ],
            edges: [],
          },
        },
      ]);

      await service.reconcile();

      expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ every: 60 * 1000 }),
        expect.any(Object),
      );
    });

    it('removes orphaned schedulers whose workflow is no longer active', async () => {
      prisma.workflow.findMany.mockResolvedValueOnce([]);
      queue.getJobSchedulers.mockResolvedValueOnce([
        { key: `${POLL_SCHEDULER_PREFIX}wf-orphan:trigger-1` },
        { key: 'cron:wf-other' },
      ]);

      await service.reconcile();

      expect(queue.removeJobScheduler).toHaveBeenCalledWith(
        `${POLL_SCHEDULER_PREFIX}wf-orphan:trigger-1`,
      );
      expect(queue.removeJobScheduler).not.toHaveBeenCalledWith('cron:wf-other');
    });

    it('skips workflows whose first node is not a registered poll trigger', async () => {
      prisma.workflow.findMany.mockResolvedValueOnce([
        {
          id: 'wf-1',
          userId: 'u1',
          isActive: true,
          definition: {
            nodes: [
              { id: 'manual', type: 'manual-trigger', config: {} },
              { id: 'log', type: 'log-data', config: {} },
            ],
            edges: [],
          },
        },
      ]);

      await service.reconcile();
      expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    });
  });
});
