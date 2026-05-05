import { Injectable, Logger as NestLogger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { SecretNotFoundError, type SecretResolver } from './secret-resolver';

interface ExecutionCache {
  userId: string;
  secrets: Map<string, string>;
}

@Injectable()
export class PrismaSecretResolver implements SecretResolver {
  private readonly log = new NestLogger(PrismaSecretResolver.name);
  private readonly cache = new Map<string, ExecutionCache>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async getSecret(executionId: string, name: string): Promise<string> {
    const entry = await this.loadExecution(executionId);

    const cached = entry.secrets.get(name);
    if (cached !== undefined) {
      return cached;
    }

    const row = await this.prisma.secret.findFirst({
      where: { userId: entry.userId, name },
    });

    if (!row) {
      throw new SecretNotFoundError(name);
    }

    const plaintext = this.crypto.decrypt(row.value, row.nonce);
    entry.secrets.set(name, plaintext);

    this.log.log({ executionId, userId: entry.userId, secretName: name }, 'secret.read');

    return plaintext;
  }

  releaseExecution(executionId: string): void {
    this.cache.delete(executionId);
  }

  private async loadExecution(executionId: string): Promise<ExecutionCache> {
    const existing = this.cache.get(executionId);
    if (existing) {
      return existing;
    }

    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      include: { workflow: { select: { userId: true } } },
    });

    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const entry: ExecutionCache = {
      userId: execution.workflow.userId,
      secrets: new Map(),
    };
    this.cache.set(executionId, entry);
    return entry;
  }
}
