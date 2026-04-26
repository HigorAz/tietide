import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { WorkerLoggerModule } from './common/logger/logger.module';
import { PrismaModule } from './prisma/prisma.module';
import { WorkflowProcessor } from './processors/workflow.processor';
import { EngineModule } from './engine/engine.module';
import { CronModule } from './cron/cron.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    WorkerLoggerModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD') || undefined,
        },
      }),
    }),
    BullModule.registerQueue({ name: 'workflow-execution' }),
    PrismaModule,
    EngineModule,
    CronModule,
  ],
  providers: [WorkflowProcessor],
})
export class WorkerModule {}
