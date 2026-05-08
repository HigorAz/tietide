import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, type Credentials } from 'google-auth-library';
import { calendar, calendar_v3 } from '@googleapis/calendar';
import { docs, docs_v1 } from '@googleapis/docs';
import { drive, drive_v3 } from '@googleapis/drive';
import { gmail, gmail_v1 } from '@googleapis/gmail';
import { sheets, sheets_v4 } from '@googleapis/sheets';
import type { DecryptedConnection } from '@tietide/sdk';
import type { GoogleOAuth2Config } from '@tietide/shared';
import { InProcessRefreshService } from '../../../connections/refresh/in-process-refresh.service';

export interface GoogleClientFactories {
  gmail: (opts: { auth: OAuth2Client }) => gmail_v1.Gmail;
  drive: (opts: { auth: OAuth2Client }) => drive_v3.Drive;
  sheets: (opts: { auth: OAuth2Client }) => sheets_v4.Sheets;
  docs: (opts: { auth: OAuth2Client }) => docs_v1.Docs;
  calendar: (opts: { auth: OAuth2Client }) => calendar_v3.Calendar;
}

export const DEFAULT_GOOGLE_CLIENTS: GoogleClientFactories = {
  gmail: ({ auth }) => gmail({ version: 'v1', auth }),
  drive: ({ auth }) => drive({ version: 'v3', auth }),
  sheets: ({ auth }) => sheets({ version: 'v4', auth }),
  docs: ({ auth }) => docs({ version: 'v1', auth }),
  calendar: ({ auth }) => calendar({ version: 'v3', auth }),
};

export const GOOGLE_CLIENTS = Symbol('GOOGLE_CLIENTS');

@Injectable()
export class GoogleAuthService {
  private readonly log = new Logger(GoogleAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly refresh: InProcessRefreshService,
  ) {}

  /**
   * Build an OAuth2Client populated with the connection's credentials. The
   * SDK pre-emptively rotates the access token when it nears expiry; we
   * subscribe to the `'tokens'` event and persist the new tokens via
   * InProcessRefreshService.
   */
  buildClient(connection: DecryptedConnection<GoogleOAuth2Config>): OAuth2Client {
    const clientId = this.config.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_SECRET');

    const auth = new OAuth2Client({ clientId, clientSecret });
    // expiry_date is intentionally omitted — DecryptedConnection (SDK) does not
    // expose it. The OAuth2Client falls back to detecting 401s for refresh
    // timing, which is functionally fine.
    auth.setCredentials({
      access_token: connection.config.accessToken,
      refresh_token: connection.refreshToken ?? undefined,
      scope: connection.config.scope || undefined,
      token_type: connection.config.tokenType,
    });

    auth.on('tokens', (tokens: Credentials) => {
      if (typeof tokens.access_token !== 'string') return;
      void this.refresh
        .persistGoogleTokens(connection.id, {
          accessToken: tokens.access_token,
          refreshToken: typeof tokens.refresh_token === 'string' ? tokens.refresh_token : undefined,
          scope: typeof tokens.scope === 'string' ? tokens.scope : undefined,
          expiresAt:
            typeof tokens.expiry_date === 'number' ? new Date(tokens.expiry_date) : undefined,
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          this.log.error({ connectionId: connection.id, err: message }, 'tokens persist failed');
        });
    });

    return auth;
  }
}
