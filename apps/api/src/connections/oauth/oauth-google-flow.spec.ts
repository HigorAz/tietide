import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type INestApplication, ValidationPipe, HttpStatus } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../crypto/crypto.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { ConnectionsService } from '../connections.service';
import { ProviderHealthRegistry } from '../health/provider-health.registry';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { OAuthStateService } from './oauth-state.service';
import { OAuthProviderRegistry } from './oauth-provider.registry';
import { GoogleOAuthProvider } from './providers/google.provider';
import { MicrosoftOAuthProvider } from './providers/microsoft.provider';
import { SlackOAuthProvider } from './providers/slack.provider';
import { NotionOAuthProvider } from './providers/notion.provider';
import { HubspotOAuthProvider } from './providers/hubspot.provider';
import { GithubOAuthProvider } from './providers/github.provider';

jest.setTimeout(20000);

interface FixtureCall {
  url: string;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}

function startFixtureTokenServer(canned: Record<string, unknown>): Promise<{
  server: Server;
  url: string;
  calls: FixtureCall[];
}> {
  return new Promise((resolve) => {
    const calls: FixtureCall[] = [];
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        calls.push({ url: req.url ?? '', body, headers: req.headers });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(canned));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, url: `http://127.0.0.1:${port}/token`, calls });
    });
  });
}

describe('OAuth Google flow (fixture token server)', () => {
  let app: INestApplication;
  let prisma: {
    connection: {
      create: jest.Mock;
    };
    oAuthState: {
      create: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let audit: { log: jest.Mock };
  let fixture: Awaited<ReturnType<typeof startFixtureTokenServer>>;
  let signedJwtSecret: string;

  beforeEach(async () => {
    fixture = await startFixtureTokenServer({
      access_token: 'access-fixture-1',
      refresh_token: 'refresh-fixture-1',
      expires_in: 3600,
      scope: 'openid email',
      token_type: 'Bearer',
    });

    // Stateful OAuthState store (keyed by jti) so the real OAuthService PKCE +
    // single-use-state flow round-trips: start() inserts, handleCallback()
    // consumes (updateMany) then reads (findUnique).
    const oauthStates = new Map<string, Record<string, unknown> & { consumedAt: Date | null }>();
    prisma = {
      oAuthState: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          oauthStates.set(data.jti as string, { ...data, consumedAt: null });
          return data;
        }),
        updateMany: jest.fn(async ({ where }: { where: { jti: string } }) => {
          const row = oauthStates.get(where.jti);
          if (row && row.consumedAt === null) {
            row.consumedAt = new Date();
            return { count: 1 };
          }
          return { count: 0 };
        }),
        findUnique: jest.fn(async ({ where }: { where: { jti: string } }) => {
          return oauthStates.get(where.jti) ?? null;
        }),
      },
      connection: {
        create: jest.fn(async ({ data, select }) => {
          const row = {
            id: 'conn-fixture-uuid',
            type: data.type,
            provider: data.provider,
            name: data.name,
            status: 'ACTIVE',
            expiresAt: data.expiresAt ?? null,
            lastUsedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            // capture encrypted fields so we can decrypt later
            configEncrypted: data.configEncrypted,
            configNonce: data.configNonce,
            refreshTokenEncrypted: data.refreshTokenEncrypted,
            refreshTokenNonce: data.refreshTokenNonce,
          };
          if (select) {
            return Object.fromEntries(
              Object.entries(row).filter(([k]) => (select as Record<string, boolean>)[k]),
            );
          }
          return row;
        }),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    signedJwtSecret = 'fixture-jwt-secret';

    const masterKey = Buffer.alloc(32, 7).toString('base64');

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET: signedJwtSecret,
              JWT_EXPIRES_IN: '1h',
              ENCRYPTION_MASTER_KEY: masterKey,
              SPA_BASE_URL: 'http://spa.test',
              GOOGLE_OAUTH_CLIENT_ID: 'cid',
              GOOGLE_OAUTH_CLIENT_SECRET: 'csecret',
              GOOGLE_OAUTH_REDIRECT_URI:
                'http://localhost:3030/v1/connections/oauth/callback?provider=google',
              GOOGLE_OAUTH_TOKEN_URL: fixture.url,
              MS_OAUTH_CLIENT_ID: 'm-cid',
              MS_OAUTH_CLIENT_SECRET: 'm-secret',
              MS_OAUTH_REDIRECT_URI: 'http://localhost:3030/cb',
              SLACK_OAUTH_CLIENT_ID: 's-cid',
              SLACK_OAUTH_CLIENT_SECRET: 's-secret',
              SLACK_OAUTH_REDIRECT_URI: 'http://localhost:3030/cb?provider=slack',
              NOTION_OAUTH_CLIENT_ID: 'n-cid',
              NOTION_OAUTH_CLIENT_SECRET: 'n-secret',
              NOTION_OAUTH_REDIRECT_URI: 'http://localhost:3030/cb?provider=notion',
            }),
          ],
        }),
        JwtModule.register({ secret: signedJwtSecret }),
      ],
      controllers: [OAuthController],
      providers: [
        OAuthService,
        OAuthStateService,
        OAuthProviderRegistry,
        GoogleOAuthProvider,
        MicrosoftOAuthProvider,
        SlackOAuthProvider,
        NotionOAuthProvider,
        HubspotOAuthProvider,
        GithubOAuthProvider,
        ConnectionsService,
        { provide: AuditLogService, useValue: audit },
        { provide: PrismaService, useValue: prisma },
        CryptoService,
        {
          provide: ProviderHealthRegistry,
          useValue: new ProviderHealthRegistry(),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()));
  });

  it('completes a full Google OAuth flow against a fixture token endpoint', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';

    // Mint a session JWT to use for /start (we override the guard via JwtService; signed payload).
    const jwt = app.get(JwtService);
    const sessionToken = await jwt.signAsync({
      sub: userId,
      email: 'u@example.com',
      role: 'USER',
    });

    // Step 1: hit /start. We override the JwtAuthGuard inside this app via a passthrough strategy:
    // simpler: stub user via supertest header is not possible without a guard, so we go a different route —
    // we call the OAuthService directly to mint redirectUrl + state, then exercise /callback over HTTP
    // (which is the public endpoint and the meaningful E2E surface).
    void sessionToken; // sessionToken would be used if we registered the JwtAuthGuard; we deliberately
    // exercise only the public callback in this test (the controller-level start test
    // is covered in oauth.controller.spec.ts).

    const organizationId = '00000000-0000-4000-8000-0000000000aa';
    const oauthService = app.get(OAuthService);
    const startResult = await oauthService.start(organizationId, userId, {
      provider: 'google',
      label: 'My Gmail',
      scopes: 'openid,email',
    });

    expect(new URL(startResult.redirectUrl).host).toBe('accounts.google.com');
    const stateFromAuthorizeUrl = new URL(startResult.redirectUrl).searchParams.get('state');
    expect(stateFromAuthorizeUrl).toBe(startResult.state);

    // Step 2: simulate Google redirecting the browser to /callback
    const res = await request(app.getHttpServer())
      .get('/v1/connections/oauth/callback'.replace('/v1', ''))
      .query({
        provider: 'google',
        code: 'fixture-auth-code',
        state: startResult.state,
      });

    expect(res.status).toBe(HttpStatus.FOUND);
    expect(res.headers.location).toMatch(
      /^http:\/\/spa\.test\/connections\?status=success&id=conn-fixture-uuid$/,
    );

    // The fixture token server received a form-encoded POST with our code + client credentials
    expect(fixture.calls).toHaveLength(1);
    const call = fixture.calls[0];
    expect(call.url).toBe('/token');
    expect(call.body).toContain('grant_type=authorization_code');
    expect(call.body).toContain('code=fixture-auth-code');
    expect(call.body).toContain('client_id=cid');

    // Connection.create was called with encrypted fields
    expect(prisma.connection.create).toHaveBeenCalledTimes(1);
    const createArgs = prisma.connection.create.mock.calls[0][0] as {
      data: {
        userId: string;
        provider: string;
        configEncrypted: string;
        configNonce: string;
        refreshTokenEncrypted: string;
        refreshTokenNonce: string;
      };
    };
    expect(createArgs.data.userId).toBe(userId);
    expect(createArgs.data.provider).toBe('google');
    expect(createArgs.data.configEncrypted).toBeTruthy();
    expect(createArgs.data.refreshTokenEncrypted).toBeTruthy();

    // Encrypted config decrypts back to the canned tokens
    const crypto = app.get(CryptoService);
    const decryptedConfigStr = crypto.decrypt(
      createArgs.data.configEncrypted,
      createArgs.data.configNonce,
    );
    const decryptedConfig = JSON.parse(decryptedConfigStr);
    expect(decryptedConfig).toMatchObject({
      accessToken: 'access-fixture-1',
      refreshToken: 'refresh-fixture-1',
      tokenType: 'Bearer',
    });

    const decryptedRefresh = crypto.decrypt(
      createArgs.data.refreshTokenEncrypted,
      createArgs.data.refreshTokenNonce,
    );
    expect(decryptedRefresh).toBe('refresh-fixture-1');
  });
});
