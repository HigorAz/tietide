import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkerMetricsService } from './worker-metrics.service';
import { WorkerHealthService } from './worker-health.service';
import { WorkerMetricsServer } from './metrics.server';

@Module({
  imports: [PrismaModule, BullModule.registerQueue({ name: 'workflow-execution' })],
  providers: [WorkerMetricsService, WorkerHealthService, WorkerMetricsServer],
  exports: [WorkerMetricsService],
})
export class WorkerMetricsModule {}
