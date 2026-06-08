import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExecutionsModule } from '../executions/executions.module';
import { BillingModule } from '../billing/billing.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [PrismaModule, ExecutionsModule, BillingModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
