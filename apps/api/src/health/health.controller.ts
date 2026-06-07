import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService, type HealthReport } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Aggregate readiness check (DB + Valkey + AI)' })
  @ApiResponse({ status: 200, description: 'Service is healthy or degraded' })
  @ApiResponse({ status: 503, description: 'A critical dependency is unavailable' })
  async check(): Promise<HealthReport> {
    const report = await this.health.check();
    if (report.status === 'fail') {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe (process is up) + deployed commit' })
  @ApiResponse({ status: 200, description: 'Process is alive' })
  live(): { status: 'ok'; commit: string; timestamp: string } {
    return {
      status: 'ok',
      commit: this.health.getDeployedCommit(),
      timestamp: new Date().toISOString(),
    };
  }
}
