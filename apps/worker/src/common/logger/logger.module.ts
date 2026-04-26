import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { buildLoggerOptions } from './logger.config';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildLoggerOptions({ LOG_LEVEL: config.get<string>('LOG_LEVEL') }),
    }),
  ],
  exports: [PinoLoggerModule],
})
export class WorkerLoggerModule {}
