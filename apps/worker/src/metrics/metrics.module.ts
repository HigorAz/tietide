import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WorkerMetricsService } from './worker-metrics.service';
import { WorkerMetricsServer } from './metrics.server';

@Module({
  imports: [BullModule.registerQueue({ name: 'workflow-execution' })],
  providers: [WorkerMetricsService, WorkerMetricsServer],
  exports: [WorkerMetricsService],
})
export class WorkerMetricsModule {}
