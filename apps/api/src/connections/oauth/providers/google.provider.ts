import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  ConnectionProvider,
  googleOAuth2ConfigSchema,
  type GoogleOAuth2Config,
} from '@tietide/shared';
import { BaseOAuthProvider } from './base-oauth.provider';
import type {
  AuthorizeUrlArgs,
  ExchangeCodeArgs,
  OAuthProvider,
  TokenExchangeResult,
} from './oauth-provider.interface';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL_DEFAULT = 'https://oauth2.googleapis.com/token';

const DEFAULT_SCOPES = ['openid', 'email', 'profile'] as const;

const ALLOWED_SCOPES = new Set([
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/documents.readonly',
]);

interface GoogleTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  token_type?: unknown;
}

@Injectable()
export class GoogleOAuthProvider extends BaseOAuthProvider implements OAuthProvider {
  readonly id = ConnectionProvider.GOOGLE;
  readonly displayName = 'Google';
  readonly defaultScopes: readonly string[] = DEFAULT_SCOPES;
  readonly allowedScopes: ReadonlySet<string> = ALLOWED_SCOPES;

  redirectUri(): string {
    return this.env('GOOGLE_OAUTH_REDIRECT_URI');
  }

  buildAuthorizeUrl(args: AuthorizeUrlArgs): string {
    const params = new URLSearchParams({
      client_id: this.env('GOOGLE_OAUTH_CLIENT_ID'),
      redirect_uri: args.redirectUri,
      response_type: 'code',
      scope: args.scopes.join(' '),
      state: args.state,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    });
    if (args.codeChallenge) {
      params.set('code_challenge', args.codeChallenge);
      params.set('code_challenge_method', 'S256');
    }
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCode(args: ExchangeCodeArgs): Promise<TokenExchangeResult> {
    const raw = (await this.postForm(this.tokenUrl(), {
      grant_type: 'authorization_code',
      code: args.code,
      redirect_uri: args.redirectUri,
      client_id: this.env('GOOGLE_OAUTH_CLIENT_ID'),
      client_secret: this.env('GOOGLE_OAUTH_CLIENT_SECRET'),
      ...(args.codeVerifier ? { code_verifier: args.codeVerifier } : {}),
    })) as GoogleTokenResponse;

    return this.toTokenResult(raw, null);
  }

  async refresh(args: {
    refreshToken: string;
    currentConfig: Record<string, unknown>;
  }): Promise<TokenExchangeResult> {
    const raw = (await this.postForm(this.tokenUrl(), {
      grant_type: 'refresh_token',
      refresh_token: args.refreshToken,
      client_id: this.env('GOOGLE_OAUTH_CLIENT_ID'),
      client_secret: this.env('GOOGLE_OAUTH_CLIENT_SECRET'),
    })) as GoogleTokenResponse;

    return this.toTokenResult(raw, args.refreshToken, args.currentConfig);
  }

  private tokenUrl(): string {
    return this.envOptional('GOOGLE_OAUTH_TOKEN_URL', TOKEN_URL_DEFAULT);
  }

  private toTokenResult(
    raw: GoogleTokenResponse,
    fallbackRefreshToken: string | null,
    currentConfig?: Record<string, unknown>,
  ): TokenExchangeResult {
    const accessToken = raw.access_token;
    const tokenType = raw.token_type;
    if (typeof accessToken !== 'string' || typeof tokenType !== 'string') {
      throw new InternalServerErrorException('Google token response missing access_token');
    }

    const refreshToken =
      typeof raw.refresh_token === 'string' && raw.refresh_token.length > 0
        ? raw.refresh_token
        : fallbackRefreshToken;
    if (refreshToken === null) {
      throw new InternalServerErrorException(
        'Google token response missing refresh_token (and none provided as fallback)',
      );
    }

    const scope =
      typeof raw.scope === 'string' ? raw.scope : ((currentConfig?.scope as string) ?? '');
    const expiresIn = typeof raw.expires_in === 'number' ? raw.expires_in : null;

    const config: GoogleOAuth2Config = googleOAuth2ConfigSchema.parse({
      accessToken,
      refreshToken,
      scope,
      tokenType,
    });

    return {
      config,
      refreshToken,
      expiresAt: this.expiresAtFromSeconds(expiresIn),
    };
  }
}
