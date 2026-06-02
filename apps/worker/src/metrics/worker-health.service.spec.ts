import type { Queue } from 'bullmq';
import type { PrismaService } from '../prisma/prisma.service';
import { WorkerHealthService } from './worker-health.service';

function makeService(opts: { query?: jest.Mock; ping?: jest.Mock }): WorkerHealthService {
  const prisma = { $queryRaw: opts.query ?? jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
  const queue = {
    client: Promise.resolve({ ping: opts.ping ?? jest.fn().mockResolvedValue('PONG') }),
  };
  return new WorkerHealthService(prisma as unknown as PrismaService, queue as unknown as Queue);
}

describe('WorkerHealthService.readiness', () => {
  it('is ok when both DB and Redis respond', async () => {
    const result = await makeService({}).readiness();
    expect(result).toEqual({ ok: true, checks: { db: true, redis: true } });
  });

  it('reports db:false when the DB query throws', async () => {
    const result = await makeService({
      query: jest.fn().mockRejectedValue(new Error('no db')),
    }).readiness();
    expect(result.ok).toBe(false);
    expect(result.checks.db).toBe(false);
    expect(result.checks.redis).toBe(true);
  });

  it('reports redis:false when ping does not return PONG', async () => {
    const result = await makeService({
      ping: jest.fn().mockResolvedValue('weird'),
    }).readiness();
    expect(result.ok).toBe(false);
    expect(result.checks.redis).toBe(false);
  });

  it('reports redis:false when the client throws', async () => {
    const result = await makeService({
      ping: jest.fn().mockRejectedValue(new Error('conn refused')),
    }).readiness();
    expect(result.checks.redis).toBe(false);
  });
});
