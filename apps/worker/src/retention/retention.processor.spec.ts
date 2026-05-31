import type { Job } from 'bullmq';
import { RetentionProcessor } from './retention.processor';
import {
  RETENTION_BATCH_SIZE,
  RETENTION_SWEEP_JOB,
  RETENTION_TERMINAL_STATUSES,
} from './retention.constants';
import { DEFAULT_RETENTION_DAYS } from './retention.config';

describe('RetentionProcessor', () => {
  let prisma: {
    workflowExecution: { findMany: jest.Mock; deleteMany: jest.Mock };
  };
  let config: { get: jest.Mock };
  let processor: RetentionProcessor;

  const sweepJob = { name: RETENTION_SWEEP_JOB } as Job;

  beforeEach(() => {
    prisma = {
      workflowExecution: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    config = { get: jest.fn().mockReturnValue('30') };
    processor = new RetentionProcessor(prisma as never, config as never);
  });

  it('ignores jobs that are not the retention sweep', async () => {
    const result = await processor.process({ name: 'something-else' } as Job);
    expect(result).toEqual({ deleted: 0 });
    expect(prisma.workflowExecution.findMany).not.toHaveBeenCalled();
  });

  it('deletes only terminal executions older than the cutoff', async () => {
    prisma.workflowExecution.findMany.mockResolvedValueOnce([{ id: 'e1' }, { id: 'e2' }]);
    prisma.workflowExecution.deleteMany.mockResolvedValueOnce({ count: 2 });
    const before = Date.now();

    const result = await processor.process(sweepJob);

    expect(result).toEqual({ deleted: 2 });
    const where = prisma.workflowExecution.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: [...RETENTION_TERMINAL_STATUSES] });
    expect(where.createdAt.lt).toBeInstanceOf(Date);
    // 30-day cutoff ≈ now - 30d.
    const expected = before - 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs((where.createdAt.lt as Date).getTime() - expected)).toBeLessThan(5000);
    expect(prisma.workflowExecution.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['e1', 'e2'] } },
    });
  });

  it('uses the default window when EXECUTION_RETENTION_DAYS is unset', async () => {
    config.get.mockReturnValue(undefined);
    const before = Date.now();

    await processor.process(sweepJob);

    const lt = prisma.workflowExecution.findMany.mock.calls[0][0].where.createdAt.lt as Date;
    const expected = before - DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    expect(Math.abs(lt.getTime() - expected)).toBeLessThan(5000);
  });

  it('keeps batching while a full page is returned, then stops', async () => {
    const fullPage = Array.from({ length: RETENTION_BATCH_SIZE }, (_, i) => ({ id: `a${i}` }));
    prisma.workflowExecution.findMany
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce([{ id: 'tail' }]);
    prisma.workflowExecution.deleteMany
      .mockResolvedValueOnce({ count: RETENTION_BATCH_SIZE })
      .mockResolvedValueOnce({ count: 1 });

    const result = await processor.process(sweepJob);

    expect(prisma.workflowExecution.findMany).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ deleted: RETENTION_BATCH_SIZE + 1 });
  });

  it('returns deleted:0 and does not delete when nothing is old enough', async () => {
    const result = await processor.process(sweepJob);
    expect(result).toEqual({ deleted: 0 });
    expect(prisma.workflowExecution.deleteMany).not.toHaveBeenCalled();
  });
});
