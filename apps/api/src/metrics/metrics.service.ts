import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Histogram, Gauge, Registry, collectDefaultMetrics } from 'prom-client';
import { EXECUTION_QUEUE_NAME } from '../executions/execution-queue.constants';

/**
 * Owns the API's Prometheus registry and metrics (W3.6): default process
 * metrics, an HTTP request-duration histogram, and queue-depth gauges for the
 * workflow-execution queue (refreshed on each scrape).
 */
@Injectable()
export class MetricsService {
  private readonly log = new Logger(MetricsService.name);
  readonly registry = new Registry();

  readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  private readonly queueDepth = new Gauge({
    name: 'workflow_execution_queue_jobs',
    help: 'Job counts for the workflow-execution queue by state',
    labelNames: ['state'] as const,
    registers: [this.registry],
  });

  constructor(@InjectQueue(EXECUTION_QUEUE_NAME) private readonly queue: Queue) {
    this.registry.setDefaultLabels({ app: 'api' });
    collectDefaultMetrics({ register: this.registry });
  }

  observeHttp(method: string, route: string, statusCode: number, seconds: number): void {
    this.httpDuration.observe({ method, route, status_code: String(statusCode) }, seconds);
  }

  /** Refresh queue-depth gauges from BullMQ and render the exposition text. */
  async render(): Promise<string> {
    try {
      const counts = await this.queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      );
      for (const [state, value] of Object.entries(counts)) {
        this.queueDepth.set({ state }, value);
      }
    } catch (err) {
      // Never let a Redis hiccup break the scrape — emit what we have.
      this.log.warn({ err }, 'Failed to read queue job counts for metrics');
    }
    return this.registry.metrics();
  }
}
