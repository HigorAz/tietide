import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Histogram, Gauge, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Owns the worker's Prometheus registry and metrics (W3.6): default process
 * metrics, a workflow-execution duration histogram, and workflow-execution
 * queue-depth gauges (refreshed on each scrape).
 */
@Injectable()
export class WorkerMetricsService {
  private readonly log = new Logger(WorkerMetricsService.name);
  readonly registry = new Registry();

  private readonly executionDuration = new Histogram({
    name: 'workflow_execution_duration_seconds',
    help: 'Workflow execution duration in seconds, by outcome',
    labelNames: ['status'] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
    registers: [this.registry],
  });

  private readonly queueDepth = new Gauge({
    name: 'workflow_execution_queue_jobs',
    help: 'Job counts for the workflow-execution queue by state',
    labelNames: ['state'] as const,
    registers: [this.registry],
  });

  constructor(@InjectQueue('workflow-execution') private readonly queue: Queue) {
    this.registry.setDefaultLabels({ app: 'worker' });
    collectDefaultMetrics({ register: this.registry });
  }

  observeExecution(status: 'completed' | 'failed', seconds: number): void {
    this.executionDuration.observe({ status }, seconds);
  }

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
      this.log.warn({ err }, 'Failed to read queue job counts for metrics');
    }
    return this.registry.metrics();
  }
}
