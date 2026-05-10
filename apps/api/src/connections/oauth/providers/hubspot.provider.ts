import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  ConnectionProvider,
  hubspotOAuth2ConfigSchema,
  type HubspotOAuth2Config,
} from '@tietide/shared';
import { BaseOAuthProvider } from './base-oauth.provider';
import type {
  AuthorizeUrlArgs,
  ExchangeCodeArgs,
  OAuthProvider,
  TokenExchangeResult,
} from './oauth-provider.interface';

const AUTHORIZE_URL = 'https://app.hubspot.com/oauth/authorize';
const TOKEN_URL_DEFAULT = 'https://api.hubapi.com/oauth/v1/token';

// Minimum scopes for the HubSpot CRM connector pack:
// - oauth → required for the introspection endpoint that returns the hubId
// - crm.objects.contacts.read/write → create-contact + contact-changed trigger
// - crm.objects.deals.read/write → create-deal action
// - tickets / crm.schemas.* deliberately omitted; user can add scopes later if
//   we expand the connector surface.
const DEFAULT_SCOPES = ['oauth', 'crm.objects.contacts.write', 'crm.objects.deals.write'] as const;

const ALLOWED_SCOPES = new Set([
  'oauth',
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  'crm.objects.deals.read',
  'crm.objects.deals.write',
  'crm.objects.companies.read',
  'crm.objects.companies.write',
  'crm.schemas.contacts.read',
  'crm.schemas.deals.read',
  'webhooks',
]);

interface HubspotTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
  hub_id?: unknown;
}

@Injectable()
export class HubspotOAuthProvider extends BaseOAuthProvider implements OAuthProvider {
  readonly id = ConnectionProvider.HUBSPOT;
  readonly displayName = 'HubSpot';
  readonly defaultScopes: readonly string[] = DEFAULT_SCOPES;
  readonly allowedScopes: ReadonlySet<string> = ALLOWED_SCOPES;

  redirectUri(): string {
    return this.env('HUBSPOT_OAUTH_REDIRECT_URI');
  }

  buildAuthorizeUrl(args: AuthorizeUrlArgs): string {
    const params = new URLSearchParams({
      client_id: this.env('HUBSPOT_OAUTH_CLIENT_ID'),
      redirect_uri: args.redirectUri,
      scope: args.scopes.join(' '),
      state: args.state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCode(args: ExchangeCodeArgs): Promise<TokenExchangeResult> {
    const raw = (await this.postForm(this.tokenUrl(), {
      grant_type: 'authorization_code',
      code: args.code,
      redirect_uri: args.redirectUri,
      client_id: this.env('HUBSPOT_OAUTH_CLIENT_ID'),
      client_secret: this.env('HUBSPOT_OAUTH_CLIENT_SECRET'),
    })) as HubspotTokenResponse;
    return this.toTokenResult(raw, null);
  }

  async refresh(args: {
    refreshToken: string;
    currentConfig: Record<string, unknown>;
  }): Promise<TokenExchangeResult> {
    const raw = (await this.postForm(this.tokenUrl(), {
      grant_type: 'refresh_token',
      refresh_token: args.refreshToken,
      client_id: this.env('HUBSPOT_OAUTH_CLIENT_ID'),
      client_secret: this.env('HUBSPOT_OAUTH_CLIENT_SECRET'),
    })) as HubspotTokenResponse;
    return this.toTokenResult(raw, args.refreshToken, args.currentConfig);
  }

  private tokenUrl(): string {
    return this.envOptional('HUBSPOT_OAUTH_TOKEN_URL', TOKEN_URL_DEFAULT);
  }

  private toTokenResult(
    raw: HubspotTokenResponse,
    fallbackRefreshToken: string | null,
    currentConfig?: Record<string, unknown>,
  ): TokenExchangeResult {
    const accessToken = raw.access_token;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new InternalServerErrorException('HubSpot token response missing access_token');
    }

    const refreshToken =
      typeof raw.refresh_token === 'string' && raw.refresh_token.length > 0
        ? raw.refresh_token
        : fallbackRefreshToken;
    if (refreshToken === null) {
      throw new InternalServerErrorException(
        'HubSpot token response missing refresh_token (and none provided as fallback)',
      );
    }

    const expiresIn = typeof raw.expires_in === 'number' ? raw.expires_in : null;
    const tokenType = typeof raw.token_type === 'string' ? raw.token_type : 'bearer';
    const hubId =
      typeof raw.hub_id === 'string' || typeof raw.hub_id === 'number'
        ? String(raw.hub_id)
        : ((currentConfig?.hubId as string | undefined) ?? undefined);

    const config: HubspotOAuth2Config = hubspotOAuth2ConfigSchema.parse({
      accessToken,
      refreshToken,
      tokenType,
      hubId,
    });

    return {
      config,
      refreshToken,
      expiresAt: this.expiresAtFromSeconds(expiresIn),
    };
  }
}
