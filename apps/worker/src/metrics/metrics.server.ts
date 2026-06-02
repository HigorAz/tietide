import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { WorkerMetricsService } from './worker-metrics.service';
import { WorkerHealthService } from './worker-health.service';
import { isMetricsAuthorized } from './metrics-auth';
import { resolveMetricsPort } from './metrics.config';

/**
 * Minimal HTTP server exposing the worker's Prometheus metrics (W3.6) plus
 * liveness/readiness probes (W3.7). The worker runs as a BullMQ application
 * context with no HTTP layer, so this stands up a tiny `node:http` listener on
 * `METRICS_PORT`. `/live` and `/health` are unauthenticated (orchestrator probes
 * carry no token); only `/metrics` honours `METRICS_TOKEN`.
 */
@Injectable()
export class WorkerMetricsServer implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(WorkerMetricsServer.name);
  private server?: Server;

  constructor(
    private readonly metrics: WorkerMetricsService,
    private readonly health: WorkerHealthService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const port = resolveMetricsPort(this.config.get<string>('METRICS_PORT'));
    this.server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });
    this.server.on('error', (err) => this.log.error({ err }, 'Worker metrics server error'));
    this.server.listen(port, () => this.log.log({ port }, 'Worker metrics server listening'));
  }

  onModuleDestroy(): void {
    this.server?.close();
  }

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = (req.url ?? '').split('?')[0];
    if (req.method !== 'GET') {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    // Liveness: the process is up and the event loop is responsive. No
    // dependency checks — a transient DB/Redis blip must not get a healthy
    // worker killed by the orchestrator.
    if (path === '/live') {
      this.json(res, 200, { status: 'ok' });
      return;
    }

    // Readiness: can the worker actually make progress (DB + Redis reachable)?
    if (path === '/health') {
      const result = await this.health.readiness();
      this.json(res, result.ok ? 200 : 503, {
        status: result.ok ? 'ok' : 'error',
        checks: result.checks,
      });
      return;
    }

    if (path === '/metrics') {
      if (
        !isMetricsAuthorized(this.config.get<string>('METRICS_TOKEN'), req.headers.authorization)
      ) {
        res.statusCode = 401;
        res.end('Unauthorized');
        return;
      }
      try {
        const body = await this.metrics.render();
        res.statusCode = 200;
        res.setHeader('Content-Type', this.metrics.registry.contentType);
        res.end(body);
      } catch (err) {
        this.log.error({ err }, 'Worker metrics render failed');
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
      return;
    }

    res.statusCode = 404;
    res.end('Not Found');
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  }
}
