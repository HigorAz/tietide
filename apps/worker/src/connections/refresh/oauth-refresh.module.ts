import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../prisma/prisma.module';
import { CryptoModule } from '../../crypto/crypto.module';
import { OAUTH_REFRESH_DLQ_QUEUE, OAUTH_REFRESH_QUEUE } from './oauth-refresh.constants';
import { OAuthRefreshScheduler } from './oauth-refresh.scheduler';
import { OAuthRefreshScanProcessor } from './oauth-refresh-scan.processor';
import { OAuthRefreshOneProcessor } from './oauth-refresh-one.processor';
import { OAuthRefreshClient } from './oauth-refresh.client';
import { OAuthRefreshDlqService } from './oauth-refresh-dlq.service';
import { InProcessRefreshService } from './in-process-refresh.service';

@Module({
  imports: [
    PrismaModule,
    CryptoModule,
    BullModule.registerQueue({ name: OAUTH_REFRESH_QUEUE }, { name: OAUTH_REFRESH_DLQ_QUEUE }),
  ],
  providers: [
    OAuthRefreshScheduler,
    OAuthRefreshScanProcessor,
    OAuthRefreshOneProcessor,
    OAuthRefreshClient,
    OAuthRefreshDlqService,
    InProcessRefreshService,
  ],
  exports: [InProcessRefreshService, OAuthRefreshClient],
})
export class OAuthRefreshModule {}
