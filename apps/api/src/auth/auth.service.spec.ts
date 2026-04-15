import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
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
  const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService, { provide: PrismaService, useValue: prisma }],
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
});
