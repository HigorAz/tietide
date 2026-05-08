import type { ConfigService } from '@nestjs/config';
import type { DecryptedConnection } from '@tietide/sdk';
import type { GoogleOAuth2Config } from '@tietide/shared';
import { GoogleAuthService } from './google-auth';
import type { InProcessRefreshService } from '../../../connections/refresh/in-process-refresh.service';

const ENV: Record<string, string> = {
  GOOGLE_OAUTH_CLIENT_ID: 'cid',
  GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
};

const makeConfig = (): ConfigService =>
  ({
    getOrThrow: (key: string) => {
      const v = ENV[key];
      if (v === undefined) throw new Error(`Missing ${key}`);
      return v;
    },
  }) as unknown as ConfigService;

const makeConnection = (
  overrides: Partial<DecryptedConnection<GoogleOAuth2Config>> = {},
): DecryptedConnection<GoogleOAuth2Config> => ({
  id: 'conn-1',
  type: 'OAUTH2',
  provider: 'google',
  config: {
    accessToken: 'at-init',
    refreshToken: 'rt-init',
    scope: 'https://www.googleapis.com/auth/gmail.send',
    tokenType: 'Bearer',
  },
  refreshToken: 'rt-init',
  ...overrides,
});

describe('GoogleAuthService', () => {
  let refresh: jest.Mocked<Pick<InProcessRefreshService, 'persistGoogleTokens'>>;
  let service: GoogleAuthService;

  beforeEach(() => {
    refresh = {
      persistGoogleTokens: jest.fn().mockResolvedValue(true),
    } as jest.Mocked<Pick<InProcessRefreshService, 'persistGoogleTokens'>>;
    service = new GoogleAuthService(makeConfig(), refresh as unknown as InProcessRefreshService);
  });

  describe('buildClient', () => {
    it('returns an OAuth2Client populated with the connection credentials', () => {
      const client = service.buildClient(makeConnection());
      const creds = client.credentials;
      expect(creds.access_token).toBe('at-init');
      expect(creds.refresh_token).toBe('rt-init');
      expect(creds.scope).toBe('https://www.googleapis.com/auth/gmail.send');
      expect(creds.token_type).toBe('Bearer');
    });

    it('subscribes to tokens event and persists rotated credentials', async () => {
      const client = service.buildClient(makeConnection());

      client.emit('tokens', {
        access_token: 'at-rotated',
        refresh_token: 'rt-rotated',
        scope:
          'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.file',
        expiry_date: 1_000_000,
      });

      // Allow the async handler to settle.
      await new Promise((r) => setImmediate(r));

      expect(refresh.persistGoogleTokens).toHaveBeenCalledTimes(1);
      expect(refresh.persistGoogleTokens).toHaveBeenCalledWith('conn-1', {
        accessToken: 'at-rotated',
        refreshToken: 'rt-rotated',
        scope:
          'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.file',
        expiresAt: new Date(1_000_000),
      });
    });

    it('ignores token events with no access_token', async () => {
      const client = service.buildClient(makeConnection());
      client.emit('tokens', {});
      await new Promise((r) => setImmediate(r));
      expect(refresh.persistGoogleTokens).not.toHaveBeenCalled();
    });

    it('does not throw when persist fails — logs and continues', async () => {
      refresh.persistGoogleTokens.mockRejectedValueOnce(new Error('db down'));
      const client = service.buildClient(makeConnection());

      expect(() => client.emit('tokens', { access_token: 'at-rotated' })).not.toThrow();

      await new Promise((r) => setImmediate(r));
      expect(refresh.persistGoogleTokens).toHaveBeenCalled();
    });
  });
});
