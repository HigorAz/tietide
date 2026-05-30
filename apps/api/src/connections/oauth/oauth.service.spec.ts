import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ConnectionType } from '@tietide/shared';
import { OAuthCallbackError, OAuthService, type OAuthCallbackInput } from './oauth.service';
import type { OAuthProviderRegistry } from './oauth-provider.registry';
import type { OAuthStateService, OAuthStatePayload } from './oauth-state.service';
import type { ConnectionsService } from '../connections.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OAuthProvider } from './providers/oauth-provider.interface';

const USER_ID = '00000000-0000-4000-8000-000000000001';

function makeProvider(overrides: Partial<OAuthProvider> = {}): OAuthProvider {
  return {
    id: 'google',
    displayName: 'Google',
    defaultScopes: ['openid', 'email'],
    allowedScopes: new Set(['openid', 'email', 'profile']),
    redirectUri: () => 'http://localhost:3030/cb?provider=google',
    buildAuthorizeUrl: () => 'http://provider.example/authorize',
    exchangeCode: jest.fn().mockResolvedValue({
      config: {
        accessToken: 'a',
        refreshToken: 'r',
        scope: 'openid email',
        tokenType: 'Bearer',
      },
      refreshToken: 'r',
      expiresAt: new Date('2026-12-01T00:00:00Z'),
    }),
    refresh: jest.fn(),
    ...overrides,
  } as unknown as OAuthProvider;
}

function makeService(opts: {
  provider?: OAuthProvider;
  stateVerify?: jest.Mock;
  stateSign?: jest.Mock;
  connectionsCreate?: jest.Mock;
  spaBaseUrl?: string;
  stateUpdateMany?: jest.Mock;
  stateFindUnique?: jest.Mock;
}) {
  const provider = opts.provider ?? makeProvider();
  const registry = {
    get: jest.fn((id: string) => {
      if (id !== provider.id) {
        throw new BadRequestException(`Unknown provider: ${id}`);
      }
      return provider;
    }),
    list: () => [provider],
  } as unknown as OAuthProviderRegistry;

  const state = {
    sign: opts.stateSign ?? jest.fn().mockResolvedValue('signed.jwt.token'),
    verify:
      opts.stateVerify ??
      jest.fn().mockResolvedValue({
        userId: USER_ID,
        provider: provider.id,
        scopes: ['openid', 'email'],
        label: 'My Label',
        nonce: 'abc',
      } satisfies OAuthStatePayload),
  } as unknown as OAuthStateService;

  const connections = {
    create:
      opts.connectionsCreate ??
      jest.fn().mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        type: ConnectionType.OAUTH2,
        provider: provider.id,
        name: 'My Label',
        status: 'ACTIVE',
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
  } as unknown as ConnectionsService;

  const config = {
    get: jest.fn(() => opts.spaBaseUrl ?? 'http://localhost:5173'),
    getOrThrow: jest.fn(() => opts.spaBaseUrl ?? 'http://localhost:5173'),
  } as unknown as ConfigService;

  const prisma = {
    oAuthState: {
      create: jest.fn().mockResolvedValue({}),
      updateMany: opts.stateUpdateMany ?? jest.fn().mockResolvedValue({ count: 1 }),
      findUnique:
        opts.stateFindUnique ??
        jest.fn().mockResolvedValue({
          jti: 'abc',
          userId: USER_ID,
          provider: provider.id,
          codeVerifier: 'verifier-xyz',
        }),
    },
  } as unknown as PrismaService;

  const service = new OAuthService(registry, state, connections, config, prisma);
  return { service, provider, registry, state, connections, config, prisma };
}

describe('OAuthService', () => {
  describe('start', () => {
    it('returns redirectUrl + state for a known provider', async () => {
      const { service, provider, state } = makeService({});

      const buildSpy = jest.spyOn(provider, 'buildAuthorizeUrl');

      const result = await service.start(USER_ID, {
        provider: 'google',
        scopes: 'openid,email',
        label: 'My Gmail',
      });

      expect(result.redirectUrl).toBe('http://provider.example/authorize');
      expect(result.state).toBe('signed.jwt.token');
      expect(state.sign).toHaveBeenCalledWith({
        userId: USER_ID,
        provider: 'google',
        scopes: ['openid', 'email'],
        label: 'My Gmail',
        nonce: expect.any(String),
      });
      expect(buildSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'signed.jwt.token',
          scopes: ['openid', 'email'],
          redirectUri: provider.redirectUri(),
        }),
      );
    });

    it('falls back to provider defaultScopes when scopes param is omitted', async () => {
      const { service, provider } = makeService({});
      const spy = jest.spyOn(provider, 'buildAuthorizeUrl');

      await service.start(USER_ID, { provider: 'google', label: 'X' });

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ scopes: ['openid', 'email'] }));
    });

    it('throws BadRequest for an unknown provider', async () => {
      const { service } = makeService({});

      await expect(service.start(USER_ID, { provider: 'dropbox', label: 'X' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequest when scopes contain values outside the provider allowlist', async () => {
      const { service } = makeService({});

      await expect(
        service.start(USER_ID, {
          provider: 'google',
          scopes: 'openid,https://mail.google.com/',
          label: 'X',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('handleCallback', () => {
    function callback(overrides: Partial<OAuthCallbackInput> = {}): OAuthCallbackInput {
      return {
        provider: 'google',
        code: 'auth-code',
        state: 'signed-state',
        ...overrides,
      };
    }

    it('exchanges code, persists Connection, and returns the new id', async () => {
      const { service, provider, connections } = makeService({});

      const result = await service.handleCallback(callback());

      expect(result.connectionId).toBe('11111111-1111-4111-8111-111111111111');
      expect(provider.exchangeCode).toHaveBeenCalledWith({
        code: 'auth-code',
        redirectUri: provider.redirectUri(),
        codeVerifier: 'verifier-xyz',
      });
      expect(connections.create).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({
          type: ConnectionType.OAUTH2,
          provider: 'google',
          name: 'My Label',
          refreshToken: 'r',
        }),
      );
    });

    it('resolves the provider from the signed state when the query param is omitted', async () => {
      // Microsoft's redirect URI is query-string-free, so no ?provider= arrives.
      const { service, provider, connections } = makeService({});

      const result = await service.handleCallback(callback({ provider: undefined }));

      expect(result.connectionId).toBe('11111111-1111-4111-8111-111111111111');
      expect(provider.exchangeCode).toHaveBeenCalledWith({
        code: 'auth-code',
        redirectUri: provider.redirectUri(),
        codeVerifier: 'verifier-xyz',
      });
      expect(connections.create).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ provider: 'google' }),
      );
    });

    it('rejects when the state JWT cannot be verified', async () => {
      const { service } = makeService({
        stateVerify: jest.fn().mockRejectedValue(new UnauthorizedException()),
      });

      await expect(service.handleCallback(callback())).rejects.toThrow(BadRequestException);
    });

    it('rejects when the state.provider does not match the query provider', async () => {
      const { service } = makeService({
        stateVerify: jest.fn().mockResolvedValue({
          userId: USER_ID,
          provider: 'slack',
          scopes: [],
          label: 'X',
          nonce: 'n',
        }),
      });

      await expect(service.handleCallback(callback())).rejects.toThrow(BadRequestException);
    });

    it('throws OAuthCallbackError when the provider returns an ?error=... param', async () => {
      const { service } = makeService({});

      await expect(
        service.handleCallback(callback({ code: undefined, error: 'access_denied' })),
      ).rejects.toThrow(OAuthCallbackError);
    });

    it('throws BadRequest when neither code nor error is present', async () => {
      const { service } = makeService({});

      await expect(service.handleCallback(callback({ code: undefined }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when the exchanged config does not validate against the provider schema', async () => {
      const provider = makeProvider({
        exchangeCode: jest.fn().mockResolvedValue({
          config: { accessToken: 'a' },
          refreshToken: 'r',
          expiresAt: null,
        }),
      });
      const { service } = makeService({ provider });

      await expect(service.handleCallback(callback())).rejects.toThrow();
    });

    it('bubbles upstream provider exchange errors', async () => {
      const provider = makeProvider({
        exchangeCode: jest.fn().mockRejectedValue(new Error('boom')),
      });
      const { service } = makeService({ provider });

      await expect(service.handleCallback(callback())).rejects.toThrow('boom');
    });
  });

  describe('successRedirectUrl / errorRedirectUrl', () => {
    it('builds success URL pointing to /connections', () => {
      const { service } = makeService({});
      expect(service.successRedirectUrl('abc')).toBe(
        'http://localhost:5173/connections?status=success&id=abc',
      );
    });

    it('URL-encodes the error message', () => {
      const { service } = makeService({});
      expect(service.errorRedirectUrl('user denied & friends')).toBe(
        'http://localhost:5173/connections?status=error&message=user+denied+%26+friends',
      );
    });

    it('caps very long error messages to avoid abuse', () => {
      const { service } = makeService({});
      const long = 'x'.repeat(500);
      const url = new URL(service.errorRedirectUrl(long));
      expect(url.searchParams.get('message')!.length).toBeLessThanOrEqual(200);
    });
  });
});
