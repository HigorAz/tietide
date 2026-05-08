import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PollTriggerRegistry } from './poll-trigger.registry';
import { PollConnectionLoader } from './poll-connection-loader';
import { PollProcessor } from './poll-processor';
import type { PollFirePayload } from './poll-scheduler.service';

interface PrismaMock {
  workflow: { findUnique: jest.Mock };
  connection: { findFirst: jest.Mock };
  triggerCursor: { findUnique: jest.Mock; upsert: jest.Mock };
  workflowExecution: { create: jest.Mock; findFirst: jest.Mock };
}

const EXECUTION_QUEUE_NAME = 'workflow-execution';

describe('PollProcessor', () => {
  let processor: PollProcessor;
  let prisma: PrismaMock;
  let executionQueue: { add: jest.Mock };
  let registry: PollTriggerRegistry;
  let trigger: { defaultIntervalSeconds: number; poll: jest.Mock; type: string };
  let loader: { load: jest.Mock };

  const userId = 'user-1';
  const workflowId = 'wf-1';
  const nodeId = 'trigger-1';
  const triggerType = 'sheets-row-added';

  function makeJob(): Job<PollFirePayload> {
    return {
      id: 'job-1',
      data: { workflowId, userId, nodeId, type: triggerType },
    } as unknown as Job<PollFirePayload>;
  }

  beforeEach(async () => {
    trigger = {
      defaultIntervalSeconds: 300,
      poll: jest.fn(),
      type: triggerType,
    };
    registry = new PollTriggerRegistry();
    registry.register(triggerType, trigger as never);

    prisma = {
      workflow: {
        findUnique: jest.fn(async () => ({
          id: workflowId,
          userId,
          isActive: true,
          definition: {
            nodes: [
              {
                id: nodeId,
                type: triggerType,
                config: { connectionId: 'conn-1' },
              },
            ],
            edges: [],
          },
        })),
      },
      connection: { findFirst: jest.fn() },
      triggerCursor: {
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(async () => undefined),
      },
      workflowExecution: {
        create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
          id: `exec-${Math.random()}`,
          ...args.data,
        })),
        findFirst: jest.fn(async () => null),
      },
    };
    executionQueue = { add: jest.fn(async () => undefined) };
    loader = {
      load: jest.fn(async () => ({
        id: 'conn-1',
        type: 'OAUTH2',
        provider: 'google',
        config: { accessToken: 'tok' },
      })),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        PollProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: PollTriggerRegistry, useValue: registry },
        { provide: PollConnectionLoader, useValue: loader },
        { provide: getQueueToken(EXECUTION_QUEUE_NAME), useValue: executionQueue },
      ],
    }).compile();

    processor = mod.get(PollProcessor);
  });

  it('emits one execution per item and persists the new cursor', async () => {
    trigger.poll.mockResolvedValueOnce({
      items: [{ row: 11 }, { row: 12 }, { row: 13 }],
      newCursor: '13',
    });

    await processor.process(makeJob());

    expect(loader.load).toHaveBeenCalledWith(userId, 'conn-1');
    expect(trigger.poll).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId,
        nodeId,
        cursor: null,
      }),
    );
    expect(prisma.workflowExecution.create).toHaveBeenCalledTimes(3);
    expect(executionQueue.add).toHaveBeenCalledTimes(3);
    expect(prisma.triggerCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workflowId_nodeId: { workflowId, nodeId } },
        update: expect.objectContaining({ cursor: '13' }),
        create: expect.objectContaining({ cursor: '13' }),
      }),
    );
  });

  it('reads existing cursor on subsequent ticks', async () => {
    prisma.triggerCursor.findUnique.mockResolvedValueOnce({
      workflowId,
      nodeId,
      cursor: '10',
    });
    trigger.poll.mockResolvedValueOnce({ items: [], newCursor: '10' });

    await processor.process(makeJob());

    expect(trigger.poll).toHaveBeenCalledWith(expect.objectContaining({ cursor: '10' }));
  });

  it('does not enqueue duplicates when idempotency key collides', async () => {
    trigger.poll.mockResolvedValueOnce({
      items: [{ row: 11 }],
      newCursor: '11',
    });
    prisma.workflowExecution.findFirst.mockResolvedValueOnce({ id: 'existing-exec' });

    await processor.process(makeJob());

    expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
    expect(executionQueue.add).not.toHaveBeenCalled();
  });

  it('skips when workflow is inactive', async () => {
    prisma.workflow.findUnique.mockResolvedValueOnce({
      id: workflowId,
      userId,
      isActive: false,
      definition: { nodes: [], edges: [] },
    });

    await processor.process(makeJob());

    expect(trigger.poll).not.toHaveBeenCalled();
  });

  it('skips when the trigger type is not registered', async () => {
    const unknownJob = {
      data: { workflowId, userId, nodeId, type: 'unknown-poll' },
    } as Job<PollFirePayload>;

    await processor.process(unknownJob);
    expect(trigger.poll).not.toHaveBeenCalled();
  });

  it('skips when connection cannot be loaded', async () => {
    loader.load.mockResolvedValueOnce(null);

    await processor.process(makeJob());

    expect(trigger.poll).not.toHaveBeenCalled();
  });
});
