import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { ConflictException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController (integration)', () => {
  let app: INestApplication;
  let authService: { register: jest.Mock; login: jest.Mock; getProfile: jest.Mock };
  let authedUser: { id: string; email: string; role: string } | null;

  beforeEach(async () => {
    authService = { register: jest.fn(), login: jest.fn(), getProfile: jest.fn() };
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

    it('should return 201 with user data and no password on valid input', async () => {
      const registered = {
        id: 'uuid-1',
        email: validBody.email,
        name: validBody.name,
        role: 'USER',
        createdAt: new Date('2026-04-15T00:00:00Z').toISOString(),
      };
      authService.register.mockResolvedValue(registered);

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(validBody)
        .expect(201);

      expect(res.body).toEqual(registered);
      expect(res.body).not.toHaveProperty('password');
      expect(authService.register).toHaveBeenCalledWith(
        expect.objectContaining({
          email: validBody.email,
          password: validBody.password,
          name: validBody.name,
        }),
      );
    });

    it('should return 409 when service throws ConflictException', async () => {
      authService.register.mockRejectedValue(new ConflictException('Email already registered'));

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validBody, email: 'dup@example.com' })
        .expect(409);
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

    it('should return 400 when name is empty', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...validBody, name: '' })
        .expect(400);

      expect(authService.register).not.toHaveBeenCalled();
    });

    it('should lowercase + trim the email before passing to service', async () => {
      authService.register.mockResolvedValue({
        id: 'u',
        email: 'test@example.com',
        name: 'T',
        role: 'USER',
        createdAt: new Date().toISOString(),
      });

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: '  TEST@Example.COM  ', password: 'password123', name: 'T' })
        .expect(201);

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
});
