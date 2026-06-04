import type { ExecutionContext, INestApplication } from '@nestjs/common';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController (integration)', () => {
  let app: INestApplication;
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
    verifyEmail: jest.Mock;
    forgotPassword: jest.Mock;
    resetPassword: jest.Mock;
    getProfile: jest.Mock;
    logout: jest.Mock;
  };
  let authedUser: { id: string; email: string; role: string } | null;

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      verifyEmail: jest.fn(),
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
      getProfile: jest.fn(),
      logout: jest.fn(),
    };
    authedUser = { id: 'uuid-1', email: 'test@example.com', role: 'USER' };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
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
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    const validBody = {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    };

    it('should return 202 with a neutral message and never an account body (no enumeration)', async () => {
      const neutral = {
        message: 'If that email can be used, check your inbox to finish creating your account.',
      };
      authService.register.mockResolvedValue(neutral);

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(validBody)
        .expect(202);

      expect(res.body).toEqual(neutral);
      expect(res.body).not.toHaveProperty('accessToken');
      expect(res.body).not.toHaveProperty('id');
      expect(authService.register).toHaveBeenCalledWith(
        expect.objectContaining({
          email: validBody.email,
          password: validBody.password,
          name: validBody.name,
        }),
      );
    });

    it('should return 400 when email format is invalid', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validBody, email: 'not-an-email' })
        .expect(400);

      expect(authService.register).not.toHaveBeenCalled();
    });

    it('should return 400 when password is shorter than 8 characters', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validBody, password: 'short7x' })
        .expect(400);

      expect(authService.register).not.toHaveBeenCalled();
    });

    it('should return 400 when password has no digit (weak)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validBody, password: 'onlyletters' })
        .expect(400);

      expect(authService.register).not.toHaveBeenCalled();
    });

    it('should return 400 when password is all digits (weak)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validBody, password: '12345678' })
        .expect(400);

      expect(authService.register).not.toHaveBeenCalled();
    });

    it('should return 400 when name is empty', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validBody, name: '' })
        .expect(400);

      expect(authService.register).not.toHaveBeenCalled();
    });

    it('should lowercase + trim the email before passing to service', async () => {
      authService.register.mockResolvedValue({ message: 'ok' });

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: '  TEST@Example.COM  ', password: 'password123', name: 'T' })
        .expect(202);

      expect(authService.register).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com' }),
      );
    });

    it('should reject unknown fields like role (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validBody, role: 'ADMIN' })
        .expect(400);

      expect(authService.register).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/login', () => {
    const validBody = {
      email: 'test@example.com',
      password: 'password123',
    };

    it('should return 200 with accessToken on valid credentials', async () => {
      authService.login.mockResolvedValue({
        accessToken: 'signed.jwt.token',
        tokenType: 'Bearer',
      });

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send(validBody)
        .expect(200);

      expect(res.body).toEqual({ accessToken: 'signed.jwt.token', tokenType: 'Bearer' });
      expect(authService.login).toHaveBeenCalledWith(
        expect.objectContaining({ email: validBody.email, password: validBody.password }),
      );
    });

    it('should return 401 when service throws UnauthorizedException (wrong password)', async () => {
      authService.login.mockRejectedValue(new UnauthorizedException('Invalid credentials'));

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ ...validBody, password: 'wrongpass' })
        .expect(401);
    });

    it('should return 401 when service throws UnauthorizedException (unknown email)', async () => {
      authService.login.mockRejectedValue(new UnauthorizedException('Invalid credentials'));

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ ...validBody, email: 'ghost@example.com' })
        .expect(401);
    });

    it('should return 403 when the service reports an unverified email', async () => {
      authService.login.mockRejectedValue(new ForbiddenException('Please verify your email'));

      await request(app.getHttpServer()).post('/auth/login').send(validBody).expect(403);
    });

    it('should return 400 when email format is invalid', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ ...validBody, email: 'not-an-email' })
        .expect(400);

      expect(authService.login).not.toHaveBeenCalled();
    });

    it('should return 400 when password is missing', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: validBody.email })
        .expect(400);

      expect(authService.login).not.toHaveBeenCalled();
    });

    it('should lowercase + trim the email before passing to the service', async () => {
      authService.login.mockResolvedValue({ accessToken: 't', tokenType: 'Bearer' });

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: '  TEST@Example.COM  ', password: 'password123' })
        .expect(200);

      expect(authService.login).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com' }),
      );
    });

    it('should reject unknown fields (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ ...validBody, role: 'ADMIN' })
        .expect(400);

      expect(authService.login).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/verify-email', () => {
    it('should return 200 with an accessToken when the token is valid', async () => {
      authService.verifyEmail.mockResolvedValue({ accessToken: 'jwt', tokenType: 'Bearer' });

      const res = await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({ token: 'a-valid-token-1234567890' })
        .expect(200);

      expect(res.body).toEqual({ accessToken: 'jwt', tokenType: 'Bearer' });
      expect(authService.verifyEmail).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'a-valid-token-1234567890' }),
      );
    });

    it('should return 400 when the service rejects an invalid/expired token', async () => {
      authService.verifyEmail.mockRejectedValue(new BadRequestException('invalid'));

      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({ token: 'expired-token-1234567890' })
        .expect(400);
    });

    it('should return 400 when the token is missing/too short (DTO validation)', async () => {
      await request(app.getHttpServer())
        .post('/auth/verify-email')
        .send({ token: 'short' })
        .expect(400);

      expect(authService.verifyEmail).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/forgot-password', () => {
    const neutral = {
      message: 'If that email is registered, we’ve sent a link to reset your password.',
    };

    it('should return 202 with a neutral message and never reveal account existence', async () => {
      authService.forgotPassword.mockResolvedValue(neutral);

      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'test@example.com' })
        .expect(202);

      expect(res.body).toEqual(neutral);
      expect(authService.forgotPassword).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com' }),
      );
    });

    it('should lowercase + trim the email before passing to the service', async () => {
      authService.forgotPassword.mockResolvedValue(neutral);

      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: '  TEST@Example.COM  ' })
        .expect(202);

      expect(authService.forgotPassword).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com' }),
      );
    });

    it('should return 400 when the email format is invalid', async () => {
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'not-an-email' })
        .expect(400);

      expect(authService.forgotPassword).not.toHaveBeenCalled();
    });

    it('should reject unknown fields (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'test@example.com', role: 'ADMIN' })
        .expect(400);

      expect(authService.forgotPassword).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/reset-password', () => {
    const validBody = { token: 'a-valid-reset-token-1234567890', password: 'newpassword1' };

    it('should return 200 with an accessToken when the token + password are valid', async () => {
      authService.resetPassword.mockResolvedValue({ accessToken: 'jwt', tokenType: 'Bearer' });

      const res = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send(validBody)
        .expect(200);

      expect(res.body).toEqual({ accessToken: 'jwt', tokenType: 'Bearer' });
      expect(authService.resetPassword).toHaveBeenCalledWith(
        expect.objectContaining({ token: validBody.token, password: validBody.password }),
      );
    });

    it('should return 400 when the service rejects an invalid/expired token', async () => {
      authService.resetPassword.mockRejectedValue(new BadRequestException('invalid'));

      await request(app.getHttpServer()).post('/auth/reset-password').send(validBody).expect(400);
    });

    it('should return 400 when the token is missing/too short (DTO validation)', async () => {
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: 'short', password: 'newpassword1' })
        .expect(400);

      expect(authService.resetPassword).not.toHaveBeenCalled();
    });

    it('should return 400 when the new password is weak (no digit)', async () => {
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ ...validBody, password: 'onlyletters' })
        .expect(400);

      expect(authService.resetPassword).not.toHaveBeenCalled();
    });
  });

  describe('GET /auth/me', () => {
    const profile = {
      id: 'uuid-1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'USER',
      createdAt: new Date('2026-04-15T00:00:00Z').toISOString(),
    };

    it('should return 401 when the JwtAuthGuard rejects the request (no user)', async () => {
      authedUser = null;

      await request(app.getHttpServer()).get('/auth/me').expect(401);
      expect(authService.getProfile).not.toHaveBeenCalled();
    });

    it('should return 200 with the current user profile when authenticated', async () => {
      authService.getProfile.mockResolvedValue(profile);

      const res = await request(app.getHttpServer()).get('/auth/me').expect(200);

      expect(res.body).toEqual(profile);
      expect(res.body).not.toHaveProperty('password');
      expect(authService.getProfile).toHaveBeenCalledWith('uuid-1');
    });

    it('should return 401 when the service reports the user has vanished', async () => {
      authService.getProfile.mockRejectedValue(new UnauthorizedException('Invalid credentials'));

      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('should pass the id from the authenticated user, not from the request', async () => {
      authedUser = { id: 'different-id', email: 'other@example.com', role: 'ADMIN' };
      authService.getProfile.mockResolvedValue({ ...profile, id: 'different-id' });

      await request(app.getHttpServer()).get('/auth/me').expect(200);

      expect(authService.getProfile).toHaveBeenCalledWith('different-id');
    });
  });

  describe('POST /auth/logout', () => {
    it('should return 204 and revoke tokens for the authenticated user', async () => {
      authService.logout.mockResolvedValue(undefined);

      await request(app.getHttpServer()).post('/auth/logout').expect(204);

      expect(authService.logout).toHaveBeenCalledWith('uuid-1');
    });

    it('should return 401 when unauthenticated', async () => {
      authedUser = null;

      await request(app.getHttpServer()).post('/auth/logout').expect(401);
      expect(authService.logout).not.toHaveBeenCalled();
    });
  });
});
