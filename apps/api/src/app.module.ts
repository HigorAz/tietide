import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppLoggerModule } from './common/logger/logger.module';
import { AppThrottlerModule } from './common/throttler/throttler.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { WorkflowVersionsModule } from './workflow-versions/workflow-versions.module';
import { ExecutionsModule } from './executions/executions.module';
import { UsageModule } from './usage/usage.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ProviderWebhooksModule } from './provider-webhooks/provider-webhooks.module';
import { ProviderTriggerModule } from './provider-triggers/provider-trigger.module';
import { SecretsModule } from './secrets/secrets.module';
import { EnvVarsModule } from './env-vars/env-vars.module';
import { ConnectionsModule } from './connections/connections.module';
import { CryptoModule } from './crypto/crypto.module';
import { AiModule } from './ai/ai.module';
import { DemoModule } from './demo/demo.module';
import { LibraryModule } from './library/library.module';
import { FoldersModule } from './folders/folders.module';
import { TagsModule } from './tags/tags.module';

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
    WorkflowVersionsModule,
    ExecutionsModule,
    UsageModule,
    WebhooksModule,
    ProviderTriggerModule,
    ProviderWebhooksModule,
    SecretsModule,
    EnvVarsModule,
    ConnectionsModule,
    AiModule,
    DemoModule,
    LibraryModule,
    FoldersModule,
    TagsModule,
  ],
})
export class AppModule {}
