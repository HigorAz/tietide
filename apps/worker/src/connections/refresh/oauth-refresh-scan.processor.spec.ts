import type { Job, Queue } from 'bullmq';
import type { PrismaService } from '../../prisma/prisma.service';
import { OAuthRefreshScanProcessor } from './oauth-refresh-scan.processor';
import {
  OAUTH_REFRESH_ONE_JOB,
  OAUTH_REFRESH_SCAN_JOB,
  REFRESH_LEAD_TIME_MS,
} from './oauth-refresh.constants';

describe('OAuthRefreshScanProcessor', () => {
  let prisma: { connection: { findMany: jest.Mock } };
  let queue: { add: jest.Mock };
  let processor: OAuthRefreshScanProcessor;

  beforeEach(() => {
    prisma = { connection: { findMany: jest.fn() } };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    processor = new OAuthRefreshScanProcessor(
      prisma as unknown as PrismaService,
      queue as unknown as Queue,
    );
  });

  function makeJob(name: string): Job {
    return { name, data: {} } as unknown as Job;
  }

  it('selects only ACTIVE connections with a refresh token expiring within the lead window', async () => {
    prisma.connection.findMany.mockResolvedValue([]);

    await processor.process(makeJob(OAUTH_REFRESH_SCAN_JOB));

    const call = prisma.connection.findMany.mock.calls[0][0];
    expect(call.where.status).toBe('ACTIVE');
    expect(call.where.refreshTokenEncrypted).toEqual({ not: null });
    expect(call.where.expiresAt.lt).toBeInstanceOf(Date);

    const cutoff = call.where.expiresAt.lt as Date;
    const delta = cutoff.getTime() - Date.now();
    expect(delta).toBeGreaterThan(REFRESH_LEAD_TIME_MS - 5000);
    expect(delta).toBeLessThan(REFRESH_LEAD_TIME_MS + 5000);
  });

  it('enqueues one refresh-one job per row with deterministic jobId', async () => {
    prisma.connection.findMany.mockResolvedValue([
      { id: 'c1', provider: 'google' },
      { id: 'c2', provider: 'microsoft' },
    ]);

    const result = await processor.process(makeJob(OAUTH_REFRESH_SCAN_JOB));

    expect(result).toEqual({ scheduled: 2 });
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(
      OAUTH_REFRESH_ONE_JOB,
      { connectionId: 'c1', provider: 'google' },
      expect.objectContaining({ jobId: 'refresh-c1', attempts: 3 }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      OAUTH_REFRESH_ONE_JOB,
      { connectionId: 'c2', provider: 'microsoft' },
      expect.objectContaining({ jobId: 'refresh-c2', attempts: 3 }),
    );
  });

  it('ignores jobs that are not the scan job', async () => {
    const result = await processor.process(makeJob('something-else'));
    expect(result).toEqual({ scheduled: 0 });
    expect(prisma.connection.findMany).not.toHaveBeenCalled();
  });
});
