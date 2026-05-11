import type { Queue } from 'bullmq';
import { SubscriptionRenewerBootstrap } from './subscription-renewer-bootstrap.service';
import {
  RENEWAL_INTERVAL_MS,
  RENEWAL_JOB_NAME,
  RENEWAL_SCHEDULER_ID,
} from './subscription-renewer.constants';

const makeQueue = () =>
  ({
    upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<Queue>;

describe('SubscriptionRenewerBootstrap', () => {
  describe('onModuleInit', () => {
    it('should register the hourly renewal scheduler with the expected interval and job name', async () => {
      const queue = makeQueue();
      const bootstrap = new SubscriptionRenewerBootstrap(queue);

      await bootstrap.onModuleInit();

      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
      const [schedulerId, repeat, template] = (queue.upsertJobScheduler as jest.Mock).mock.calls[0];
      expect(schedulerId).toBe(RENEWAL_SCHEDULER_ID);
      expect(repeat).toEqual({ every: RENEWAL_INTERVAL_MS });
      expect(template).toMatchObject({
        name: RENEWAL_JOB_NAME,
        opts: expect.objectContaining({ attempts: 1 }),
      });
    });

    it('should be idempotent across restarts (upsertJobScheduler used, not add)', async () => {
      const queue = makeQueue();
      const bootstrap = new SubscriptionRenewerBootstrap(queue);

      await bootstrap.onModuleInit();
      await bootstrap.onModuleInit();

      // upsertJobScheduler is the BullMQ v5 dedup primitive (CLAUDE.md hurdle 25).
      // Calling it twice must not produce duplicate repeatables.
      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
      expect((queue as unknown as { add?: jest.Mock }).add).toBeUndefined();
    });

    it('should propagate queue errors so Nest aborts boot when Redis is unreachable', async () => {
      const queue = makeQueue();
      (queue.upsertJobScheduler as jest.Mock).mockRejectedValueOnce(
        new Error('redis connection refused'),
      );
      const bootstrap = new SubscriptionRenewerBootstrap(queue);

      await expect(bootstrap.onModuleInit()).rejects.toThrow(/redis connection refused/);
    });
  });
});
