import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_API_URL_TOKEN } from './activation.service';
import type { ProviderSubscriptionResponseDto } from './dto/provider-subscription-response.dto';

@Injectable()
export class ProviderSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(PUBLIC_API_URL_TOKEN)
    private readonly publicApiUrl: string | null,
  ) {}

  /**
   * List the provider-webhook subscriptions for a workflow the caller owns,
   * each with its public callback URL. Ownership is enforced via userId — IDs
   * are never trusted from the request body. Returns [] when the workflow has
   * no active push-trigger subscriptions yet (e.g. it has not been activated).
   */
  async listForWorkflow(
    userId: string,
    workflowId: string,
  ): Promise<ProviderSubscriptionResponseDto[]> {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, userId },
      select: { id: true },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const subs = await this.prisma.providerSubscription.findMany({
      where: { workflowId },
      select: { id: true, nodeId: true, provider: true, expiresAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const base = (this.publicApiUrl ?? '').replace(/\/+$/, '');
    return subs.map((s) => ({
      id: s.id,
      nodeId: s.nodeId,
      provider: s.provider,
      callbackUrl: `${base}/v1/provider-webhooks/${s.provider}/${s.id}`,
      expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
    }));
  }
}
