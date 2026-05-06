import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuditLogService } from '../audit/audit-log.service';
import { ConnectionsService } from './connections.service';

describe('ConnectionsService', () => {
  let service: ConnectionsService;
  let prisma: {
    connection: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let crypto: { encrypt: jest.Mock; decrypt: jest.Mock };
  let audit: { log: jest.Mock };

  const userId = 'user-uuid-1';
  const otherUserId = 'user-uuid-2';
  const connectionId = 'conn-uuid-1';

  const baseRow = {
    id: connectionId,
    type: ConnectionType.OAUTH2,
    provider: 'slack',
    name: 'Acme workspace',
    status: ConnectionStatus.ACTIVE,
    expiresAt: null,
    lastUsedAt: null,
    createdAt: new Date('2026-05-06T00:00:00Z'),
    updatedAt: new Date('2026-05-06T00:00:00Z'),
  };

  beforeEach(async () => {
    prisma = {
      connection: {
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
        ConnectionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
        { provide: AuditLogService, useValue: audit },
      ],
    }).compile();

    service = module.get<ConnectionsService>(ConnectionsService);
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('should query Prisma scoped to the caller userId, ordered desc, with metadata-only select', async () => {
      prisma.connection.findMany.mockResolvedValue([]);

      await service.list(userId);

      expect(prisma.connection.findMany).toHaveBeenCalledWith({
        where: { userId },
        select: {
          id: true,
          type: true,
          provider: true,
          name: true,
          status: true,
          expiresAt: true,
          lastUsedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return rows without any encrypted/nonce fields', async () => {
      prisma.connection.findMany.mockResolvedValue([baseRow]);

      const result = await service.list(userId);

      expect(result).toEqual([baseRow]);
      for (const row of result as unknown as Record<string, unknown>[]) {
        expect(row).not.toHaveProperty('configEncrypted');
        expect(row).not.toHaveProperty('configNonce');
        expect(row).not.toHaveProperty('refreshTokenEncrypted');
        expect(row).not.toHaveProperty('refreshTokenNonce');
      }
    });
  });

  describe('findOne', () => {
    it('should return a metadata-only DTO when the row exists for the user', async () => {
      prisma.connection.findFirst.mockResolvedValue(baseRow);

      const result = await service.findOne(userId, connectionId);

      expect(prisma.connection.findFirst).toHaveBeenCalledWith({
        where: { id: connectionId, userId },
        select: {
          id: true,
          type: true,
          provider: true,
          name: true,
          status: true,
          expiresAt: true,
          lastUsedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      expect(result).toEqual(baseRow);
      expect(result).not.toHaveProperty('configEncrypted');
      expect(result).not.toHaveProperty('configNonce');
    });

    it('should throw NotFoundException when the id belongs to another user (IDOR)', async () => {
      prisma.connection.findFirst.mockResolvedValue(null);

      await expect(service.findOne(otherUserId, connectionId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should verify ownership via findFirst before updating', async () => {
      prisma.connection.findFirst.mockResolvedValue({ id: connectionId });
      prisma.connection.update.mockResolvedValue(baseRow);

      await service.update(userId, connectionId, { name: 'Renamed' });

      expect(prisma.connection.findFirst).toHaveBeenCalledWith({
        where: { id: connectionId, userId },
        select: { id: true },
      });
    });

    it('should persist name and status when both are provided', async () => {
      prisma.connection.findFirst.mockResolvedValue({ id: connectionId });
      prisma.connection.update.mockResolvedValue(baseRow);

      await service.update(userId, connectionId, {
        name: 'Renamed',
        status: ConnectionStatus.REVOKED,
      });

      expect(prisma.connection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: connectionId },
          data: { name: 'Renamed', status: ConnectionStatus.REVOKED },
        }),
      );
    });

    it('should throw NotFoundException when the connection belongs to another user', async () => {
      prisma.connection.findFirst.mockResolvedValue(null);

      await expect(service.update(otherUserId, connectionId, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.connection.update).not.toHaveBeenCalled();
    });

    it('should record an audit log entry with action "connection.update" listing changed fields', async () => {
      prisma.connection.findFirst.mockResolvedValue({ id: connectionId });
      prisma.connection.update.mockResolvedValue(baseRow);

      await service.update(userId, connectionId, { status: ConnectionStatus.EXPIRED });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'connection.update',
          resource: 'connection',
          resourceId: connectionId,
          metadata: { fields: ['status'] },
        }),
      );
    });

    it('should return the response without encrypted columns', async () => {
      prisma.connection.findFirst.mockResolvedValue({ id: connectionId });
      prisma.connection.update.mockResolvedValue(baseRow);

      const result = await service.update(userId, connectionId, { name: 'Renamed' });

      expect(result).toEqual(baseRow);
      expect(result).not.toHaveProperty('configEncrypted');
      expect(result).not.toHaveProperty('refreshTokenEncrypted');
    });
  });

  describe('remove', () => {
    it('should delete with a composite (id, userId) filter', async () => {
      prisma.connection.deleteMany.mockResolvedValue({ count: 1 });

      await service.remove(userId, connectionId);

      expect(prisma.connection.deleteMany).toHaveBeenCalledWith({
        where: { id: connectionId, userId },
      });
    });

    it('should throw NotFoundException when no row matched (wrong user or missing id)', async () => {
      prisma.connection.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove(otherUserId, connectionId)).rejects.toThrow(NotFoundException);
    });

    it('should record an audit log entry with action "connection.delete" on success', async () => {
      prisma.connection.deleteMany.mockResolvedValue({ count: 1 });

      await service.remove(userId, connectionId);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'connection.delete',
          resource: 'connection',
          resourceId: connectionId,
        }),
      );
    });
  });

  describe('create (internal)', () => {
    it('should encrypt the config payload via CryptoService and persist ciphertext + nonce', async () => {
      crypto.encrypt.mockReturnValue({ ciphertext: 'CFG_C', nonce: 'CFG_N' });
      prisma.connection.create.mockResolvedValue(baseRow);

      await service.create(userId, {
        type: ConnectionType.API_KEY,
        provider: 'openai',
        name: 'My OpenAI',
        config: { apiKey: 'sk-abc' },
      });

      expect(crypto.encrypt).toHaveBeenCalledWith(JSON.stringify({ apiKey: 'sk-abc' }));
      expect(prisma.connection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            type: ConnectionType.API_KEY,
            provider: 'openai',
            name: 'My OpenAI',
            configEncrypted: 'CFG_C',
            configNonce: 'CFG_N',
            refreshTokenEncrypted: null,
            refreshTokenNonce: null,
          }),
        }),
      );
    });

    it('should encrypt the refresh token separately when provided', async () => {
      crypto.encrypt
        .mockReturnValueOnce({ ciphertext: 'CFG_C', nonce: 'CFG_N' })
        .mockReturnValueOnce({ ciphertext: 'RT_C', nonce: 'RT_N' });
      prisma.connection.create.mockResolvedValue(baseRow);

      await service.create(userId, {
        type: ConnectionType.OAUTH2,
        provider: 'google',
        name: 'My Google',
        config: { accessToken: 'a', refreshToken: 'r', scope: 's', tokenType: 'Bearer' },
        refreshToken: 'r',
        expiresAt: new Date('2026-06-06T00:00:00Z'),
      });

      expect(crypto.encrypt).toHaveBeenCalledTimes(2);
      expect(prisma.connection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            refreshTokenEncrypted: 'RT_C',
            refreshTokenNonce: 'RT_N',
            expiresAt: new Date('2026-06-06T00:00:00Z'),
          }),
        }),
      );
    });

    it('should record an audit log entry with action "connection.create" and no plaintext config', async () => {
      crypto.encrypt.mockReturnValue({ ciphertext: 'C', nonce: 'N' });
      prisma.connection.create.mockResolvedValue(baseRow);

      await service.create(userId, {
        type: ConnectionType.API_KEY,
        provider: 'openai',
        name: 'My OpenAI',
        config: { apiKey: 'sk-abc' },
      });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'connection.create',
          resource: 'connection',
          resourceId: connectionId,
          metadata: { type: ConnectionType.API_KEY, provider: 'openai', name: 'My OpenAI' },
        }),
      );
      const call = audit.log.mock.calls[0][0] as { metadata?: Record<string, unknown> };
      expect(call.metadata).not.toHaveProperty('apiKey');
      expect(call.metadata).not.toHaveProperty('config');
    });
  });

  describe('encryptConfig / decryptConfig', () => {
    it('should JSON-encode the config and delegate to CryptoService.encrypt', () => {
      crypto.encrypt.mockReturnValue({ ciphertext: 'C', nonce: 'N' });

      const out = service.encryptConfig({ apiKey: 'sk-abc', organization: 'org-1' });

      expect(crypto.encrypt).toHaveBeenCalledWith(
        JSON.stringify({ apiKey: 'sk-abc', organization: 'org-1' }),
      );
      expect(out).toEqual({ ciphertext: 'C', nonce: 'N' });
    });

    it('should round-trip a Slack config payload through encrypt/decrypt', () => {
      const payload = {
        accessToken: 'xoxb-abc',
        teamId: 'T0001',
        botUserId: 'U0001',
        scope: 'chat:write',
      };
      crypto.encrypt.mockReturnValue({ ciphertext: 'CIPHER', nonce: 'NONCE' });
      crypto.decrypt.mockReturnValue(JSON.stringify(payload));

      const encrypted = service.encryptConfig(payload);
      const decrypted = service.decryptConfig(encrypted.ciphertext, encrypted.nonce);

      expect(decrypted).toEqual(payload);
    });

    it('should propagate CryptoService failures (tamper detection)', () => {
      crypto.decrypt.mockImplementation(() => {
        throw new InternalServerErrorException('Failed to decrypt secret');
      });

      expect(() => service.decryptConfig('bad', 'nonce')).toThrow(InternalServerErrorException);
    });
  });
});
