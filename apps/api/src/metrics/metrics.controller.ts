import { Controller, Get, Header, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { register as defaultRegister } from 'prom-client';
import { MetricsService } from './metrics.service';
import { isMetricsAuthorized } from './metrics-auth';
import {
  DEFAULT_METRICS_THROTTLE_LIMIT,
  DEFAULT_METRICS_THROTTLE_TTL_MS,
  IP_THROTTLER_NAME,
} from '../common/throttler/throttler.config';

/**
 * Prometheus scrape endpoint (W3.6). Gated by `METRICS_TOKEN` when set — and
 * required in production (W5.36), so metrics are default-closed on real deploys.
 * Excluded from Swagger and from the JwtAuthGuard (it carries no controller
 * guard). Previously @SkipThrottle() (never limited): replaced with a modest
 * per-IP cap via the `ip` named throttler so an anonymous scrape flood can't run
 * unbounded, while a normal Prometheus scrape interval stays well under the cap.
 */
@Throttle({
  [IP_THROTTLER_NAME]: {
    ttl: DEFAULT_METRICS_THROTTLE_TTL_MS,
    limit: DEFAULT_METRICS_THROTTLE_LIMIT,
  },
})
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @Header('Content-Type', defaultRegister.contentType)
  async scrape(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<string> {
    if (!isMetricsAuthorized(this.config.get<string>('METRICS_TOKEN'), req.headers.authorization)) {
      throw new UnauthorizedException('Invalid metrics token');
    }
    res.setHeader('Content-Type', this.metrics.registry.contentType);
    return this.metrics.render();
  }
}
