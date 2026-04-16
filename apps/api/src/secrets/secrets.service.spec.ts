import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { SecretsService } from './secrets.service';

describe('SecretsService', () => {
  let service: SecretsService;
  let prisma: {
    secret: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let crypto: { encrypt: jest.Mock; decrypt: jest.Mock };

  const userId = 'user-uuid-1';
  const otherUserId = 'user-uuid-2';
  const secretId = 'secret-uuid-1';

  beforeEach(async () => {
    prisma = {
      secret: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    crypto = { encrypt: jest.fn(), decrypt: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecretsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
      ],
    }).compile();

    service = module.get<SecretsService>(SecretsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const dto = { name: 'GITHUB_TOKEN', value: 'gh_abc_123' };
    const persisted = {
      id: secretId,
      name: dto.name,
      createdAt: new Date('2026-04-16T00:00:00Z'),
      updatedAt: new Date('2026-04-16T00:00:00Z'),
    };

    it('should encrypt the value via CryptoService before persisting', async () => {
      crypto.encrypt.mockReturnValue({ ciphertext: 'CIPHER', nonce: 'NONCE' });
      prisma.secret.create.mockResolvedValue(persisted);

      await service.create(userId, dto);

      expect(crypto.encrypt).toHaveBeenCalledWith(dto.value);
    });

    it('should persist userId, name, ciphertext as value, and nonce', async () => {
      crypto.encrypt.mockReturnValue({ ciphertext: 'CIPHER', nonce: 'NONCE' });
      prisma.secret.create.mockResolvedValue(persisted);

      await service.create(userId, dto);

      expect(prisma.secret.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            userId,
            name: dto.name,
            value: 'CIPHER',
            nonce: 'NONCE',
          },
        }),
      );
    });

    it('should return only { id, name, createdAt, updatedAt } — no value or nonce', async () => {
      crypto.encrypt.mockReturnValue({ ciphertext: 'CIPHER', nonce: 'NONCE' });
      prisma.secret.create.mockResolvedValue(persisted);

      const result = await service.create(userId, dto);

      expect(result).toEqual(persisted);
      expect(result).not.toHaveProperty('value');
      expect(result).not.toHaveProperty('nonce');
      expect(result).not.toHaveProperty('userId');
    });

    it('should throw ConflictException when Prisma raises P2002 (name collision)', async () => {
      crypto.encrypt.mockReturnValue({ ciphertext: 'CIPHER', nonce: 'NONCE' });
      const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
      prisma.secret.create.mockRejectedValue(p2002);

      await expect(service.create(userId, dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('list', () => {
    it('should query Prisma scoped to the caller userId and select safe fields only', async () => {
      prisma.secret.findMany.mockResolvedValue([]);

      await service.list(userId);

      expect(prisma.secret.findMany).toHaveBeenCalledWith({
        where: { userId },
        select: { id: true, name: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return rows without any value or nonce field', async () => {
      const row = {
        id: secretId,
        name: 'GITHUB_TOKEN',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.secret.findMany.mockResolvedValue([row]);

      const result = await service.list(userId);

      expect(result).toEqual([row]);
      result.forEach((r) => {
        expect(r).not.toHaveProperty('value');
        expect(r).not.toHaveProperty('nonce');
      });
    });
  });

  describe('update', () => {
    const existing = { id: secretId };
    const persisted = {
      id: secretId,
      name: 'NEW_NAME',
      createdAt: new Date('2026-04-16T00:00:00Z'),
      updatedAt: new Date('2026-04-16T01:00:00Z'),
    };

    it('should verify ownership via findFirst({ where: { id, userId } }) before updating', async () => {
      prisma.secret.findFirst.mockResolvedValue(existing);
      prisma.secret.update.mockResolvedValue(persisted);

      await service.update(userId, secretId, { name: 'NEW_NAME' });

      expect(prisma.secret.findFirst).toHaveBeenCalledWith({
        where: { id: secretId, userId },
        select: { id: true },
      });
    });

    it('should re-encrypt and write a fresh nonce when value is updated', async () => {
      prisma.secret.findFirst.mockResolvedValue(existing);
      crypto.encrypt.mockReturnValue({ ciphertext: 'NEW_CIPHER', nonce: 'NEW_NONCE' });
      prisma.secret.update.mockResolvedValue(persisted);

      await service.update(userId, secretId, { value: 'new-plaintext' });

      expect(crypto.encrypt).toHaveBeenCalledWith('new-plaintext');
      expect(prisma.secret.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: secretId },
          data: expect.objectContaining({ value: 'NEW_CIPHER', nonce: 'NEW_NONCE' }),
        }),
      );
    });

    it('should NOT re-encrypt or touch the nonce when only name changes', async () => {
      prisma.secret.findFirst.mockResolvedValue(existing);
      prisma.secret.update.mockResolvedValue(persisted);

      await service.update(userId, secretId, { name: 'RENAMED' });

      expect(crypto.encrypt).not.toHaveBeenCalled();
      const call = prisma.secret.update.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('value');
      expect(call.data).not.toHaveProperty('nonce');
      expect(call.data).toEqual({ name: 'RENAMED' });
    });

    it('should throw NotFoundException when the secret belongs to another user', async () => {
      prisma.secret.findFirst.mockResolvedValue(null);

      await expect(service.update(otherUserId, secretId, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.secret.update).not.toHaveBeenCalled();
    });

    it('should map Prisma P2002 on rename to ConflictException', async () => {
      prisma.secret.findFirst.mockResolvedValue(existing);
      const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
      prisma.secret.update.mockRejectedValue(p2002);

      await expect(service.update(userId, secretId, { name: 'DUP' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('should return the response without value or nonce', async () => {
      prisma.secret.findFirst.mockResolvedValue(existing);
      prisma.secret.update.mockResolvedValue(persisted);

      const result = await service.update(userId, secretId, { name: 'NEW_NAME' });

      expect(result).toEqual(persisted);
      expect(result).not.toHaveProperty('value');
      expect(result).not.toHaveProperty('nonce');
    });
  });

  describe('remove', () => {
    it('should delete with a composite (id, userId) filter', async () => {
      prisma.secret.deleteMany.mockResolvedValue({ count: 1 });

      await service.remove(userId, secretId);

      expect(prisma.secret.deleteMany).toHaveBeenCalledWith({
        where: { id: secretId, userId },
      });
    });

    it('should throw NotFoundException when no row matched (wrong user or missing id)', async () => {
      prisma.secret.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove(otherUserId, secretId)).rejects.toThrow(NotFoundException);
    });
  });
});
