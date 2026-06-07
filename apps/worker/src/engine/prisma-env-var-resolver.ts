import { Injectable, Logger as NestLogger } from '@nestjs/common';
import type { EnvScope } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import type { EnvVarResolver } from './env-var-resolver';

interface EnvRow {
  scope: 'GLOBAL' | 'USER';
  organizationId: string | null;
  key: string;
  valueEnc: string;
  valueNonce: string;
}

@Injectable()
export class PrismaEnvVarResolver implements EnvVarResolver {
  private readonly log = new NestLogger(PrismaEnvVarResolver.name);
  private readonly cache = new Map<string, EnvScope>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async getEnvScope(executionId: string): Promise<EnvScope> {
    const cached = this.cache.get(executionId);
    if (cached !== undefined) {
      return cached;
    }

    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      include: { workflow: { select: { organizationId: true } } },
    });

    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const organizationId = execution.workflow.organizationId;

    const rows = (await this.prisma.environmentVariable.findMany({
      where: {
        OR: [
          { scope: 'GLOBAL', organizationId: null },
          { scope: 'USER', organizationId },
        ],
      },
    })) as EnvRow[];

    // Insert GLOBAL first so USER values overwrite on key collision.
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.scope === 'GLOBAL') {
        map.set(row.key, this.crypto.decrypt(row.valueEnc, row.valueNonce));
      }
    }
    for (const row of rows) {
      if (row.scope === 'USER') {
        map.set(row.key, this.crypto.decrypt(row.valueEnc, row.valueNonce));
      }
    }

    this.cache.set(executionId, map);

    this.log.log({ executionId, organizationId, keyCount: map.size }, 'env-vars.loaded');

    return map;
  }

  releaseExecution(executionId: string): void {
    this.cache.delete(executionId);
  }
}
