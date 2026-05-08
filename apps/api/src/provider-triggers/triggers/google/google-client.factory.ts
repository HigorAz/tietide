import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, type LoginTicket, type TokenPayload } from 'google-auth-library';
import { drive, type drive_v3 } from '@googleapis/drive';
import { gmail, type gmail_v1 } from '@googleapis/gmail';
import type { DecryptedConnection } from '@tietide/sdk';
import type { GoogleOAuth2Config } from '@tietide/shared';

/**
 * API-side helper for the push-trigger lifecycle. Builds an OAuth2Client
 * scoped to a DecryptedConnection so triggers can call `users.watch`
 * (Gmail) and `files.watch` (Drive) on activation, and verify OIDC JWTs
 * on inbound webhook delivery.
 */
@Injectable()
export class GoogleClientFactory {
  constructor(private readonly config: ConfigService) {}

  buildAuth(connection: DecryptedConnection): OAuth2Client {
    const clientId = this.config.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_SECRET');
    const cfg = connection.config as unknown as GoogleOAuth2Config;
    const auth = new OAuth2Client({ clientId, clientSecret });
    auth.setCredentials({
      access_token: cfg.accessToken,
      refresh_token: connection.refreshToken,
      scope: cfg.scope || undefined,
      token_type: cfg.tokenType,
    });
    return auth;
  }

  drive(connection: DecryptedConnection): drive_v3.Drive {
    return drive({ version: 'v3', auth: this.buildAuth(connection) });
  }

  gmail(connection: DecryptedConnection): gmail_v1.Gmail {
    return gmail({ version: 'v1', auth: this.buildAuth(connection) });
  }

  /**
   * Verify an inbound OIDC ID token sent by Google's Pub/Sub push service.
   * Returns the decoded payload on success; throws on invalid signature,
   * expired token, or audience mismatch.
   */
  async verifyOidcToken(idToken: string, audience: string): Promise<TokenPayload> {
    const auth = new OAuth2Client();
    const ticket: LoginTicket = await auth.verifyIdToken({ idToken, audience });
    const payload = ticket.getPayload();
    if (!payload) throw new Error('OIDC token has no payload');
    return payload;
  }
}
