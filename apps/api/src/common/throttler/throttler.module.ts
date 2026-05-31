import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
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
    // Same signing secret as AuthModule so the guard can verify access tokens to
    // bucket authenticated requests per-tenant (W3.3). Verification only — no
    // signing here. Falls back to a placeholder when JWT_SECRET is unset (dev /
    // tests with no tokens); production env validation (W2.10) guarantees it.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'throttler-jwt-secret-unset',
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: TieTideThrottlerGuard }],
})
export class AppThrottlerModule {}
