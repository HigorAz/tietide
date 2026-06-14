import { InternalServerErrorException } from '@nestjs/common';
import { BaseOAuthProvider } from './base-oauth.provider';
import type {
  AuthorizeUrlArgs,
  ExchangeCodeArgs,
  OAuthProvider,
  TokenExchangeResult,
} from './oauth-provider.interface';

interface MetaTokenResponse {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  scope?: unknown;
}

/**
 * Shared Facebook Login (Meta Graph API) OAuth flow. Instagram and WhatsApp are
 * backed by the same Meta app and identical endpoints — only the requested
 * permission scopes and the stored config shape differ — so both concrete
 * providers extend this base and read the SAME `META_OAUTH_*` env vars.
 *
 * Flow: authorization_code → short-lived user token → `fb_exchange_token` →
 * long-lived (~60-day) token. Meta issues no refresh token, so we store
 * `refreshToken: null` and re-exchange the long-lived token in `refresh()`.
 */
export abstract class MetaOAuthProvider extends BaseOAuthProvider implements OAuthProvider {
  abstract readonly id: OAuthProvider['id'];
  abstract readonly displayName: string;
  abstract readonly defaultScopes: readonly string[];
  abstract readonly allowedScopes: ReadonlySet<string>;

  // Subclass turns a token (+ granted scope) into its provider-specific,
  // schema-validated config object.
  protected abstract buildConfig(accessToken: string, scope: string | undefined): object;

  redirectUri(): string {
    return this.env('META_OAUTH_REDIRECT_URI');
  }

  buildAuthorizeUrl(args: AuthorizeUrlArgs): string {
    const params = new URLSearchParams({
      client_id: this.env('META_OAUTH_CLIENT_ID'),
      redirect_uri: args.redirectUri,
      scope: args.scopes.join(','),
      state: args.state,
      response_type: 'code',
    });
    if (args.codeChallenge) {
      params.set('code_challenge', args.codeChallenge);
      params.set('code_challenge_method', 'S256');
    }
    return `${this.authorizeUrl()}?${params.toString()}`;
  }

  async exchangeCode(args: ExchangeCodeArgs): Promise<TokenExchangeResult> {
    const short = (await this.postForm(this.tokenUrl(), {
      grant_type: 'authorization_code',
      client_id: this.env('META_OAUTH_CLIENT_ID'),
      client_secret: this.env('META_OAUTH_CLIENT_SECRET'),
      redirect_uri: args.redirectUri,
      code: args.code,
      ...(args.codeVerifier ? { code_verifier: args.codeVerifier } : {}),
    })) as MetaTokenResponse;

    const shortToken = short.access_token;
    if (typeof shortToken !== 'string' || shortToken.length === 0) {
      throw new InternalServerErrorException('Meta token response missing access_token');
    }

    const long = await this.exchangeForLongLived(shortToken);
    const accessToken = long.access_token ?? shortToken;
    const expiresIn = long.expires_in ?? short.expires_in;
    const scope = typeof short.scope === 'string' ? short.scope : undefined;

    return {
      config: this.buildConfig(accessToken, scope),
      refreshToken: null,
      expiresAt: this.expiresAtFromSeconds(typeof expiresIn === 'number' ? expiresIn : undefined),
    };
  }

  async refresh(args: {
    refreshToken: string;
    currentConfig: Record<string, unknown>;
  }): Promise<TokenExchangeResult> {
    // Meta has no refresh token — re-exchange the stored long-lived token for a
    // fresh long-lived one before it expires.
    const current =
      typeof args.currentConfig.accessToken === 'string' ? args.currentConfig.accessToken : '';
    if (current.length === 0) {
      throw new InternalServerErrorException('Meta connection has no access token to refresh');
    }
    const long = await this.exchangeForLongLived(current);
    const accessToken = long.access_token;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new InternalServerErrorException('Meta refresh response missing access_token');
    }
    const scope =
      typeof args.currentConfig.scope === 'string' ? args.currentConfig.scope : undefined;
    return {
      config: this.buildConfig(accessToken, scope),
      refreshToken: null,
      expiresAt: this.expiresAtFromSeconds(
        typeof long.expires_in === 'number' ? long.expires_in : undefined,
      ),
    };
  }

  // POST the fb_exchange_token grant. On any failure we degrade to the caller's
  // original token rather than aborting the connect (some app types already
  // return a long-lived token from the code exchange).
  private async exchangeForLongLived(
    token: string,
  ): Promise<{ access_token?: string; expires_in?: number }> {
    try {
      const res = (await this.postForm(this.tokenUrl(), {
        grant_type: 'fb_exchange_token',
        client_id: this.env('META_OAUTH_CLIENT_ID'),
        client_secret: this.env('META_OAUTH_CLIENT_SECRET'),
        fb_exchange_token: token,
      })) as MetaTokenResponse;
      return {
        access_token: typeof res.access_token === 'string' ? res.access_token : undefined,
        expires_in: typeof res.expires_in === 'number' ? res.expires_in : undefined,
      };
    } catch {
      return {};
    }
  }

  private apiVersion(): string {
    return this.envOptional('META_GRAPH_API_VERSION', 'v20.0');
  }

  private authorizeUrl(): string {
    return this.envOptional(
      'META_OAUTH_AUTHORIZE_URL',
      `https://www.facebook.com/${this.apiVersion()}/dialog/oauth`,
    );
  }

  private tokenUrl(): string {
    return this.envOptional(
      'META_OAUTH_TOKEN_URL',
      `https://graph.facebook.com/${this.apiVersion()}/oauth/access_token`,
    );
  }
}
