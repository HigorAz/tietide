import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectionType, PROVIDER_CONFIG_SCHEMAS, type ProviderConfigMap } from '@tietide/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../crypto/crypto.service';
import { ConnectionsService } from '../connections.service';
import { OAuthProviderRegistry } from './oauth-provider.registry';
import { OAuthStateService } from './oauth-state.service';
import { generatePkcePair } from './pkce';

const MAX_ERROR_MESSAGE_LEN = 200;
/** OAuth state (and its PKCE verifier) lives this long before it is unusable. */
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
/**
 * The PKCE verifier is encrypted at rest (W5.29). The `code_verifier` column is a
 * single String, so we pack the libsodium nonce and ciphertext as `nonce:ciphertext`.
 * Both halves are base64 (ORIGINAL variant — `+/=` only), so a colon is an
 * unambiguous, collision-free separator.
 */
const VERIFIER_PACK_SEP = ':';

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
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async start(
    organizationId: string,
    userId: string,
    input: OAuthStartInput,
  ): Promise<OAuthStartResult> {
    const provider = this.registry.get(input.provider);

    const requestedScopes = this.parseScopes(input.scopes) ?? [...provider.defaultScopes];
    for (const scope of requestedScopes) {
      if (!provider.allowedScopes.has(scope)) {
        throw new BadRequestException(
          `Scope "${scope}" is not allowed for provider "${provider.id}"`,
        );
      }
    }

    // PKCE: keep the verifier server-side, send only the S256 challenge. The
    // nonce doubles as the OAuthState primary key (jti), making the signed
    // state single-use.
    const nonce = randomUUID();
    const { verifier, challenge } = generatePkcePair();

    // Encrypt the PKCE verifier at rest (W5.29): a DB read alone must not leak it.
    const encrypted = this.crypto.encrypt(verifier);
    const packedVerifier = `${encrypted.nonce}${VERIFIER_PACK_SEP}${encrypted.ciphertext}`;

    await this.prisma.oAuthState.create({
      data: {
        jti: nonce,
        userId,
        provider: provider.id,
        codeVerifier: packedVerifier,
        expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
      },
    });

    const stateToken = await this.state.sign({
      userId,
      organizationId,
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
      codeChallenge: challenge,
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

    // Atomically consume the stored state: updateMany only matches an
    // unconsumed, unexpired row, so a replayed callback (same nonce/jti) flips
    // zero rows and is rejected. This is the single-use guarantee.
    const consumed = await this.prisma.oAuthState.updateMany({
      where: { jti: decoded.nonce, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    const stateRow = await this.prisma.oAuthState.findUnique({ where: { jti: decoded.nonce } });
    // Defence in depth: the signed state and the stored row must agree.
    if (!stateRow || stateRow.userId !== decoded.userId || stateRow.provider !== decoded.provider) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    const provider = this.registry.get(decoded.provider);
    const codeVerifier = this.unpackVerifier(stateRow.codeVerifier);
    const exchanged = await provider.exchangeCode({
      code: input.code,
      redirectUri: provider.redirectUri(),
      codeVerifier,
    });

    const schema = PROVIDER_CONFIG_SCHEMAS[provider.id as keyof ProviderConfigMap];
    schema.parse(exchanged.config);

    // Re-verify membership at callback time (W5.28). The org id was bound into the
    // signed state when start() ran behind OrgContextGuard, but membership can have
    // been revoked within the state TTL. Without this check the callback would write
    // a live-refresh-token connection into a workspace the user no longer belongs to.
    const membership = await this.prisma.organizationMember.findFirst({
      where: { organizationId: decoded.organizationId, userId: decoded.userId },
      select: { userId: true },
    });
    if (!membership) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    const created = await this.connections.create(decoded.organizationId, decoded.userId, {
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

  /**
   * Reverse the `nonce:ciphertext` packing from `start` and decrypt (W5.29). Only
   * the first separator is honoured so a base64 ciphertext containing no colon is
   * split cleanly.
   */
  private unpackVerifier(packed: string): string {
    const sepIndex = packed.indexOf(VERIFIER_PACK_SEP);
    if (sepIndex === -1) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }
    const nonce = packed.slice(0, sepIndex);
    const ciphertext = packed.slice(sepIndex + 1);
    return this.crypto.decrypt(ciphertext, nonce);
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
