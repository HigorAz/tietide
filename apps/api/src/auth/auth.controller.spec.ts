import type { INestApplication } from '@nestjs/common';
import { ConflictException, ValidationPipe } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController (integration)', () => {
  let app: INestApplication;
  let authService: { register: jest.Mock };

  beforeEach(async () => {
    authService = { register: jest.fn() };

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
});
