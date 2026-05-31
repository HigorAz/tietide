import { Controller, Get, Header, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { register as defaultRegister } from 'prom-client';
import { MetricsService } from './metrics.service';
import { isMetricsAuthorized } from './metrics-auth';

/**
 * Prometheus scrape endpoint (W3.6). Public by default; gated by `METRICS_TOKEN`
 * when set. Excluded from Swagger and from the JwtAuthGuard (it carries no
 * controller guard). Frequent scrapes must not be rate-limited.
 */
@SkipThrottle()
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
