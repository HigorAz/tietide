import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { ExecutionsController } from './executions.controller';
import { ExecutionsService } from './executions.service';
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
  ],
  controllers: [ExecutionsController],
  providers: [ExecutionsService],
  exports: [ExecutionsService, BullModule],
})
export class ExecutionsModule {}
