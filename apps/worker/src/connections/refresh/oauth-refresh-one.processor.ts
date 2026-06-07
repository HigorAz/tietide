import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../crypto/crypto.service';
import { OAuthRefreshClient } from './oauth-refresh.client';
import { OAuthRefreshDlqService } from './oauth-refresh-dlq.service';
import {
  MAX_REFRESH_FAILURES,
  OAUTH_REFRESH_ONE_JOB,
  OAUTH_REFRESH_QUEUE,
  OAUTH_REFRESH_SCAN_JOB,
} from './oauth-refresh.constants';
import type { OAuthRefreshOnePayload } from './oauth-refresh-scan.processor';

@Processor(OAUTH_REFRESH_QUEUE)
export class OAuthRefreshOneProcessor extends WorkerHost {
  private readonly log = new Logger(OAuthRefreshOneProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly client: OAuthRefreshClient,
    private readonly dlq: OAuthRefreshDlqService,
  ) {
    super();
  }

  async process(job: Job): Promise<{ refreshed: boolean }> {
    if (job.name === OAUTH_REFRESH_SCAN_JOB) {
      return { refreshed: false };
    }
    if (job.name !== OAUTH_REFRESH_ONE_JOB) {
      return { refreshed: false };
    }

    const payload = job.data as OAuthRefreshOnePayload;
    const connection = await this.prisma.connection.findUnique({
      where: { id: payload.connectionId },
    });
    if (!connection) {
      this.log.warn({ connectionId: payload.connectionId }, 'Connection vanished before refresh');
      return { refreshed: false };
    }
    if (!connection.refreshTokenEncrypted || !connection.refreshTokenNonce) {
      this.log.warn({ connectionId: connection.id }, 'Connection missing refresh token — skipping');
      return { refreshed: false };
    }

    if (!this.client.supports(connection.provider)) {
      this.log.warn(
        { connectionId: connection.id, provider: connection.provider },
        'Provider does not support refresh — skipping',
      );
      return { refreshed: false };
    }

    const refreshTokenPlain = this.crypto.decrypt(
      connection.refreshTokenEncrypted,
      connection.refreshTokenNonce,
    );
    const currentConfigPlain = JSON.parse(
      this.crypto.decrypt(connection.configEncrypted, connection.configNonce),
    ) as Record<string, unknown>;

    const result = await this.client.refresh(
      connection.provider,
      refreshTokenPlain,
      currentConfigPlain,
    );

    const encryptedConfig = this.crypto.encrypt(JSON.stringify(result.config));
    const encryptedRefresh = this.crypto.encrypt(result.refreshToken);

    await this.prisma.connection.update({
      where: { id: connection.id },
      data: {
        configEncrypted: encryptedConfig.ciphertext,
        configNonce: encryptedConfig.nonce,
        refreshTokenEncrypted: encryptedRefresh.ciphertext,
        refreshTokenNonce: encryptedRefresh.nonce,
        expiresAt: result.expiresAt,
        status: 'ACTIVE',
        refreshFailureCount: 0,
        lastUsedAt: new Date(),
      },
    });

    return { refreshed: true };
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: Error): Promise<void> {
    if (job.name !== OAUTH_REFRESH_ONE_JOB) return;

    const attemptsMade = job.attemptsMade;
    const attemptsAllowed = job.opts.attempts ?? attemptsMade;
    const exhausted = attemptsMade >= attemptsAllowed;

    if (!exhausted) {
      this.log.warn(
        { jobId: job.id, attemptsMade, err: err.message },
        'OAuth refresh failed; will retry',
      );
      return;
    }

    const payload = job.data as OAuthRefreshOnePayload;
    const updated = await this.prisma.connection.update({
      where: { id: payload.connectionId },
      data: {
        refreshFailureCount: { increment: 1 },
      },
      select: { refreshFailureCount: true, organizationId: true },
    });

    const newStatus = updated.refreshFailureCount >= MAX_REFRESH_FAILURES ? 'EXPIRED' : 'ERROR';
    await this.prisma.connection.update({
      where: { id: payload.connectionId },
      data: { status: newStatus },
    });

    await this.dlq.publishFailed({
      jobId: String(job.id),
      attemptsMade,
      attemptsAllowed,
      failedAt: new Date(),
      error: err.message,
      payload: {
        connectionId: payload.connectionId,
        provider: payload.provider,
        organizationId: updated.organizationId,
      },
      failureCount: updated.refreshFailureCount,
    });
  }
}
