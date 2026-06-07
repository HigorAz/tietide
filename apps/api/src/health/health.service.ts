import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { EXECUTION_QUEUE_NAME } from '../executions/execution-queue.constants';

export type DependencyStatus = 'connected' | 'disconnected';
export type AggregateStatus = 'ok' | 'degraded' | 'fail';

export interface DependencyCheck {
  status: DependencyStatus;
  error?: string;
}

export interface HealthReport {
  status: AggregateStatus;
  checks: {
    database: DependencyCheck;
    redis: DependencyCheck;
    ai: DependencyCheck;
  };
  /** Git SHA the running production deploy reports itself on, or 'unknown'. */
  commit: string;
  timestamp: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly aiServiceUrl: string;
  private readonly timeoutMs: number;
  private readonly deployedShaFile: string;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(EXECUTION_QUEUE_NAME) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {
    this.aiServiceUrl = (
      this.config.get<string>('AI_SERVICE_URL', 'http://localhost:8000') ?? 'http://localhost:8000'
    ).replace(/\/+$/, '');
    this.timeoutMs = Number(this.config.get<string>('HEALTH_CHECK_TIMEOUT_MS', '2000'));
    // The WSL deploy script writes the freshly-deployed git SHA here after every
    // deploy; the promote-to-production workflow polls /v1/health/live for it.
    const defaultShaFile = join(homedir(), 'tietide-scripts', 'deployed-sha');
    this.deployedShaFile =
      this.config.get<string>('DEPLOYED_SHA_FILE', defaultShaFile) ?? defaultShaFile;
  }

  /**
   * Git SHA the running deploy reports itself on, read fresh from the marker file
   * the deploy script writes. Returns 'unknown' when the marker is absent or empty
   * (local dev, Docker, or before the first deploy). Never throws — the liveness
   * probe depends on it.
   */
  getDeployedCommit(): string {
    try {
      return readFileSync(this.deployedShaFile, 'utf8').trim() || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  async checkDatabase(): Promise<DependencyCheck> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'connected' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`Database health check failed: ${message}`);
      return { status: 'disconnected', error: message };
    }
  }

  async checkRedis(): Promise<DependencyCheck> {
    try {
      const client = await this.queue.client;
      const reply = await client.ping();
      if (reply !== 'PONG') {
        return { status: 'disconnected', error: `unexpected ping reply: ${reply}` };
      }
      return { status: 'connected' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`Redis health check failed: ${message}`);
      return { status: 'disconnected', error: message };
    }
  }

  async checkAiService(): Promise<DependencyCheck> {
    const url = `${this.aiServiceUrl}/health`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });
      if (!response.ok) {
        return { status: 'disconnected', error: `status ${response.status}` };
      }
      return { status: 'connected' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`AI service health check failed: ${message}`);
      return { status: 'disconnected', error: message };
    } finally {
      clearTimeout(timer);
    }
  }

  async check(): Promise<HealthReport> {
    const [database, redis, ai] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkAiService(),
    ]);

    let status: AggregateStatus = 'ok';
    if (database.status === 'disconnected' || redis.status === 'disconnected') {
      status = 'fail';
    } else if (ai.status === 'disconnected') {
      status = 'degraded';
    }

    return {
      status,
      checks: { database, redis, ai },
      commit: this.getDeployedCommit(),
      timestamp: new Date().toISOString(),
    };
  }
}
