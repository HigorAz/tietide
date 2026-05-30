import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { buildThrottlerOptions } from './throttler.config';
import { TieTideThrottlerGuard } from './tietide-throttler.guard';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildThrottlerOptions(config),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: TieTideThrottlerGuard }],
})
export class AppThrottlerModule {}
