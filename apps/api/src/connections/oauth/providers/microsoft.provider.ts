import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  ConnectionProvider,
  microsoftOAuth2ConfigSchema,
  type MicrosoftOAuth2Config,
} from '@tietide/shared';
import { BaseOAuthProvider } from './base-oauth.provider';
import type {
  AuthorizeUrlArgs,
  ExchangeCodeArgs,
  OAuthProvider,
  TokenExchangeResult,
} from './oauth-provider.interface';

const AUTHORIZE_URL_TEMPLATE = 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize';
const TOKEN_URL_TEMPLATE = 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token';

const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'offline_access'] as const;

const ALLOWED_SCOPES = new Set([
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  'Mail.Read',
  'Mail.ReadWrite',
  'Mail.Send',
  'Calendars.Read',
  'Calendars.ReadWrite',
  'Files.Read',
  'Files.ReadWrite',
]);

interface MicrosoftTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  token_type?: unknown;
}

@Injectable()
export class MicrosoftOAuthProvider extends BaseOAuthProvider implements OAuthProvider {
  readonly id = ConnectionProvider.MICROSOFT;
  readonly displayName = 'Microsoft';
  readonly defaultScopes: readonly string[] = DEFAULT_SCOPES;
  readonly allowedScopes: ReadonlySet<string> = ALLOWED_SCOPES;

  redirectUri(): string {
    return this.env('MS_OAUTH_REDIRECT_URI');
  }

  buildAuthorizeUrl(args: AuthorizeUrlArgs): string {
    const params = new URLSearchParams({
      client_id: this.env('MS_OAUTH_CLIENT_ID'),
      redirect_uri: args.redirectUri,
      response_type: 'code',
      response_mode: 'query',
      scope: args.scopes.join(' '),
      state: args.state,
    });
    if (args.codeChallenge) {
      params.set('code_challenge', args.codeChallenge);
      params.set('code_challenge_method', 'S256');
    }
    return `${this.authorizeUrl()}?${params.toString()}`;
  }

  async exchangeCode(args: ExchangeCodeArgs): Promise<TokenExchangeResult> {
    const raw = (await this.postForm(this.tokenUrl(), {
      grant_type: 'authorization_code',
      code: args.code,
      redirect_uri: args.redirectUri,
      client_id: this.env('MS_OAUTH_CLIENT_ID'),
      client_secret: this.env('MS_OAUTH_CLIENT_SECRET'),
      ...(args.codeVerifier ? { code_verifier: args.codeVerifier } : {}),
    })) as MicrosoftTokenResponse;

    return this.toTokenResult(raw, null);
  }

  async refresh(args: {
    refreshToken: string;
    currentConfig: Record<string, unknown>;
  }): Promise<TokenExchangeResult> {
    const raw = (await this.postForm(this.tokenUrl(), {
      grant_type: 'refresh_token',
      refresh_token: args.refreshToken,
      client_id: this.env('MS_OAUTH_CLIENT_ID'),
      client_secret: this.env('MS_OAUTH_CLIENT_SECRET'),
    })) as MicrosoftTokenResponse;

    return this.toTokenResult(raw, args.refreshToken, args.currentConfig);
  }

  private tenant(): string {
    return this.envOptional('MS_OAUTH_TENANT', 'common');
  }

  private authorizeUrl(): string {
    return AUTHORIZE_URL_TEMPLATE.replace('{tenant}', this.tenant());
  }

  private tokenUrl(): string {
    const override = this.config.get<string>('MS_OAUTH_TOKEN_URL');
    if (override) return override;
    return TOKEN_URL_TEMPLATE.replace('{tenant}', this.tenant());
  }

  private toTokenResult(
    raw: MicrosoftTokenResponse,
    fallbackRefreshToken: string | null,
    currentConfig?: Record<string, unknown>,
  ): TokenExchangeResult {
    const accessToken = raw.access_token;
    const tokenType = raw.token_type;
    if (typeof accessToken !== 'string' || typeof tokenType !== 'string') {
      throw new InternalServerErrorException('Microsoft token response missing access_token');
    }

    const refreshToken =
      typeof raw.refresh_token === 'string' && raw.refresh_token.length > 0
        ? raw.refresh_token
        : fallbackRefreshToken;
    if (refreshToken === null) {
      throw new InternalServerErrorException(
        'Microsoft token response missing refresh_token (request offline_access scope?)',
      );
    }

    const scope =
      typeof raw.scope === 'string' ? raw.scope : ((currentConfig?.scope as string) ?? '');
    const expiresIn = typeof raw.expires_in === 'number' ? raw.expires_in : null;

    const tenantId = this.tenant();
    const config: MicrosoftOAuth2Config = microsoftOAuth2ConfigSchema.parse({
      accessToken,
      refreshToken,
      scope,
      tokenType,
      tenantId,
    });

    return {
      config,
      refreshToken,
      expiresAt: this.expiresAtFromSeconds(expiresIn),
    };
  }
}
