import type { INestApplication } from '@nestjs/common';
import { ConflictException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController (integration)', () => {
  let app: INestApplication;
  let authService: { register: jest.Mock; login: jest.Mock };

  beforeEach(async () => {
    authService = { register: jest.fn(), login: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

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
});
