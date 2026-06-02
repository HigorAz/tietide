import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

/**
 * Observes every HTTP request into the `http_request_duration_seconds` histogram
 * (W3.6). Uses the matched route pattern (e.g. `/v1/workflows/:id`) as the label
 * so cardinality stays bounded instead of exploding per-id.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { route?: { path?: string } }>();
    const res = http.getResponse<Response>();
    const start = process.hrtime.bigint();

    const record = (): void => {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      const route = req.route?.path ?? req.path ?? 'unknown';
      this.metrics.observeHttp(req.method, route, res.statusCode, seconds);
    };

    return next.handle().pipe(tap({ next: record, error: record }));
  }
}
