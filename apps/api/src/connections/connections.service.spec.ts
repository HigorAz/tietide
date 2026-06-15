import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuditLogService } from '../audit/audit-log.service';
import { ConnectionsService } from './connections.service';
import { ProviderHealthRegistry } from './health/provider-health.registry';

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
  let healthRegistry: { get: jest.Mock };
  let mockChecker: { provider: string; check: jest.Mock };

  const orgId = 'org-uuid-1';
  const otherOrgId = 'org-uuid-2';
  const userId = 'user-uuid-1';
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
    mockChecker = { provider: 'openai', check: jest.fn() };
    healthRegistry = { get: jest.fn().mockReturnValue(mockChecker) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
        { provide: AuditLogService, useValue: audit },
        { provide: ProviderHealthRegistry, useValue: healthRegistry },
      ],
    }).compile();

    service = module.get<ConnectionsService>(ConnectionsService);
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('should query Prisma scoped to the active organizationId, keyset-ordered, metadata-only', async () => {
      prisma.connection.findMany.mockResolvedValue([]);

      await service.list(orgId, userId, 'SUPERADMIN');

      expect(prisma.connection.findMany).toHaveBeenCalledWith({
        where: { organizationId: orgId },
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
          userId: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 51,
      });
    });

    it('should return rows in a paginated envelope without any encrypted/nonce fields', async () => {
      prisma.connection.findMany.mockResolvedValue([{ ...baseRow, userId }]);

      const result = await service.list(orgId, userId, 'MEMBER');

      expect(result).toEqual({ items: [{ ...baseRow, canEdit: true }], nextCursor: null });
      for (const row of result.items as unknown as Record<string, unknown>[]) {
        expect(row).not.toHaveProperty('userId');
        expect(row).not.toHaveProperty('configEncrypted');
        expect(row).not.toHaveProperty('configNonce');
        expect(row).not.toHaveProperty('refreshTokenEncrypted');
        expect(row).not.toHaveProperty('refreshTokenNonce');
      }
    });

    it('should apply a keyset where-clause when a cursor is supplied', async () => {
      prisma.connection.findMany.mockResolvedValue([]);
      const cursor = Buffer.from(
        JSON.stringify({ v: '2026-04-10T00:00:00.000Z', id: 'conn-x' }),
        'utf8',
      ).toString('base64url');

      await service.list(orgId, userId, 'MEMBER', { cursor });

      const call = prisma.connection.findMany.mock.calls[0][0] as { where: { AND?: unknown[] } };
      expect(call.where.AND).toBeDefined();
    });

    it('marks canEdit false for a non-owner MEMBER and true for the owner / a SUPERADMIN', async () => {
      prisma.connection.findMany.mockResolvedValue([{ ...baseRow, userId: 'owner-1' }]);

      const asOther = await service.list(orgId, 'someone-else', 'MEMBER');
      expect((asOther.items[0] as { canEdit?: boolean }).canEdit).toBe(false);

      prisma.connection.findMany.mockResolvedValue([{ ...baseRow, userId: 'owner-1' }]);
      const asOwner = await service.list(orgId, 'owner-1', 'MEMBER');
      expect((asOwner.items[0] as { canEdit?: boolean }).canEdit).toBe(true);

      prisma.connection.findMany.mockResolvedValue([{ ...baseRow, userId: 'owner-1' }]);
      const asSuper = await service.list(orgId, 'someone-else', 'SUPERADMIN');
      expect((asSuper.items[0] as { canEdit?: boolean }).canEdit).toBe(true);
    });
  });

  describe('findOne', () => {
    it('should return a metadata-only DTO when the row exists in the org', async () => {
      prisma.connection.findFirst.mockResolvedValue({ ...baseRow, userId });

      const result = await service.findOne(orgId, connectionId, userId, 'MEMBER');

      expect(prisma.connection.findFirst).toHaveBeenCalledWith({
        where: { id: connectionId, organizationId: orgId },
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
          userId: true,
        },
      });
      expect(result).toEqual({ ...baseRow, canEdit: true });
      expect(result).not.toHaveProperty('userId');
      expect(result).not.toHaveProperty('configEncrypted');
      expect(result).not.toHaveProperty('configNonce');
    });

    it('should throw NotFoundException when the id belongs to another org (IDOR)', async () => {
      prisma.connection.findFirst.mockResolvedValue(null);

      await expect(service.findOne(otherOrgId, connectionId, userId, 'MEMBER')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    const ownedApiKey = {
      id: connectionId,
      userId,
      type: ConnectionType.API_KEY,
      provider: 'openai',
    };

    it('should verify org ownership via findFirst before updating', async () => {
      prisma.connection.findFirst.mockResolvedValue(ownedApiKey);
      prisma.connection.update.mockResolvedValue(baseRow);

      await service.update(orgId, userId, 'MEMBER', connectionId, { name: 'Renamed' });

      expect(prisma.connection.findFirst).toHaveBeenCalledWith({
        where: { id: connectionId, organizationId: orgId },
        select: { id: true, userId: true, type: true, provider: true },
      });
    });

    it('should persist name and status when both are provided', async () => {
      prisma.connection.findFirst.mockResolvedValue(ownedApiKey);
      prisma.connection.update.mockResolvedValue(baseRow);

      await service.update(orgId, userId, 'MEMBER', connectionId, {
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

    it('should throw NotFoundException when the connection belongs to another org', async () => {
      prisma.connection.findFirst.mockResolvedValue(null);

      await expect(
        service.update(otherOrgId, userId, 'MEMBER', connectionId, { name: 'X' }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.connection.update).not.toHaveBeenCalled();
    });

    it('should forbid a non-owner MEMBER from editing someone else’s connection', async () => {
      prisma.connection.findFirst.mockResolvedValue({ ...ownedApiKey, userId: 'owner-1' });

      await expect(
        service.update(orgId, 'someone-else', 'MEMBER', connectionId, { name: 'X' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.connection.update).not.toHaveBeenCalled();
    });

    it('should allow a SUPERADMIN to edit another member’s connection', async () => {
      prisma.connection.findFirst.mockResolvedValue({ ...ownedApiKey, userId: 'owner-1' });
      prisma.connection.update.mockResolvedValue(baseRow);

      await expect(
        service.update(orgId, 'admin-1', 'SUPERADMIN', connectionId, { name: 'X' }),
      ).resolves.toBeDefined();
    });

    it('should validate + re-encrypt a config edit for a credential connection', async () => {
      prisma.connection.findFirst.mockResolvedValue(ownedApiKey);
      crypto.encrypt.mockReturnValue({ ciphertext: 'NEW_C', nonce: 'NEW_N' });
      prisma.connection.update.mockResolvedValue(baseRow);

      await service.update(orgId, userId, 'MEMBER', connectionId, {
        config: { apiKey: 'sk-new' },
      });

      expect(crypto.encrypt).toHaveBeenCalledWith(JSON.stringify({ apiKey: 'sk-new' }));
      expect(prisma.connection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ configEncrypted: 'NEW_C', configNonce: 'NEW_N' }),
        }),
      );
    });

    it('should reject an invalid config edit', async () => {
      prisma.connection.findFirst.mockResolvedValue(ownedApiKey);

      await expect(
        service.update(orgId, userId, 'MEMBER', connectionId, { config: { notApiKey: 1 } }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.connection.update).not.toHaveBeenCalled();
    });

    it('should reject a config edit on an OAuth2 connection (reconnect instead)', async () => {
      prisma.connection.findFirst.mockResolvedValue({
        ...ownedApiKey,
        type: ConnectionType.OAUTH2,
        provider: 'google',
      });

      await expect(
        service.update(orgId, userId, 'MEMBER', connectionId, { config: { accessToken: 'x' } }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.connection.update).not.toHaveBeenCalled();
    });

    it('should record an audit log entry (org-scoped) with action "connection.update"', async () => {
      prisma.connection.findFirst.mockResolvedValue(ownedApiKey);
      prisma.connection.update.mockResolvedValue(baseRow);

      await service.update(orgId, userId, 'MEMBER', connectionId, {
        status: ConnectionStatus.EXPIRED,
      });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          organizationId: orgId,
          action: 'connection.update',
          resource: 'connection',
          resourceId: connectionId,
          metadata: { fields: ['status'] },
        }),
      );
    });

    it('should return the response without encrypted columns', async () => {
      prisma.connection.findFirst.mockResolvedValue(ownedApiKey);
      prisma.connection.update.mockResolvedValue(baseRow);

      const result = await service.update(orgId, userId, 'MEMBER', connectionId, {
        name: 'Renamed',
      });

      expect(result).toEqual({ ...baseRow, canEdit: true });
      expect(result).not.toHaveProperty('configEncrypted');
      expect(result).not.toHaveProperty('refreshTokenEncrypted');
    });
  });

  describe('remove', () => {
    it('should delete with a composite (id, organizationId) filter', async () => {
      prisma.connection.findFirst.mockResolvedValue({ id: connectionId, userId });
      prisma.connection.deleteMany.mockResolvedValue({ count: 1 });

      await service.remove(orgId, userId, 'MEMBER', connectionId);

      expect(prisma.connection.deleteMany).toHaveBeenCalledWith({
        where: { id: connectionId, organizationId: orgId },
      });
    });

    it('should throw NotFoundException when no row matched (wrong org or missing id)', async () => {
      prisma.connection.findFirst.mockResolvedValue(null);

      await expect(service.remove(otherOrgId, userId, 'MEMBER', connectionId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.connection.deleteMany).not.toHaveBeenCalled();
    });

    it('should forbid a non-owner MEMBER from deleting someone else’s connection', async () => {
      prisma.connection.findFirst.mockResolvedValue({ id: connectionId, userId: 'owner-1' });

      await expect(service.remove(orgId, 'someone-else', 'MEMBER', connectionId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.connection.deleteMany).not.toHaveBeenCalled();
    });

    it('should record an audit log entry with action "connection.delete" on success', async () => {
      prisma.connection.findFirst.mockResolvedValue({ id: connectionId, userId });
      prisma.connection.deleteMany.mockResolvedValue({ count: 1 });

      await service.remove(orgId, userId, 'MEMBER', connectionId);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          organizationId: orgId,
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

      await service.create(orgId, userId, {
        type: ConnectionType.API_KEY,
        provider: 'openai',
        name: 'My OpenAI',
        config: { apiKey: 'sk-abc' },
      });

      expect(crypto.encrypt).toHaveBeenCalledWith(JSON.stringify({ apiKey: 'sk-abc' }));
      expect(prisma.connection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: orgId,
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

      await service.create(orgId, userId, {
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

      await service.create(orgId, userId, {
        type: ConnectionType.API_KEY,
        provider: 'openai',
        name: 'My OpenAI',
        config: { apiKey: 'sk-abc' },
      });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          organizationId: orgId,
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

  describe('test', () => {
    const fullRow = {
      ...baseRow,
      configEncrypted: 'CFG_C',
      configNonce: 'CFG_N',
      refreshTokenEncrypted: null,
      refreshTokenNonce: null,
    };

    it('should look up the connection scoped to the active organizationId (IDOR)', async () => {
      prisma.connection.findFirst.mockResolvedValue(fullRow);
      crypto.decrypt.mockReturnValue(JSON.stringify({ apiKey: 'sk-abc' }));
      mockChecker.check.mockResolvedValue({ ok: true, latencyMs: 50 });

      await service.test(orgId, userId, connectionId);

      expect(prisma.connection.findFirst).toHaveBeenCalledWith({
        where: { id: connectionId, organizationId: orgId },
      });
    });

    it('should throw NotFoundException when the connection belongs to another org', async () => {
      prisma.connection.findFirst.mockResolvedValue(null);

      await expect(service.test(otherOrgId, userId, connectionId)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockChecker.check).not.toHaveBeenCalled();
    });

    it('should decrypt the config and dispatch to the registered checker', async () => {
      prisma.connection.findFirst.mockResolvedValue({ ...fullRow, provider: 'openai' });
      crypto.decrypt.mockReturnValue(JSON.stringify({ apiKey: 'sk-abc' }));
      mockChecker.check.mockResolvedValue({ ok: true, latencyMs: 100 });

      await service.test(orgId, userId, connectionId);

      expect(healthRegistry.get).toHaveBeenCalledWith('openai');
      expect(crypto.decrypt).toHaveBeenCalledWith('CFG_C', 'CFG_N');
      expect(mockChecker.check).toHaveBeenCalledWith({ apiKey: 'sk-abc' }, expect.any(AbortSignal));
    });

    it('should update lastUsedAt only when the check succeeds', async () => {
      prisma.connection.findFirst.mockResolvedValue(fullRow);
      crypto.decrypt.mockReturnValue(JSON.stringify({ apiKey: 'sk-abc' }));
      mockChecker.check.mockResolvedValue({ ok: true, latencyMs: 50 });
      prisma.connection.update.mockResolvedValue(fullRow);

      await service.test(orgId, userId, connectionId);

      expect(prisma.connection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: connectionId },
          data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
        }),
      );
    });

    it('should NOT update lastUsedAt when the check fails', async () => {
      prisma.connection.findFirst.mockResolvedValue(fullRow);
      crypto.decrypt.mockReturnValue(JSON.stringify({ apiKey: 'sk-bad' }));
      mockChecker.check.mockResolvedValue({ ok: false, message: 'unauthorized', latencyMs: 50 });

      await service.test(orgId, userId, connectionId);

      expect(prisma.connection.update).not.toHaveBeenCalled();
    });

    it('should NOT mutate Connection.status (read-only health check)', async () => {
      prisma.connection.findFirst.mockResolvedValue(fullRow);
      crypto.decrypt.mockReturnValue(JSON.stringify({ apiKey: 'sk-bad' }));
      mockChecker.check.mockResolvedValue({ ok: false, message: 'unauthorized', latencyMs: 50 });

      await service.test(orgId, userId, connectionId);

      const updateCalls = prisma.connection.update.mock.calls;
      for (const call of updateCalls) {
        expect(call[0].data).not.toHaveProperty('status');
      }
    });

    it('should NOT write to AuditLog (high-frequency, low-signal)', async () => {
      prisma.connection.findFirst.mockResolvedValue(fullRow);
      crypto.decrypt.mockReturnValue(JSON.stringify({ apiKey: 'sk-abc' }));
      mockChecker.check.mockResolvedValue({ ok: true, latencyMs: 50 });
      audit.log.mockClear();

      await service.test(orgId, userId, connectionId);

      expect(audit.log).not.toHaveBeenCalled();
    });

    it('should return the checker result verbatim', async () => {
      prisma.connection.findFirst.mockResolvedValue(fullRow);
      crypto.decrypt.mockReturnValue(JSON.stringify({ apiKey: 'sk-abc' }));
      mockChecker.check.mockResolvedValue({ ok: false, message: 'rate limited', latencyMs: 30 });

      const result = await service.test(orgId, userId, connectionId);

      expect(result).toEqual({ ok: false, message: 'rate limited', latencyMs: 30 });
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

  describe('listOllamaModels', () => {
    const realFetch = global.fetch;
    const prevAllow = process.env.SSRF_ALLOWED_HOSTS;
    beforeEach(() => {
      process.env.SSRF_ALLOWED_HOSTS = 'localhost,127.0.0.1';
    });
    afterEach(() => {
      global.fetch = realFetch;
      if (prevAllow === undefined) delete process.env.SSRF_ALLOWED_HOSTS;
      else process.env.SSRF_ALLOWED_HOSTS = prevAllow;
    });

    it('resolves a saved connection baseUrl, fetches /api/tags, and returns sorted unique names', async () => {
      prisma.connection.findFirst.mockResolvedValue({
        id: connectionId,
        provider: 'ollama',
        configEncrypted: 'enc',
        configNonce: 'nonce',
      });
      crypto.decrypt.mockReturnValue(JSON.stringify({ baseUrl: 'http://localhost:11434/' }));
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [{ name: 'qwen2.5:7b' }, { name: 'llama3.1:8b' }, { name: 'qwen2.5:7b' }],
        }),
      }) as unknown as typeof fetch;

      const result = await service.listOllamaModels(orgId, { connectionId });

      expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('http://localhost:11434/api/tags');
      expect(result).toEqual({ models: ['llama3.1:8b', 'qwen2.5:7b'], reachable: true });
    });

    it('uses an ad-hoc baseUrl when no connectionId is given', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{ name: 'mistral:7b' }] }),
      }) as unknown as typeof fetch;

      const result = await service.listOllamaModels(orgId, { baseUrl: 'http://127.0.0.1:11434' });

      expect(result).toEqual({ models: ['mistral:7b'], reachable: true });
      expect(prisma.connection.findFirst).not.toHaveBeenCalled();
    });

    it('returns reachable:false when the server is unreachable', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
      const result = await service.listOllamaModels(orgId, { baseUrl: 'http://127.0.0.1:11434' });
      expect(result).toEqual({ models: [], reachable: false });
    });

    it('returns reachable:false when the host is SSRF-blocked (not allowlisted)', async () => {
      delete process.env.SSRF_ALLOWED_HOSTS;
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;
      const result = await service.listOllamaModels(orgId, { baseUrl: 'http://127.0.0.1:11434' });
      expect(result).toEqual({ models: [], reachable: false });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects when neither connectionId nor baseUrl is provided', async () => {
      await expect(service.listOllamaModels(orgId, {})).rejects.toThrow();
    });
  });

  describe('openOllamaPull', () => {
    const realFetch = global.fetch;
    const prevAllow = process.env.SSRF_ALLOWED_HOSTS;
    beforeEach(() => {
      process.env.SSRF_ALLOWED_HOSTS = 'localhost,127.0.0.1';
    });
    afterEach(() => {
      global.fetch = realFetch;
      if (prevAllow === undefined) delete process.env.SSRF_ALLOWED_HOSTS;
      else process.env.SSRF_ALLOWED_HOSTS = prevAllow;
    });

    it('POSTs /api/pull with stream:true and the model name', async () => {
      const fakeRes = { ok: true, body: {} };
      global.fetch = jest.fn().mockResolvedValue(fakeRes) as unknown as typeof fetch;

      const res = await service.openOllamaPull(orgId, {
        baseUrl: 'http://127.0.0.1:11434',
        model: 'qwen2.5:7b',
      });

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe('http://127.0.0.1:11434/api/pull');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ name: 'qwen2.5:7b', stream: true });
      expect(res).toBe(fakeRes);
    });

    it('throws BadRequest when the host is SSRF-blocked (not allowlisted)', async () => {
      delete process.env.SSRF_ALLOWED_HOSTS;
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;
      await expect(
        service.openOllamaPull(orgId, { baseUrl: 'http://10.0.0.5:11434', model: 'x' }),
      ).rejects.toThrow();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('hosted Ollama (OLLAMA_SERVER_BASE_URL)', () => {
    const prevServer = process.env.OLLAMA_SERVER_BASE_URL;
    afterEach(() => {
      if (prevServer === undefined) delete process.env.OLLAMA_SERVER_BASE_URL;
      else process.env.OLLAMA_SERVER_BASE_URL = prevServer;
    });

    it('reports availability based on the env var (trailing slash trimmed)', () => {
      delete process.env.OLLAMA_SERVER_BASE_URL;
      expect(service.ollamaServerBaseUrl()).toBeNull();
      process.env.OLLAMA_SERVER_BASE_URL = 'http://ollama:11434/';
      expect(service.ollamaServerBaseUrl()).toBe('http://ollama:11434');
    });

    it('resolveOllamaBaseUrl returns the server URL in hosted mode', async () => {
      process.env.OLLAMA_SERVER_BASE_URL = 'http://ollama:11434';
      const base = await service.resolveOllamaBaseUrl(orgId, { ollamaServerHosted: true });
      expect(base).toBe('http://ollama:11434');
      expect(prisma.connection.findFirst).not.toHaveBeenCalled();
    });

    it('rejects hosted mode when OLLAMA_SERVER_BASE_URL is unset', async () => {
      delete process.env.OLLAMA_SERVER_BASE_URL;
      await expect(
        service.resolveOllamaBaseUrl(orgId, { ollamaServerHosted: true }),
      ).rejects.toThrow(BadRequestException);
    });

    it('injects the server baseUrl on a hosted-mode config edit (client sends only model)', async () => {
      process.env.OLLAMA_SERVER_BASE_URL = 'http://ollama:11434';
      prisma.connection.findFirst.mockResolvedValue({
        id: connectionId,
        userId,
        type: ConnectionType.CUSTOM,
        provider: 'ollama',
      });
      crypto.encrypt.mockReturnValue({ ciphertext: 'C', nonce: 'N' });
      prisma.connection.update.mockResolvedValue(baseRow);

      await service.update(orgId, userId, 'MEMBER', connectionId, {
        config: { model: 'llama3.1:8b' },
        ollamaServerHosted: true,
      });

      expect(crypto.encrypt).toHaveBeenCalledWith(
        JSON.stringify({ baseUrl: 'http://ollama:11434', model: 'llama3.1:8b' }),
      );
    });
  });
});
