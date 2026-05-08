import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import type { Connection } from '@prisma/client';
import type { DecryptedConnection } from '@tietide/sdk';
import {
  TRIGGER_TYPE_TO_PROVIDER,
  isPushTriggerType,
  type WorkflowDefinition,
  type WorkflowNode,
} from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { ConnectionsService } from '../connections/connections.service';
import { ProviderTriggerRegistry } from './provider-trigger.registry';

export const PUBLIC_API_URL_TOKEN = 'PUBLIC_API_URL';

export interface ActivationArgs {
  workflowId: string;
  userId: string;
  definition: Prisma.JsonValue | null | undefined;
  tx?: Prisma.TransactionClient;
}

interface PushTriggerNode {
  nodeId: string;
  type: string;
  config: Record<string, unknown>;
}

@Injectable()
export class ActivationService {
  private readonly log = new Logger(ActivationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly connections: ConnectionsService,
    private readonly registry: ProviderTriggerRegistry,
    @Optional()
    @Inject(PUBLIC_API_URL_TOKEN)
    private readonly publicApiUrl: string | null,
  ) {}

  async activateForWorkflow(args: ActivationArgs): Promise<void> {
    const triggers = this.extractPushTriggers(args.definition);
    if (triggers.length === 0) return;

    const baseUrl = this.requirePublicApiUrl();
    const db = (args.tx ?? this.prisma) as PrismaService;

    for (const node of triggers) {
      const trigger = this.registry.getByType(node.type);
      if (!trigger) {
        throw new BadRequestException(`No trigger registered for node type "${node.type}"`);
      }
      const provider = TRIGGER_TYPE_TO_PROVIDER[node.type as keyof typeof TRIGGER_TYPE_TO_PROVIDER];

      const connectionIdRaw = node.config['connectionId'];
      if (typeof connectionIdRaw !== 'string' || connectionIdRaw.length === 0) {
        throw new BadRequestException(
          `Push trigger node "${node.nodeId}" requires config.connectionId`,
        );
      }

      const connRow = await db.connection.findFirst({
        where: { id: connectionIdRaw, userId: args.userId },
      });
      if (!connRow) {
        throw new NotFoundException(`Connection "${connectionIdRaw}" not found for user`);
      }

      const decryptedConnection = this.toDecryptedConnection(connRow);
      const subscriptionId = randomUUID();
      const callbackUrl = `${baseUrl.replace(/\/+$/, '')}/v1/provider-webhooks/${provider}/${subscriptionId}`;

      const result = await trigger.onActivate({
        workflowId: args.workflowId,
        nodeId: node.nodeId,
        callbackUrl,
        connection: decryptedConnection,
        config: node.config,
        logger: this.scopedLogger('onActivate', args.workflowId, node.nodeId),
      });

      const enc = this.crypto.encrypt(result.signingSecret);
      await db.providerSubscription.create({
        data: {
          id: subscriptionId,
          workflowId: args.workflowId,
          nodeId: node.nodeId,
          provider,
          providerSubId: result.providerSubId,
          secretEnc: enc.ciphertext,
          secretNonce: enc.nonce,
          expiresAt: result.expiresAt ?? null,
        },
      });

      this.log.log(
        {
          workflowId: args.workflowId,
          nodeId: node.nodeId,
          provider,
          providerSubId: result.providerSubId,
        },
        'Push trigger activated',
      );
    }
  }

  async deactivateForWorkflow(args: ActivationArgs): Promise<void> {
    const triggers = this.extractPushTriggers(args.definition);
    if (triggers.length === 0) return;

    const db = (args.tx ?? this.prisma) as PrismaService;

    const subs = await db.providerSubscription.findMany({
      where: { workflowId: args.workflowId },
    });
    if (subs.length === 0) return;

    for (const sub of subs) {
      const node = triggers.find((t) => t.nodeId === sub.nodeId);
      const trigger = this.registry.getByProvider(sub.provider);

      if (trigger && node) {
        try {
          const connectionIdRaw = node.config['connectionId'];
          if (typeof connectionIdRaw === 'string' && connectionIdRaw.length > 0) {
            const connRow = await db.connection.findFirst({
              where: { id: connectionIdRaw, userId: args.userId },
            });
            if (connRow) {
              const decryptedConnection = this.toDecryptedConnection(connRow);
              await trigger.onDeactivate({
                workflowId: args.workflowId,
                nodeId: sub.nodeId,
                providerSubId: sub.providerSubId,
                connection: decryptedConnection,
                config: node.config,
                logger: this.scopedLogger('onDeactivate', args.workflowId, sub.nodeId),
              });
            }
          }
        } catch (err) {
          this.log.warn(
            {
              workflowId: args.workflowId,
              nodeId: sub.nodeId,
              providerSubId: sub.providerSubId,
              error: (err as Error).message,
            },
            'Provider deactivation failed, deleting row anyway',
          );
        }
      }

      await db.providerSubscription.delete({ where: { id: sub.id } });
    }
  }

  private extractPushTriggers(definition: Prisma.JsonValue | null | undefined): PushTriggerNode[] {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return [];
    const def = definition as unknown as WorkflowDefinition;
    if (!Array.isArray(def.nodes)) return [];

    const out: PushTriggerNode[] = [];
    for (const n of def.nodes as WorkflowNode[]) {
      if (typeof n?.type !== 'string') continue;
      if (!isPushTriggerType(n.type)) continue;
      out.push({
        nodeId: n.id,
        type: n.type,
        config: (n.config ?? {}) as Record<string, unknown>,
      });
    }
    return out;
  }

  private toDecryptedConnection(row: Connection): DecryptedConnection {
    const config = this.connections.decryptConfig(row.configEncrypted, row.configNonce);
    return {
      id: row.id,
      type: row.type,
      provider: row.provider,
      config: config as Record<string, unknown>,
    };
  }

  private requirePublicApiUrl(): string {
    if (!this.publicApiUrl) {
      throw new Error(
        'PUBLIC_API_URL is not configured. Required to build provider-webhook callback URLs.',
      );
    }
    return this.publicApiUrl;
  }

  private scopedLogger(
    op: string,
    workflowId: string,
    nodeId: string,
  ): {
    info: (msg: string, ctx?: Record<string, unknown>) => void;
    warn: (msg: string, ctx?: Record<string, unknown>) => void;
    error: (msg: string, ctx?: Record<string, unknown>) => void;
    debug: (msg: string, ctx?: Record<string, unknown>) => void;
  } {
    const meta = { op, workflowId, nodeId };
    return {
      info: (msg, ctx) => this.log.log({ ...meta, ...ctx }, msg),
      warn: (msg, ctx) => this.log.warn({ ...meta, ...ctx }, msg),
      error: (msg, ctx) => this.log.error({ ...meta, ...ctx }, msg),
      debug: (msg, ctx) => this.log.debug({ ...meta, ...ctx }, msg),
    };
  }
}
