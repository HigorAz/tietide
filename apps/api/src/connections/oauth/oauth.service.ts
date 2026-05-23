import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectionType, PROVIDER_CONFIG_SCHEMAS, type ProviderConfigMap } from '@tietide/shared';
import { ConnectionsService } from '../connections.service';
import { OAuthProviderRegistry } from './oauth-provider.registry';
import { OAuthStateService } from './oauth-state.service';

const MAX_ERROR_MESSAGE_LEN = 200;

export class OAuthCallbackError extends Error {
  constructor(public readonly providerErrorCode: string) {
    super(`OAuth provider returned error: ${providerErrorCode}`);
    this.name = 'OAuthCallbackError';
  }
}

export interface OAuthStartInput {
  provider: string;
  scopes?: string;
  label: string;
}

export interface OAuthStartResult {
  redirectUrl: string;
  state: string;
}

export interface OAuthCallbackInput {
  // Optional: Microsoft Entra forbids query strings in redirect URIs for
  // personal-account apps, so its callback omits `?provider=`. The signed state
  // JWT carries the provider and is the source of truth.
  provider?: string;
  code?: string;
  state: string;
  error?: string;
}

export interface OAuthCallbackResult {
  connectionId: string;
}

@Injectable()
export class OAuthService {
  private readonly log = new Logger(OAuthService.name);

  constructor(
    private readonly registry: OAuthProviderRegistry,
    private readonly state: OAuthStateService,
    private readonly connections: ConnectionsService,
    private readonly config: ConfigService,
  ) {}

  async start(userId: string, input: OAuthStartInput): Promise<OAuthStartResult> {
    const provider = this.registry.get(input.provider);

    const requestedScopes = this.parseScopes(input.scopes) ?? [...provider.defaultScopes];
    for (const scope of requestedScopes) {
      if (!provider.allowedScopes.has(scope)) {
        throw new BadRequestException(
          `Scope "${scope}" is not allowed for provider "${provider.id}"`,
        );
      }
    }

    const nonce = randomBytes(16).toString('hex');
    const stateToken = await this.state.sign({
      userId,
      provider: provider.id,
      scopes: requestedScopes,
      label: input.label,
      nonce,
    });

    const redirectUri = provider.redirectUri();
    const redirectUrl = provider.buildAuthorizeUrl({
      state: stateToken,
      scopes: requestedScopes,
      redirectUri,
    });

    return { redirectUrl, state: stateToken };
  }

  async handleCallback(input: OAuthCallbackInput): Promise<OAuthCallbackResult> {
    if (input.error) {
      throw new OAuthCallbackError(input.error);
    }
    if (!input.code) {
      throw new BadRequestException('Missing authorization code');
    }

    let decoded;
    try {
      decoded = await this.state.verify(input.state);
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw new BadRequestException('Invalid or expired OAuth state');
      }
      throw err;
    }

    // The provider query param is a defense-in-depth cross-check when present
    // (Google attaches it); it is absent for Microsoft's query-string-free
    // callback. Either way, the signed state JWT is the authoritative source.
    if (input.provider && decoded.provider !== input.provider) {
      throw new BadRequestException('OAuth state provider mismatch');
    }

    const provider = this.registry.get(decoded.provider);
    const exchanged = await provider.exchangeCode({
      code: input.code,
      redirectUri: provider.redirectUri(),
    });

    const schema = PROVIDER_CONFIG_SCHEMAS[provider.id as keyof ProviderConfigMap];
    schema.parse(exchanged.config);

    const created = await this.connections.create(decoded.userId, {
      type: ConnectionType.OAUTH2,
      provider: provider.id,
      name: decoded.label,
      config: exchanged.config,
      refreshToken: exchanged.refreshToken ?? undefined,
      expiresAt: exchanged.expiresAt,
    });

    this.log.log(
      { userId: decoded.userId, provider: provider.id, connectionId: created.id },
      'OAuth callback persisted connection',
    );

    return { connectionId: created.id };
  }

  successRedirectUrl(connectionId: string): string {
    const params = new URLSearchParams({ status: 'success', id: connectionId });
    return `${this.spaBaseUrl()}/connections?${params.toString()}`;
  }

  errorRedirectUrl(message: string): string {
    const truncated = message.slice(0, MAX_ERROR_MESSAGE_LEN);
    const params = new URLSearchParams({ status: 'error', message: truncated });
    return `${this.spaBaseUrl()}/connections?${params.toString()}`;
  }

  private spaBaseUrl(): string {
    const base = this.config.get<string>('SPA_BASE_URL') ?? 'http://localhost:5173';
    return base.replace(/\/+$/, '');
  }

  private parseScopes(csv: string | undefined): string[] | null {
    if (!csv) return null;
    return csv
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
}
