import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  ConnectionProvider,
  githubOAuth2ConfigSchema,
  type GitHubOAuth2Config,
} from '@tietide/shared';
import { BaseOAuthProvider } from './base-oauth.provider';
import type {
  AuthorizeUrlArgs,
  ExchangeCodeArgs,
  OAuthProvider,
  TokenExchangeResult,
} from './oauth-provider.interface';

const AUTHORIZE_URL_DEFAULT = 'https://github.com/login/oauth/authorize';
const TOKEN_URL_DEFAULT = 'https://github.com/login/oauth/access_token';

// `repo` grants read/write on issues, pull requests, and comments across the
// user's public + private repositories — the surface our three GitHub actions
// need. `read:user` backs the /user health check. `public_repo` is offered as a
// narrower opt-in (public repositories only).
const DEFAULT_SCOPES = ['repo', 'read:user'] as const;

const ALLOWED_SCOPES = new Set(['repo', 'public_repo', 'read:user']);

interface GithubTokenResponse {
  access_token?: unknown;
  scope?: unknown;
  token_type?: unknown;
}

@Injectable()
export class GithubOAuthProvider extends BaseOAuthProvider implements OAuthProvider {
  readonly id = ConnectionProvider.GITHUB;
  readonly displayName = 'GitHub';
  readonly defaultScopes: readonly string[] = DEFAULT_SCOPES;
  readonly allowedScopes: ReadonlySet<string> = ALLOWED_SCOPES;

  redirectUri(): string {
    return this.env('GITHUB_OAUTH_REDIRECT_URI');
  }

  buildAuthorizeUrl(args: AuthorizeUrlArgs): string {
    const params = new URLSearchParams({
      client_id: this.env('GITHUB_OAUTH_CLIENT_ID'),
      redirect_uri: args.redirectUri,
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
    // BaseOAuthProvider.postForm sends `Accept: application/json`, so GitHub
    // returns JSON rather than its default form-encoded body.
    const raw = (await this.postForm(this.tokenUrl(), {
      grant_type: 'authorization_code',
      code: args.code,
      redirect_uri: args.redirectUri,
      client_id: this.env('GITHUB_OAUTH_CLIENT_ID'),
      client_secret: this.env('GITHUB_OAUTH_CLIENT_SECRET'),
      ...(args.codeVerifier ? { code_verifier: args.codeVerifier } : {}),
    })) as GithubTokenResponse;

    const accessToken = raw.access_token;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new InternalServerErrorException('GitHub token response missing access_token');
    }

    const config: GitHubOAuth2Config = githubOAuth2ConfigSchema.parse({
      accessToken,
      scope: typeof raw.scope === 'string' ? raw.scope : undefined,
      tokenType: typeof raw.token_type === 'string' ? raw.token_type : 'bearer',
    });

    // OAuth App tokens are non-expiring and carry no refresh token.
    return {
      config,
      refreshToken: null,
      expiresAt: null,
    };
  }

  async refresh(_args: {
    refreshToken: string;
    currentConfig: Record<string, unknown>;
  }): Promise<TokenExchangeResult> {
    void _args;
    throw new InternalServerErrorException(
      'GitHub OAuth App tokens do not expire and are not refreshable; reconnect to obtain a new token',
    );
  }

  private authorizeUrl(): string {
    return this.envOptional('GITHUB_OAUTH_AUTHORIZE_URL', AUTHORIZE_URL_DEFAULT);
  }

  private tokenUrl(): string {
    return this.envOptional('GITHUB_OAUTH_TOKEN_URL', TOKEN_URL_DEFAULT);
  }
}
