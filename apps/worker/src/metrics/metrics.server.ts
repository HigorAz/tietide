import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { WorkerMetricsService } from './worker-metrics.service';
import { isMetricsAuthorized } from './metrics-auth';
import { resolveMetricsPort } from './metrics.config';

/**
 * Minimal HTTP server exposing the worker's Prometheus metrics (W3.6). The
 * worker runs as a BullMQ application context with no HTTP layer, so this stands
 * up a tiny `node:http` listener on `METRICS_PORT`. W3.7 will add liveness routes
 * to the same server.
 */
@Injectable()
export class WorkerMetricsServer implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(WorkerMetricsServer.name);
  private server?: Server;

  constructor(
    private readonly metrics: WorkerMetricsService,
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
    if (req.method !== 'GET' || path !== '/metrics') {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }
    if (!isMetricsAuthorized(this.config.get<string>('METRICS_TOKEN'), req.headers.authorization)) {
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
  }
}
