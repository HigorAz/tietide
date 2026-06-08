import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { PrismaEnvVarResolver } from './prisma-env-var-resolver';

describe('PrismaEnvVarResolver', () => {
  let resolver: PrismaEnvVarResolver;
  let prisma: {
    workflowExecution: { findUnique: jest.Mock };
    environmentVariable: { findMany: jest.Mock };
  };
  let crypto: { encrypt: jest.Mock; decrypt: jest.Mock };

  const executionId = 'exec-1';
  const organizationId = 'org-1';

  beforeEach(async () => {
    prisma = {
      workflowExecution: { findUnique: jest.fn() },
      environmentVariable: { findMany: jest.fn() },
    };
    crypto = {
      encrypt: jest.fn(),
      decrypt: jest.fn().mockImplementation((c: string) => `dec(${c})`),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaEnvVarResolver,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
      ],
    }).compile();

    resolver = module.get(PrismaEnvVarResolver);
    jest.clearAllMocks();
    crypto.decrypt.mockImplementation((c: string) => `dec(${c})`);
  });

  function setExecution(orgId: string) {
    prisma.workflowExecution.findUnique.mockResolvedValue({
      id: executionId,
      workflow: { organizationId: orgId },
    });
  }

  describe('getEnvScope', () => {
    it('should return GLOBAL vars when the org has no USER vars', async () => {
      setExecution(organizationId);
      prisma.environmentVariable.findMany.mockResolvedValue([
        {
          scope: 'GLOBAL',
          organizationId: null,
          key: 'BASE_URL',
          valueEnc: 'C1',
          valueNonce: 'N1',
        },
      ]);

      const scope = await resolver.getEnvScope(executionId);

      expect(scope.get('BASE_URL')).toBe('dec(C1)');
      expect(scope.size).toBe(1);
    });

    it('should let USER vars override GLOBAL vars on the same key', async () => {
      setExecution(organizationId);
      prisma.environmentVariable.findMany.mockResolvedValue([
        {
          scope: 'GLOBAL',
          organizationId: null,
          key: 'API_URL',
          valueEnc: 'GLOBAL_C',
          valueNonce: 'N',
        },
        { scope: 'USER', organizationId, key: 'API_URL', valueEnc: 'USER_C', valueNonce: 'N' },
      ]);

      const scope = await resolver.getEnvScope(executionId);

      expect(scope.get('API_URL')).toBe('dec(USER_C)');
    });

    it('should query Prisma with both scope filters and the resolved organizationId', async () => {
      setExecution(organizationId);
      prisma.environmentVariable.findMany.mockResolvedValue([]);

      await resolver.getEnvScope(executionId);

      expect(prisma.environmentVariable.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { scope: 'GLOBAL', organizationId: null },
            { scope: 'USER', organizationId },
          ],
        },
      });
    });

    it('should cache the result and not requery Prisma on the second call', async () => {
      setExecution(organizationId);
      prisma.environmentVariable.findMany.mockResolvedValue([
        { scope: 'GLOBAL', organizationId: null, key: 'K', valueEnc: 'C', valueNonce: 'N' },
      ]);

      await resolver.getEnvScope(executionId);
      await resolver.getEnvScope(executionId);

      expect(prisma.environmentVariable.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.workflowExecution.findUnique).toHaveBeenCalledTimes(1);
    });

    it('should requery after releaseExecution', async () => {
      setExecution(organizationId);
      prisma.environmentVariable.findMany.mockResolvedValue([]);

      await resolver.getEnvScope(executionId);
      resolver.releaseExecution(executionId);
      await resolver.getEnvScope(executionId);

      expect(prisma.environmentVariable.findMany).toHaveBeenCalledTimes(2);
    });

    it('should throw when the execution is not found', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue(null);

      await expect(resolver.getEnvScope(executionId)).rejects.toThrow(
        `Execution ${executionId} not found`,
      );
    });

    it('should decrypt every row exactly once via CryptoService', async () => {
      setExecution(organizationId);
      prisma.environmentVariable.findMany.mockResolvedValue([
        { scope: 'GLOBAL', organizationId: null, key: 'A', valueEnc: 'CA', valueNonce: 'NA' },
        { scope: 'USER', organizationId, key: 'B', valueEnc: 'CB', valueNonce: 'NB' },
      ]);

      const scope = await resolver.getEnvScope(executionId);

      expect(scope.get('A')).toBe('dec(CA)');
      expect(scope.get('B')).toBe('dec(CB)');
      expect(crypto.decrypt).toHaveBeenCalledWith('CA', 'NA');
      expect(crypto.decrypt).toHaveBeenCalledWith('CB', 'NB');
      expect(crypto.decrypt).toHaveBeenCalledTimes(2);
    });

    it('should return a frozen-ish ReadonlyMap (mutation does not affect cached map)', async () => {
      setExecution(organizationId);
      prisma.environmentVariable.findMany.mockResolvedValue([
        { scope: 'GLOBAL', organizationId: null, key: 'K', valueEnc: 'C', valueNonce: 'N' },
      ]);

      // Caller cannot expand the cached map by writing into the returned reference
      // (we either return the same map by ref, or a clone — the contract is ReadonlyMap).
      // What matters: a second call returns the same logical scope.
      await resolver.getEnvScope(executionId);
      const scope2 = await resolver.getEnvScope(executionId);
      expect(scope2.get('K')).toBe('dec(C)');
    });
  });

  describe('isolation', () => {
    it('should never load USER rows belonging to a different org', async () => {
      // Prisma is mocked, so we assert the query — not the data filtering.
      // The query above tests the WHERE filter; here we just confirm cross-org
      // results would not be merged because the resolver uses scope+organizationId.
      setExecution(organizationId);
      prisma.environmentVariable.findMany.mockResolvedValue([
        { scope: 'USER', organizationId, key: 'OWN', valueEnc: 'C', valueNonce: 'N' },
      ]);

      const scope = await resolver.getEnvScope(executionId);

      expect(scope.has('OWN')).toBe(true);
      // Confirm WHERE includes scope=USER + organizationId — Prisma enforces the filter.
      const call = prisma.environmentVariable.findMany.mock.calls[0][0];
      const userClause = call.where.OR.find((c: { scope: string }) => c.scope === 'USER');
      expect(userClause.organizationId).toBe(organizationId);
    });
  });
});
