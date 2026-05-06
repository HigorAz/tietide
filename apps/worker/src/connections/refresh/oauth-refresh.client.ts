import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OAuthRefreshResult {
  config: Record<string, unknown>;
  refreshToken: string;
  expiresAt: Date | null;
}

interface ProviderRefreshSpec {
  tokenUrlEnvKey: string;
  tokenUrlDefault: string;
  clientIdEnvKey: string;
  clientSecretEnvKey: string;
  buildConfig: (
    raw: GenericTokenResponse,
    currentConfig: Record<string, unknown>,
  ) => Record<string, unknown>;
}

interface GenericTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  token_type?: unknown;
}

const PROVIDER_SPECS: Record<string, ProviderRefreshSpec | undefined> = {
  google: {
    tokenUrlEnvKey: 'GOOGLE_OAUTH_TOKEN_URL',
    tokenUrlDefault: 'https://oauth2.googleapis.com/token',
    clientIdEnvKey: 'GOOGLE_OAUTH_CLIENT_ID',
    clientSecretEnvKey: 'GOOGLE_OAUTH_CLIENT_SECRET',
    buildConfig: (raw, current) => ({
      accessToken: String(raw.access_token),
      refreshToken: String(raw.refresh_token ?? current.refreshToken ?? ''),
      scope: typeof raw.scope === 'string' ? raw.scope : (current.scope ?? ''),
      tokenType: typeof raw.token_type === 'string' ? raw.token_type : 'Bearer',
    }),
  },
  microsoft: {
    tokenUrlEnvKey: 'MS_OAUTH_TOKEN_URL',
    tokenUrlDefault: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token',
    clientIdEnvKey: 'MS_OAUTH_CLIENT_ID',
    clientSecretEnvKey: 'MS_OAUTH_CLIENT_SECRET',
    buildConfig: (raw, current) => ({
      accessToken: String(raw.access_token),
      refreshToken: String(raw.refresh_token ?? current.refreshToken ?? ''),
      scope: typeof raw.scope === 'string' ? raw.scope : (current.scope ?? ''),
      tokenType: typeof raw.token_type === 'string' ? raw.token_type : 'Bearer',
      tenantId: current.tenantId ?? 'common',
    }),
  },
};

@Injectable()
export class OAuthRefreshClient {
  private readonly log = new Logger(OAuthRefreshClient.name);

  constructor(private readonly config: ConfigService) {}

  supports(provider: string): boolean {
    return Boolean(PROVIDER_SPECS[provider]);
  }

  async refresh(
    provider: string,
    refreshToken: string,
    currentConfig: Record<string, unknown>,
  ): Promise<OAuthRefreshResult> {
    const spec = PROVIDER_SPECS[provider];
    if (!spec) {
      throw new InternalServerErrorException(
        `OAuth refresh not supported for provider "${provider}"`,
      );
    }

    const url = this.resolveTokenUrl(spec, currentConfig);
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.config.getOrThrow<string>(spec.clientIdEnvKey),
      client_secret: this.config.getOrThrow<string>(spec.clientSecretEnvKey),
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    const text = await response.text();
    let parsed: GenericTokenResponse | null;
    try {
      parsed = text ? (JSON.parse(text) as GenericTokenResponse) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok || !parsed || typeof parsed.access_token !== 'string') {
      const errorCode =
        parsed && typeof parsed === 'object' && 'error' in parsed
          ? String((parsed as { error: unknown }).error)
          : `HTTP ${response.status}`;
      throw new InternalServerErrorException(`OAuth refresh failed (${provider}): ${errorCode}`);
    }

    const config = spec.buildConfig(parsed, currentConfig);
    const newRefreshToken =
      typeof parsed.refresh_token === 'string' && parsed.refresh_token.length > 0
        ? parsed.refresh_token
        : refreshToken;
    const expiresAt =
      typeof parsed.expires_in === 'number' && parsed.expires_in > 0
        ? new Date(Date.now() + parsed.expires_in * 1000)
        : null;

    return {
      config,
      refreshToken: newRefreshToken,
      expiresAt,
    };
  }

  private resolveTokenUrl(
    spec: ProviderRefreshSpec,
    currentConfig: Record<string, unknown>,
  ): string {
    const override = this.config.get<string>(spec.tokenUrlEnvKey);
    const template = override ?? spec.tokenUrlDefault;
    if (!template.includes('{tenant}')) return template;
    const tenant =
      typeof currentConfig.tenantId === 'string' && currentConfig.tenantId.length > 0
        ? currentConfig.tenantId
        : (this.config.get<string>('MS_OAUTH_TENANT') ?? 'common');
    return template.replace('{tenant}', tenant);
  }
}
