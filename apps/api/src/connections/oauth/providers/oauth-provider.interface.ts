import type { ConnectionProvider } from '@tietide/shared';

export interface AuthorizeUrlArgs {
  state: string;
  scopes: readonly string[];
  redirectUri: string;
}

export interface ExchangeCodeArgs {
  code: string;
  redirectUri: string;
}

export interface TokenExchangeResult {
  config: object;
  refreshToken: string | null;
  expiresAt: Date | null;
}

export interface OAuthProvider {
  readonly id: ConnectionProvider;
  readonly displayName: string;
  readonly defaultScopes: readonly string[];
  readonly allowedScopes: ReadonlySet<string>;
  redirectUri(): string;
  buildAuthorizeUrl(args: AuthorizeUrlArgs): string;
  exchangeCode(args: ExchangeCodeArgs): Promise<TokenExchangeResult>;
  refresh(args: {
    refreshToken: string;
    currentConfig: Record<string, unknown>;
  }): Promise<TokenExchangeResult>;
}
