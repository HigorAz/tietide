import type { ConnectionProvider } from '@tietide/shared';

export interface AuthorizeUrlArgs {
  state: string;
  scopes: readonly string[];
  redirectUri: string;
  /** PKCE code challenge (base64url SHA-256 of the verifier), method S256. */
  codeChallenge?: string;
}

export interface ExchangeCodeArgs {
  code: string;
  redirectUri: string;
  /** PKCE code verifier, sent to prove possession of the challenge. */
  codeVerifier?: string;
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
