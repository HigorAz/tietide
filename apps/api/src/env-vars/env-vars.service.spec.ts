import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuditLogService } from '../audit/audit-log.service';
import { EnvVarsService } from './env-vars.service';

describe('EnvVarsService', () => {
  let service: EnvVarsService;
  let prisma: {
    environmentVariable: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let crypto: { encrypt: jest.Mock; decrypt: jest.Mock };
  let audit: { log: jest.Mock };

  const userId = 'user-1';
  const otherUserId = 'user-2';
  const adminId = 'admin-1';
  const envVarId = 'env-1';

  beforeEach(async () => {
    prisma = {
      environmentVariable: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    crypto = { encrypt: jest.fn(), decrypt: jest.fn() };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnvVarsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
        { provide: AuditLogService, useValue: audit },
      ],
    }).compile();

    service = module.get<EnvVarsService>(EnvVarsService);
    jest.clearAllMocks();
  });

  describe('create — USER scope', () => {
    const dto = { key: 'API_KEY', value: 'sk-live-abc' };
    const persisted = {
      id: envVarId,
      key: dto.key,
      scope: 'USER',
      createdAt: new Date('2026-05-07T00:00:00Z'),
      updatedAt: new Date('2026-05-07T00:00:00Z'),
    };

    it('should encrypt the value via CryptoService', async () => {
      crypto.encrypt.mockReturnValue({ ciphertext: 'CIPHER', nonce: 'NONCE' });
      prisma.environmentVariable.create.mockResolvedValue(persisted);

      await service.create({ scope: 'USER', ownerUserId: userId, actorUserId: userId, dto });

      expect(crypto.encrypt).toHaveBeenCalledWith(dto.value);
    });

    it('should persist scope=USER, userId=ownerUserId, key, valueEnc, valueNonce', async () => {
      crypto.encrypt.mockReturnValue({ ciphertext: 'CIPHER', nonce: 'NONCE' });
      prisma.environmentVariable.create.mockResolvedValue(persisted);

      await service.create({ scope: 'USER', ownerUserId: userId, actorUserId: userId, dto });

      expect(prisma.environmentVariable.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            scope: 'USER',
            userId,
            key: dto.key,
            valueEnc: 'CIPHER',
            valueNonce: 'NONCE',
          },
        }),
      );
    });

    it('should return only safe fields (id, key, scope, createdAt, updatedAt)', async () => {
      crypto.encrypt.mockReturnValue({ ciphertext: 'C', nonce: 'N' });
      prisma.environmentVariable.create.mockResolvedValue(persisted);

      const result = await service.create({
        scope: 'USER',
        ownerUserId: userId,
        actorUserId: userId,
        dto,
      });

      expect(result).toEqual(persisted);
      expect(result).not.toHaveProperty('valueEnc');
      expect(result).not.toHaveProperty('valueNonce');
      expect(result).not.toHaveProperty('userId');
    });

    it('should throw ConflictException on Prisma P2002 (duplicate key in scope)', async () => {
      crypto.encrypt.mockReturnValue({ ciphertext: 'C', nonce: 'N' });
      const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
      prisma.environmentVariable.create.mockRejectedValue(p2002);

      await expect(
        service.create({ scope: 'USER', ownerUserId: userId, actorUserId: userId, dto }),
      ).rejects.toThrow(ConflictException);
    });

    it('should write an audit log entry with action env-var.create and key+scope metadata', async () => {
      crypto.encrypt.mockReturnValue({ ciphertext: 'C', nonce: 'N' });
      prisma.environmentVariable.create.mockResolvedValue(persisted);

      await service.create({ scope: 'USER', ownerUserId: userId, actorUserId: userId, dto });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'env-var.create',
          resource: 'env-var',
          resourceId: envVarId,
          metadata: expect.objectContaining({ key: dto.key, scope: 'USER' }),
        }),
      );
    });
  });

  describe('create — GLOBAL scope', () => {
    const dto = { key: 'API_BASE_URL', value: 'https://api.example.com' };
    const persisted = {
      id: envVarId,
      key: dto.key,
      scope: 'GLOBAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should persist with userId=null and scope=GLOBAL', async () => {
      crypto.encrypt.mockReturnValue({ ciphertext: 'C', nonce: 'N' });
      prisma.environmentVariable.create.mockResolvedValue(persisted);

      await service.create({ scope: 'GLOBAL', ownerUserId: null, actorUserId: adminId, dto });

      expect(prisma.environmentVariable.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ scope: 'GLOBAL', userId: null, key: dto.key }),
        }),
      );
    });

    it('should write audit log against the admin actor (not null)', async () => {
      crypto.encrypt.mockReturnValue({ ciphertext: 'C', nonce: 'N' });
      prisma.environmentVariable.create.mockResolvedValue(persisted);

      await service.create({ scope: 'GLOBAL', ownerUserId: null, actorUserId: adminId, dto });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: adminId,
          action: 'env-var.create',
          metadata: expect.objectContaining({ key: dto.key, scope: 'GLOBAL' }),
        }),
      );
    });
  });

  describe('list', () => {
    it('should query USER scope filtered by ownerUserId, selecting safe fields only', async () => {
      prisma.environmentVariable.findMany.mockResolvedValue([]);

      await service.list({ scope: 'USER', ownerUserId: userId });

      expect(prisma.environmentVariable.findMany).toHaveBeenCalledWith({
        where: { scope: 'USER', userId },
        select: { id: true, key: true, scope: true, createdAt: true, updatedAt: true },
        orderBy: { key: 'asc' },
      });
    });

    it('should query GLOBAL scope with userId=null', async () => {
      prisma.environmentVariable.findMany.mockResolvedValue([]);

      await service.list({ scope: 'GLOBAL', ownerUserId: null });

      expect(prisma.environmentVariable.findMany).toHaveBeenCalledWith({
        where: { scope: 'GLOBAL', userId: null },
        select: { id: true, key: true, scope: true, createdAt: true, updatedAt: true },
        orderBy: { key: 'asc' },
      });
    });

    it('should never return valueEnc or valueNonce', async () => {
      const row = {
        id: envVarId,
        key: 'K',
        scope: 'USER' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.environmentVariable.findMany.mockResolvedValue([row]);

      const result = await service.list({ scope: 'USER', ownerUserId: userId });

      result.forEach((r) => {
        expect(r).not.toHaveProperty('valueEnc');
        expect(r).not.toHaveProperty('valueNonce');
      });
    });
  });

  describe('update', () => {
    const existing = { id: envVarId };
    const persisted = {
      id: envVarId,
      key: 'NEW_KEY',
      scope: 'USER' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should verify ownership scoped by id + scope + userId before updating', async () => {
      prisma.environmentVariable.findFirst.mockResolvedValue(existing);
      prisma.environmentVariable.update.mockResolvedValue(persisted);

      await service.update({
        scope: 'USER',
        ownerUserId: userId,
        actorUserId: userId,
        id: envVarId,
        dto: { key: 'NEW_KEY' },
      });

      expect(prisma.environmentVariable.findFirst).toHaveBeenCalledWith({
        where: { id: envVarId, scope: 'USER', userId },
        select: { id: true },
      });
    });

    it('should re-encrypt + write fresh nonce when value is updated', async () => {
      prisma.environmentVariable.findFirst.mockResolvedValue(existing);
      crypto.encrypt.mockReturnValue({ ciphertext: 'NEW_C', nonce: 'NEW_N' });
      prisma.environmentVariable.update.mockResolvedValue(persisted);

      await service.update({
        scope: 'USER',
        ownerUserId: userId,
        actorUserId: userId,
        id: envVarId,
        dto: { value: 'new-value' },
      });

      expect(crypto.encrypt).toHaveBeenCalledWith('new-value');
      expect(prisma.environmentVariable.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: envVarId },
          data: expect.objectContaining({ valueEnc: 'NEW_C', valueNonce: 'NEW_N' }),
        }),
      );
    });

    it('should NOT re-encrypt when only key is renamed', async () => {
      prisma.environmentVariable.findFirst.mockResolvedValue(existing);
      prisma.environmentVariable.update.mockResolvedValue(persisted);

      await service.update({
        scope: 'USER',
        ownerUserId: userId,
        actorUserId: userId,
        id: envVarId,
        dto: { key: 'RENAMED' },
      });

      expect(crypto.encrypt).not.toHaveBeenCalled();
      const call = prisma.environmentVariable.update.mock.calls[0][0];
      expect(call.data).toEqual({ key: 'RENAMED' });
    });

    it('should throw NotFoundException when row belongs to another user (IDOR)', async () => {
      prisma.environmentVariable.findFirst.mockResolvedValue(null);

      await expect(
        service.update({
          scope: 'USER',
          ownerUserId: otherUserId,
          actorUserId: otherUserId,
          id: envVarId,
          dto: { key: 'X' },
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.environmentVariable.update).not.toHaveBeenCalled();
    });

    it('should map P2002 on rename to ConflictException', async () => {
      prisma.environmentVariable.findFirst.mockResolvedValue(existing);
      const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
      prisma.environmentVariable.update.mockRejectedValue(p2002);

      await expect(
        service.update({
          scope: 'USER',
          ownerUserId: userId,
          actorUserId: userId,
          id: envVarId,
          dto: { key: 'DUP' },
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should write an audit log entry with env-var.update action', async () => {
      prisma.environmentVariable.findFirst.mockResolvedValue(existing);
      crypto.encrypt.mockReturnValue({ ciphertext: 'C', nonce: 'N' });
      prisma.environmentVariable.update.mockResolvedValue(persisted);

      await service.update({
        scope: 'USER',
        ownerUserId: userId,
        actorUserId: userId,
        id: envVarId,
        dto: { value: 'plaintext' },
      });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'env-var.update',
          resource: 'env-var',
          resourceId: envVarId,
          metadata: expect.objectContaining({ scope: 'USER' }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('should delete with composite (id, scope, userId) filter', async () => {
      prisma.environmentVariable.deleteMany.mockResolvedValue({ count: 1 });

      await service.remove({
        scope: 'USER',
        ownerUserId: userId,
        actorUserId: userId,
        id: envVarId,
      });

      expect(prisma.environmentVariable.deleteMany).toHaveBeenCalledWith({
        where: { id: envVarId, scope: 'USER', userId },
      });
    });

    it('should delete a GLOBAL var with userId=null filter', async () => {
      prisma.environmentVariable.deleteMany.mockResolvedValue({ count: 1 });

      await service.remove({
        scope: 'GLOBAL',
        ownerUserId: null,
        actorUserId: adminId,
        id: envVarId,
      });

      expect(prisma.environmentVariable.deleteMany).toHaveBeenCalledWith({
        where: { id: envVarId, scope: 'GLOBAL', userId: null },
      });
    });

    it('should throw NotFoundException when count=0', async () => {
      prisma.environmentVariable.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.remove({
          scope: 'USER',
          ownerUserId: otherUserId,
          actorUserId: otherUserId,
          id: envVarId,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should write an audit log entry with env-var.delete', async () => {
      prisma.environmentVariable.deleteMany.mockResolvedValue({ count: 1 });

      await service.remove({
        scope: 'USER',
        ownerUserId: userId,
        actorUserId: userId,
        id: envVarId,
      });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'env-var.delete',
          resource: 'env-var',
          resourceId: envVarId,
        }),
      );
    });
  });
});
