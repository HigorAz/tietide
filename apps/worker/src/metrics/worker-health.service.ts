import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

export interface ReadinessResult {
  ok: boolean;
  checks: { db: boolean; redis: boolean };
}

/**
 * Liveness/readiness checks for the worker (W3.7). Liveness is implicit (the
 * process answering at all). Readiness pings the dependencies the worker needs
 * to make progress — Postgres and the Redis/Valkey BullMQ connection.
 */
@Injectable()
export class WorkerHealthService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('workflow-execution') private readonly queue: Queue,
  ) {}

  async readiness(): Promise<ReadinessResult> {
    const [db, redis] = await Promise.all([this.checkDb(), this.checkRedis()]);
    return { ok: db && redis, checks: { db, redis } };
  }

  private async checkDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      const client = await this.queue.client;
      return (await client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
