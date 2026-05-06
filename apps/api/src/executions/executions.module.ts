import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ExecutionsController } from './executions.controller';
import { WorkflowExecutionsController } from './workflow-executions.controller';
import { AllExecutionsController } from './all-executions.controller';
import { ExecutionDetailController } from './execution-detail.controller';
import { ExecutionsService } from './executions.service';
import { ExecutionsGateway } from './executions.gateway';
import { RedisExecutionEventsSubscriber } from './redis-execution-events.subscriber';
import { redisSubscriberClientProvider } from './redis-subscriber.provider';
import { EXECUTION_EVENTS_SUBSCRIBER } from './execution-events.subscriber';
import { EXECUTION_QUEUE_NAME } from './execution-queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
    }),
    BullModule.registerQueue({ name: EXECUTION_QUEUE_NAME }),
    PrismaModule,
    AuthModule,
  ],
  controllers: [
    ExecutionsController,
    WorkflowExecutionsController,
    AllExecutionsController,
    ExecutionDetailController,
  ],
  providers: [
    ExecutionsService,
    ExecutionsGateway,
    redisSubscriberClientProvider,
    RedisExecutionEventsSubscriber,
    {
      provide: EXECUTION_EVENTS_SUBSCRIBER,
      useExisting: RedisExecutionEventsSubscriber,
    },
  ],
  exports: [ExecutionsService, BullModule],
})
export class ExecutionsModule {}
