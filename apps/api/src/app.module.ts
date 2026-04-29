import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppLoggerModule } from './common/logger/logger.module';
import { AppThrottlerModule } from './common/throttler/throttler.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { ExecutionsModule } from './executions/executions.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { SecretsModule } from './secrets/secrets.module';
import { CryptoModule } from './crypto/crypto.module';
import { AiModule } from './ai/ai.module';
import { DemoModule } from './demo/demo.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    AppLoggerModule,
    AppThrottlerModule,
    PrismaModule,
    AuditModule,
    CryptoModule,
    HealthModule,
    AuthModule,
    WorkflowsModule,
    ExecutionsModule,
    WebhooksModule,
    SecretsModule,
    AiModule,
    DemoModule,
  ],
})
export class AppModule {}
