import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
  };
  let jwt: { sign: jest.Mock };
  const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };
    jwt = { sign: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    const validDto = {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    };

    const createdUser = {
      id: 'uuid-1',
      email: validDto.email,
      name: validDto.name,
      role: 'USER' as const,
      createdAt: new Date('2026-04-15T00:00:00Z'),
    };

    it('should hash the password with bcrypt before persisting', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      (mockedBcrypt.hash as unknown as jest.Mock).mockResolvedValue('hashed_password');
      prisma.user.create.mockResolvedValue(createdUser);

      await service.register(validDto);

      expect(mockedBcrypt.hash).toHaveBeenCalledWith(validDto.password, 12);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: validDto.email,
            name: validDto.name,
            password: 'hashed_password',
          }),
        }),
      );
    });

    it('should return a response without the password field', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      (mockedBcrypt.hash as unknown as jest.Mock).mockResolvedValue('hashed_password');
      prisma.user.create.mockResolvedValue(createdUser);

      const result = await service.register(validDto);

      expect(result).toEqual({
        id: createdUser.id,
        email: createdUser.email,
        name: createdUser.name,
        role: createdUser.role,
        createdAt: createdUser.createdAt,
      });
      expect(result).not.toHaveProperty('password');
    });

    it('should throw ConflictException when email is already taken', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.register(validDto)).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when Prisma raises P2002 on create (race)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      (mockedBcrypt.hash as unknown as jest.Mock).mockResolvedValue('hashed_password');
      const prismaError = Object.assign(new Error('unique constraint'), { code: 'P2002' });
      prisma.user.create.mockRejectedValue(prismaError);

      await expect(service.register(validDto)).rejects.toThrow(ConflictException);
    });

    it('should rethrow non-P2002 errors from Prisma', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      (mockedBcrypt.hash as unknown as jest.Mock).mockResolvedValue('hashed_password');
      prisma.user.create.mockRejectedValue(new Error('database down'));

      await expect(service.register(validDto)).rejects.toThrow('database down');
    });
  });

  describe('login', () => {
    const validDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    const storedUser = {
      id: 'uuid-1',
      email: validDto.email,
      password: 'hashed_password',
      role: 'USER' as const,
    };

    it('should return an accessToken when credentials are valid', async () => {
      prisma.user.findUnique.mockResolvedValue(storedUser);
      (mockedBcrypt.compare as unknown as jest.Mock).mockResolvedValue(true);
      jwt.sign.mockReturnValue('signed.jwt.token');

      const result = await service.login(validDto);

      expect(result).toEqual({ accessToken: 'signed.jwt.token', tokenType: 'Bearer' });
    });

    it('should sign the JWT with sub, email, and role in the payload', async () => {
      prisma.user.findUnique.mockResolvedValue(storedUser);
      (mockedBcrypt.compare as unknown as jest.Mock).mockResolvedValue(true);
      jwt.sign.mockReturnValue('signed.jwt.token');

      await service.login(validDto);

      expect(jwt.sign).toHaveBeenCalledWith({
        sub: storedUser.id,
        email: storedUser.email,
        role: storedUser.role,
      });
    });

    it('should throw UnauthorizedException when email is not registered', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(validDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(validDto)).rejects.toThrow('Invalid credentials');
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when password does not match', async () => {
      prisma.user.findUnique.mockResolvedValue(storedUser);
      (mockedBcrypt.compare as unknown as jest.Mock).mockResolvedValue(false);

      await expect(service.login(validDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(validDto)).rejects.toThrow('Invalid credentials');
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('should compare the provided password against the stored hash via bcrypt', async () => {
      prisma.user.findUnique.mockResolvedValue(storedUser);
      (mockedBcrypt.compare as unknown as jest.Mock).mockResolvedValue(true);
      jwt.sign.mockReturnValue('signed.jwt.token');

      await service.login(validDto);

      expect(mockedBcrypt.compare).toHaveBeenCalledWith(validDto.password, storedUser.password);
    });

    it('should not expose the password hash in the response', async () => {
      prisma.user.findUnique.mockResolvedValue(storedUser);
      (mockedBcrypt.compare as unknown as jest.Mock).mockResolvedValue(true);
      jwt.sign.mockReturnValue('signed.jwt.token');

      const result = await service.login(validDto);

      expect(result).not.toHaveProperty('password');
    });
  });

  describe('getProfile', () => {
    const userId = 'uuid-1';

    const profile = {
      id: userId,
      email: 'alice@example.com',
      name: 'Alice',
      role: 'USER' as const,
      createdAt: new Date('2026-04-15T00:00:00Z'),
    };

    it('should look up the user by id and select only safe fields', async () => {
      prisma.user.findUnique.mockResolvedValue(profile);

      await service.getProfile(userId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      });
    });

    it('should return the profile without the password hash', async () => {
      prisma.user.findUnique.mockResolvedValue(profile);

      const result = await service.getProfile(userId);

      expect(result).toEqual(profile);
      expect(result).not.toHaveProperty('password');
    });

    it('should throw UnauthorizedException when the user no longer exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile(userId)).rejects.toThrow(UnauthorizedException);
    });
  });
});
