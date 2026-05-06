import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  ConnectionProvider,
  notionOAuth2ConfigSchema,
  type NotionOAuth2Config,
} from '@tietide/shared';
import { BaseOAuthProvider } from './base-oauth.provider';
import type {
  AuthorizeUrlArgs,
  ExchangeCodeArgs,
  OAuthProvider,
  TokenExchangeResult,
} from './oauth-provider.interface';

const AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize';
const TOKEN_URL_DEFAULT = 'https://api.notion.com/v1/oauth/token';

const DEFAULT_SCOPES: readonly string[] = [];
const ALLOWED_SCOPES = new Set<string>();

interface NotionTokenResponse {
  access_token?: unknown;
  workspace_id?: unknown;
  workspace_name?: unknown;
  bot_id?: unknown;
}

@Injectable()
export class NotionOAuthProvider extends BaseOAuthProvider implements OAuthProvider {
  readonly id = ConnectionProvider.NOTION;
  readonly displayName = 'Notion';
  readonly defaultScopes: readonly string[] = DEFAULT_SCOPES;
  readonly allowedScopes: ReadonlySet<string> = ALLOWED_SCOPES;

  redirectUri(): string {
    return this.env('NOTION_OAUTH_REDIRECT_URI');
  }

  buildAuthorizeUrl(args: AuthorizeUrlArgs): string {
    const params = new URLSearchParams({
      client_id: this.env('NOTION_OAUTH_CLIENT_ID'),
      response_type: 'code',
      owner: 'user',
      redirect_uri: args.redirectUri,
      state: args.state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCode(args: ExchangeCodeArgs): Promise<TokenExchangeResult> {
    const basic = Buffer.from(
      `${this.env('NOTION_OAUTH_CLIENT_ID')}:${this.env('NOTION_OAUTH_CLIENT_SECRET')}`,
    ).toString('base64');

    const raw = (await this.postJson(
      this.tokenUrl(),
      {
        grant_type: 'authorization_code',
        code: args.code,
        redirect_uri: args.redirectUri,
      },
      { Authorization: `Basic ${basic}` },
    )) as NotionTokenResponse;

    const accessToken = raw.access_token;
    const workspaceId = raw.workspace_id;
    if (typeof accessToken !== 'string' || typeof workspaceId !== 'string') {
      throw new InternalServerErrorException('Notion token response missing required fields');
    }

    const config: NotionOAuth2Config = notionOAuth2ConfigSchema.parse({
      accessToken,
      workspaceId,
      workspaceName: typeof raw.workspace_name === 'string' ? raw.workspace_name : undefined,
      botId: typeof raw.bot_id === 'string' ? raw.bot_id : undefined,
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
      'Notion tokens do not expire and are not refreshable from this client',
    );
  }

  private tokenUrl(): string {
    return this.envOptional('NOTION_OAUTH_TOKEN_URL', TOKEN_URL_DEFAULT);
  }
}
