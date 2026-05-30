import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  ConnectionProvider,
  slackOAuth2ConfigSchema,
  type SlackOAuth2Config,
} from '@tietide/shared';
import { BaseOAuthProvider } from './base-oauth.provider';
import type {
  AuthorizeUrlArgs,
  ExchangeCodeArgs,
  OAuthProvider,
  TokenExchangeResult,
} from './oauth-provider.interface';

const AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const TOKEN_URL_DEFAULT = 'https://slack.com/api/oauth.v2.access';

const DEFAULT_SCOPES = ['chat:write', 'channels:read'] as const;

// Allowed scopes — kept in lockstep with the bot scopes the connector pack
// actually uses. Trigger pack additions: app_mentions:read (slack-message-received
// when used as @-mention), chat:write.public (post in channels the bot is not in),
// mpim:history/mpim:read (group DM coverage for slack-message-received).
const ALLOWED_SCOPES = new Set([
  'chat:write',
  'chat:write.public',
  'channels:read',
  'channels:history',
  'channels:manage',
  'groups:read',
  'groups:history',
  'im:read',
  'im:history',
  'mpim:read',
  'mpim:history',
  'users:read',
  'users:read.email',
  'files:read',
  'files:write',
  'reactions:read',
  'reactions:write',
  'app_mentions:read',
  // User-token scope (granted to authed_user, not the bot). search.messages
  // requires a user token, so search:read is requested via Slack's user_scope.
  'search:read',
]);

// Scopes that must be requested as Slack `user_scope` (granted to the installing
// user, returning an xoxp user token) rather than bot `scope`. buildAuthorizeUrl
// partitions the requested scopes accordingly.
const USER_SCOPES = new Set(['search:read']);

interface SlackTokenResponse {
  ok?: unknown;
  error?: unknown;
  access_token?: unknown;
  scope?: unknown;
  bot_user_id?: unknown;
  team?: { id?: unknown };
  authed_user?: { id?: unknown; access_token?: unknown; scope?: unknown };
}

@Injectable()
export class SlackOAuthProvider extends BaseOAuthProvider implements OAuthProvider {
  readonly id = ConnectionProvider.SLACK;
  readonly displayName = 'Slack';
  readonly defaultScopes: readonly string[] = DEFAULT_SCOPES;
  readonly allowedScopes: ReadonlySet<string> = ALLOWED_SCOPES;

  redirectUri(): string {
    return this.env('SLACK_OAUTH_REDIRECT_URI');
  }

  buildAuthorizeUrl(args: AuthorizeUrlArgs): string {
    // Slack v2 separates bot scopes (`scope`) from user scopes (`user_scope`).
    // Partition the requested scopes so search:read lands on user_scope.
    const botScopes = args.scopes.filter((s) => !USER_SCOPES.has(s));
    const userScopes = args.scopes.filter((s) => USER_SCOPES.has(s));
    const params = new URLSearchParams({
      client_id: this.env('SLACK_OAUTH_CLIENT_ID'),
      scope: botScopes.join(','),
      redirect_uri: args.redirectUri,
      state: args.state,
    });
    // Only request a user token when a user scope was selected, so the consent
    // screen is unchanged for bot-only connections.
    if (userScopes.length > 0) {
      params.set('user_scope', userScopes.join(','));
    }
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
      client_id: this.env('SLACK_OAUTH_CLIENT_ID'),
      client_secret: this.env('SLACK_OAUTH_CLIENT_SECRET'),
      ...(args.codeVerifier ? { code_verifier: args.codeVerifier } : {}),
    })) as SlackTokenResponse;

    if (raw.ok === false) {
      const code = typeof raw.error === 'string' ? raw.error : 'slack_error';
      throw new InternalServerErrorException(`Slack OAuth error: ${code}`);
    }

    const accessToken = raw.access_token;
    const teamId = raw.team?.id;
    const botUserId = raw.bot_user_id;
    if (
      typeof accessToken !== 'string' ||
      typeof teamId !== 'string' ||
      typeof botUserId !== 'string'
    ) {
      throw new InternalServerErrorException('Slack token response missing required fields');
    }

    // Slack returns authed_user.access_token (xoxp) only when user_scope was
    // requested. Capture it so slack-search-messages can call search.messages.
    const authedUser = raw.authed_user;
    const userAccessToken =
      authedUser && typeof authedUser.access_token === 'string'
        ? authedUser.access_token
        : undefined;
    const userScope =
      authedUser && typeof authedUser.scope === 'string' ? authedUser.scope : undefined;

    const config: SlackOAuth2Config = slackOAuth2ConfigSchema.parse({
      accessToken,
      teamId,
      botUserId,
      scope: typeof raw.scope === 'string' ? raw.scope : '',
      ...(userAccessToken ? { userAccessToken } : {}),
      ...(userScope ? { userScope } : {}),
    });

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
      'Slack tokens do not expire by default and are not refreshable from this client',
    );
  }

  private tokenUrl(): string {
    return this.envOptional('SLACK_OAUTH_TOKEN_URL', TOKEN_URL_DEFAULT);
  }
}
