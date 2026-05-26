import type { ExecutionContext, INestApplication } from '@nestjs/common';
import {
  BadRequestException,
  HttpStatus,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OAuthController } from './oauth.controller';
import { OAuthService, OAuthCallbackError } from './oauth.service';

jest.setTimeout(15000);

describe('OAuthController (integration)', () => {
  let app: INestApplication;
  let oauth: {
    start: jest.Mock;
    handleCallback: jest.Mock;
    successRedirectUrl: jest.Mock;
    errorRedirectUrl: jest.Mock;
  };
  let authedUser: { id: string; email: string; role: string } | null;

  beforeEach(async () => {
    oauth = {
      start: jest.fn(),
      handleCallback: jest.fn(),
      successRedirectUrl: jest.fn(
        (id: string) => `http://spa.test/connections?status=success&id=${id}`,
      ),
      errorRedirectUrl: jest.fn(
        (m: string) => `http://spa.test/connections?status=error&message=${encodeURIComponent(m)}`,
      ),
    };
    authedUser = { id: 'owner-uuid', email: 'owner@example.com', role: 'USER' };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OAuthController],
      providers: [{ provide: OAuthService, useValue: oauth }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          if (!authedUser) {
            throw new UnauthorizedException('Missing or invalid token');
          }
          const req = ctx.switchToHttp().getRequest<{ user: unknown }>();
          req.user = authedUser;
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /connections/oauth/start', () => {
    it('returns 401 when not authenticated', async () => {
      authedUser = null;

      await request(app.getHttpServer())
        .get('/connections/oauth/start')
        .query({ provider: 'google', label: 'X' })
        .expect(401);

      expect(oauth.start).not.toHaveBeenCalled();
    });

    it('returns 200 with redirectUrl + state for a valid request', async () => {
      oauth.start.mockResolvedValue({ redirectUrl: 'http://google.example/auth', state: 'abc' });

      const res = await request(app.getHttpServer())
        .get('/connections/oauth/start')
        .query({ provider: 'google', label: 'My Gmail', scopes: 'openid,email' })
        .expect(200);

      expect(res.body).toEqual({ redirectUrl: 'http://google.example/auth', state: 'abc' });
      expect(oauth.start).toHaveBeenCalledWith('owner-uuid', {
        provider: 'google',
        label: 'My Gmail',
        scopes: 'openid,email',
      });
    });

    it('returns 400 for an unknown provider via DTO validation', async () => {
      await request(app.getHttpServer())
        .get('/connections/oauth/start')
        .query({ provider: 'dropbox', label: 'X' })
        .expect(400);

      expect(oauth.start).not.toHaveBeenCalled();
    });

    it('returns 400 when the service rejects (e.g. disallowed scope)', async () => {
      oauth.start.mockRejectedValue(new BadRequestException('scope not allowed'));

      await request(app.getHttpServer())
        .get('/connections/oauth/start')
        .query({ provider: 'google', label: 'X', scopes: 'evil' })
        .expect(400);
    });

    it('returns 400 when label is missing', async () => {
      await request(app.getHttpServer())
        .get('/connections/oauth/start')
        .query({ provider: 'google' })
        .expect(400);
    });
  });

  describe('GET /connections/oauth/callback', () => {
    it('redirects to success URL with new connection id', async () => {
      oauth.handleCallback.mockResolvedValue({
        connectionId: '11111111-1111-4111-8111-111111111111',
      });

      const res = await request(app.getHttpServer())
        .get('/connections/oauth/callback')
        .query({ provider: 'google', code: 'auth-code', state: 'jwt-state' })
        .expect(HttpStatus.FOUND);

      expect(res.headers.location).toBe(
        'http://spa.test/connections?status=success&id=11111111-1111-4111-8111-111111111111',
      );
      expect(oauth.handleCallback).toHaveBeenCalledWith({
        provider: 'google',
        code: 'auth-code',
        state: 'jwt-state',
      });
    });

    it('succeeds without a provider query param (Microsoft query-string-free callback)', async () => {
      oauth.handleCallback.mockResolvedValue({ connectionId: 'ms-conn' });

      const res = await request(app.getHttpServer())
        .get('/connections/oauth/callback')
        .query({ code: 'auth-code', state: 'jwt-state' })
        .expect(HttpStatus.FOUND);

      expect(res.headers.location).toMatch(/status=success/);
      expect(oauth.handleCallback).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'auth-code', state: 'jwt-state', provider: undefined }),
      );
    });

    it('redirects to error URL when state is invalid', async () => {
      oauth.handleCallback.mockRejectedValue(new BadRequestException('Invalid state'));

      const res = await request(app.getHttpServer())
        .get('/connections/oauth/callback')
        .query({ provider: 'google', code: 'c', state: 'bad' })
        .expect(HttpStatus.FOUND);

      expect(res.headers.location).toMatch(/status=error/);
      expect(res.headers.location).toMatch(/Invalid%20state|Invalid\+state/);
    });

    it('redirects to error URL when provider returns ?error=access_denied', async () => {
      oauth.handleCallback.mockRejectedValue(new OAuthCallbackError('access_denied'));

      const res = await request(app.getHttpServer())
        .get('/connections/oauth/callback')
        .query({ provider: 'google', state: 'jwt', error: 'access_denied' })
        .expect(HttpStatus.FOUND);

      expect(res.headers.location).toMatch(/status=error/);
      expect(res.headers.location).toMatch(/access_denied/);
    });

    it('returns 400 when state query param is missing', async () => {
      await request(app.getHttpServer())
        .get('/connections/oauth/callback')
        .query({ provider: 'google', code: 'c' })
        .expect(400);

      expect(oauth.handleCallback).not.toHaveBeenCalled();
    });

    it('does NOT require JWT for the callback endpoint', async () => {
      authedUser = null;
      oauth.handleCallback.mockResolvedValue({ connectionId: 'abc' });

      const res = await request(app.getHttpServer())
        .get('/connections/oauth/callback')
        .query({ provider: 'google', code: 'c', state: 's' });

      expect(res.status).toBe(HttpStatus.FOUND);
      expect(oauth.handleCallback).toHaveBeenCalled();
    });

    it('strips provider-supplied extras (iss, scope, authuser, prompt) instead of 400-ing', async () => {
      oauth.handleCallback.mockResolvedValue({ connectionId: 'cb-extras' });

      const res = await request(app.getHttpServer())
        .get('/connections/oauth/callback')
        .query({
          provider: 'google',
          code: 'auth-code',
          state: 'jwt-state',
          iss: 'https://accounts.google.com',
          scope: 'openid email profile',
          authuser: '0',
          prompt: 'consent',
        })
        .expect(HttpStatus.FOUND);

      expect(res.headers.location).toMatch(/status=success/);
      expect(oauth.handleCallback).toHaveBeenCalledWith({
        provider: 'google',
        code: 'auth-code',
        state: 'jwt-state',
      });
    });
  });
});
