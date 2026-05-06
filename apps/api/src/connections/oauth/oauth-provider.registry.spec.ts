import { BadRequestException } from '@nestjs/common';
import { OAuthProviderRegistry } from './oauth-provider.registry';
import type { OAuthProvider } from './providers/oauth-provider.interface';

function makeProvider(id: string): OAuthProvider {
  return {
    id: id as OAuthProvider['id'],
    displayName: id,
    defaultScopes: [],
    allowedScopes: new Set(),
    redirectUri: () => `http://example.com/${id}`,
    buildAuthorizeUrl: () => `http://example.com/${id}/authz`,
    exchangeCode: jest.fn(),
    refresh: jest.fn(),
  } as unknown as OAuthProvider;
}

describe('OAuthProviderRegistry', () => {
  let registry: OAuthProviderRegistry;

  beforeEach(() => {
    registry = new OAuthProviderRegistry(
      makeProvider('google') as never,
      makeProvider('microsoft') as never,
      makeProvider('slack') as never,
      makeProvider('notion') as never,
    );
  });

  it('returns the matching provider for a known id', () => {
    expect(registry.get('google').id).toBe('google');
    expect(registry.get('microsoft').id).toBe('microsoft');
    expect(registry.get('slack').id).toBe('slack');
    expect(registry.get('notion').id).toBe('notion');
  });

  it('throws BadRequestException for an unknown provider', () => {
    expect(() => registry.get('github')).toThrow(BadRequestException);
  });

  it('list() returns all registered providers', () => {
    expect(
      registry
        .list()
        .map((p) => p.id)
        .sort(),
    ).toEqual(['google', 'microsoft', 'notion', 'slack']);
  });
});
