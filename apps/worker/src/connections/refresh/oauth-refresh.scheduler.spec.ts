import type { Queue } from 'bullmq';
import { OAuthRefreshScheduler } from './oauth-refresh.scheduler';
import {
  OAUTH_REFRESH_SCAN_JOB,
  OAUTH_REFRESH_SCHEDULER_KEY,
  SCAN_INTERVAL_PATTERN,
} from './oauth-refresh.constants';

describe('OAuthRefreshScheduler', () => {
  it('registers a 5-minute scheduled scan job on module init', async () => {
    const queue = {
      upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
    } as unknown as Queue;

    const scheduler = new OAuthRefreshScheduler(queue);
    await scheduler.onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      OAUTH_REFRESH_SCHEDULER_KEY,
      { pattern: SCAN_INTERVAL_PATTERN },
      expect.objectContaining({
        name: OAUTH_REFRESH_SCAN_JOB,
        opts: expect.objectContaining({
          removeOnComplete: expect.any(Object),
          removeOnFail: expect.any(Object),
        }),
      }),
    );
  });
});
