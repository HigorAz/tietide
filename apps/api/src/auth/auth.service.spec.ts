import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { OrganizationsService } from '../organizations/organizations.service';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    emailVerificationToken: { create: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock };
    passwordResetToken: { create: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock };
  };
  let jwt: { sign: jest.Mock };
  let mailer: {
    sendVerificationEmail: jest.Mock;
    sendAlreadyRegisteredEmail: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
  };
  let organizations: { create: jest.Mock };
  const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      emailVerificationToken: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
      passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    };
    jwt = { sign: jest.fn() };
    mailer = {
      sendVerificationEmail: jest.fn(async () => undefined),
      sendAlreadyRegisteredEmail: jest.fn(async () => undefined),
      sendPasswordResetEmail: jest.fn(async () => undefined),
    };
    organizations = { create: jest.fn(async () => undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: MailerService, useValue: mailer },
        { provide: OrganizationsService, useValue: organizations },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    (mockedBcrypt.hash as unknown as jest.Mock).mockResolvedValue('hashed_password');
  });

  describe('register', () => {
    const validDto = { email: 'test@example.com', password: 'password123', name: 'Test User' };
    const NEUTRAL = {
      message: 'If that email can be used, check your inbox to finish creating your account.',
    };

    it('creates the user and emails a verification link for a new email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'uuid-1' });

      const result = await service.register(validDto);

      expect(mockedBcrypt.hash).toHaveBeenCalledWith(validDto.password, 12);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: validDto.email, password: 'hashed_password' }),
        }),
      );
      expect(prisma.emailVerificationToken.create).toHaveBeenCalledTimes(1);
      expect(mailer.sendVerificationEmail).toHaveBeenCalledWith(validDto.email, expect.any(String));
      // A personal workspace is provisioned so the new user has an org context to
      // land in once verified (closes the new-user no-org gap).
      expect(organizations.create).toHaveBeenCalledWith('uuid-1', {
        name: "Test User's Workspace",
      });
      // No token in the response, no account fields — the response is neutral.
      expect(result).toEqual(NEUTRAL);
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('returns the SAME neutral response for an already-verified email (no enumeration oracle)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing', emailVerified: true });

      const result = await service.register(validDto);

      expect(result).toEqual(NEUTRAL);
      expect(prisma.user.create).not.toHaveBeenCalled();
      // The real owner gets a heads-up; no verification token is minted.
      expect(mailer.sendAlreadyRegisteredEmail).toHaveBeenCalledWith(validDto.email);
      expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
      expect(organizations.create).not.toHaveBeenCalled();
    });

    it('resends a verification link (still neutral) for a taken-but-unverified email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'pending', emailVerified: false });

      const result = await service.register(validDto);

      expect(result).toEqual(NEUTRAL);
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.emailVerificationToken.create).toHaveBeenCalledTimes(1);
      expect(mailer.sendVerificationEmail).toHaveBeenCalledWith(validDto.email, expect.any(String));
      // No new user → no new workspace provisioned.
      expect(organizations.create).not.toHaveBeenCalled();
    });

    it('stays neutral (does not surface) when create loses a P2002 race', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));

      const result = await service.register(validDto);

      expect(result).toEqual(NEUTRAL);
    });

    it('rethrows non-P2002 errors from create', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(new Error('database down'));

      await expect(service.register(validDto)).rejects.toThrow('database down');
    });

    it('stores only a HASH of the verification token, never the raw token', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'uuid-1' });

      await service.register(validDto);

      const created = prisma.emailVerificationToken.create.mock.calls[0][0];
      const rawToken = mailer.sendVerificationEmail.mock.calls[0][1] as string;
      expect(created.data.tokenHash).toEqual(expect.any(String));
      expect(created.data.tokenHash).not.toEqual(rawToken);
      expect(created.data.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('login', () => {
    const validDto = { email: 'test@example.com', password: 'password123' };
    const storedUser = {
      id: 'uuid-1',
      email: validDto.email,
      password: 'hashed_password',
      role: 'USER' as const,
      tokenVersion: 2,
      emailVerified: true,
    };

    it('returns an accessToken when credentials are valid and the email is verified', async () => {
      prisma.user.findUnique.mockResolvedValue(storedUser);
      (mockedBcrypt.compare as unknown as jest.Mock).mockResolvedValue(true);
      jwt.sign.mockReturnValue('signed.jwt.token');

      const result = await service.login(validDto);

      expect(result).toEqual({ accessToken: 'signed.jwt.token', tokenType: 'Bearer' });
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: storedUser.id,
        email: storedUser.email,
        role: storedUser.role,
        tokenVersion: storedUser.tokenVersion,
      });
    });

    it('throws ForbiddenException for valid credentials on an unverified account', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...storedUser, emailVerified: false });
      (mockedBcrypt.compare as unknown as jest.Mock).mockResolvedValue(true);

      await expect(service.login(validDto)).rejects.toThrow(ForbiddenException);
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when email is not registered (and still runs bcrypt)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      (mockedBcrypt.compare as unknown as jest.Mock).mockResolvedValue(false);

      await expect(service.login(validDto)).rejects.toThrow(UnauthorizedException);
      expect(mockedBcrypt.compare).toHaveBeenCalledTimes(1);
    });

    it('throws UnauthorizedException (not Forbidden) for a wrong password, never revealing verification state', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...storedUser, emailVerified: false });
      (mockedBcrypt.compare as unknown as jest.Mock).mockResolvedValue(false);

      await expect(service.login(validDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('verifyEmail', () => {
    const dto = { token: 'raw-token-value-1234567890' };

    it('consumes a valid token, marks the user verified, and issues a session', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({ id: 'tok-1', userId: 'uuid-1' });
      prisma.emailVerificationToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.update.mockResolvedValue({
        id: 'uuid-1',
        email: 'test@example.com',
        role: 'USER',
        tokenVersion: 0,
      });
      jwt.sign.mockReturnValue('signed.jwt.token');

      const result = await service.verifyEmail(dto);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'uuid-1' }, data: { emailVerified: true } }),
      );
      expect(result).toEqual({ accessToken: 'signed.jwt.token', tokenType: 'Bearer' });
    });

    it('rejects an unknown token', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(null);

      await expect(service.verifyEmail(dto)).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects a token that is already consumed or expired (atomic consume flips 0 rows)', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({ id: 'tok-1', userId: 'uuid-1' });
      prisma.emailVerificationToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.verifyEmail(dto)).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('looks the token up by its hash, never by the raw value', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(null);

      await service.verifyEmail(dto).catch(() => undefined);

      const lookup = prisma.emailVerificationToken.findUnique.mock.calls[0][0];
      expect(lookup.where.tokenHash).toEqual(expect.any(String));
      expect(lookup.where.tokenHash).not.toEqual(dto.token);
    });
  });

  describe('forgotPassword', () => {
    const dto = { email: 'test@example.com' };
    const NEUTRAL = {
      message: 'If that email is registered, we’ve sent a link to reset your password.',
    };

    it('emails a single-use reset link (hashed at rest) for a registered email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'uuid-1' });

      const result = await service.forgotPassword(dto);

      expect(result).toEqual(NEUTRAL);
      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      const created = prisma.passwordResetToken.create.mock.calls[0][0];
      const rawToken = mailer.sendPasswordResetEmail.mock.calls[0][1] as string;
      expect(mailer.sendPasswordResetEmail).toHaveBeenCalledWith(dto.email, expect.any(String));
      expect(created.data.tokenHash).toEqual(expect.any(String));
      expect(created.data.tokenHash).not.toEqual(rawToken);
      expect(created.data.expiresAt).toBeInstanceOf(Date);
    });

    it('returns the SAME neutral response for an unknown email and sends nothing (no enumeration)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword(dto);

      expect(result).toEqual(NEUTRAL);
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mailer.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const dto = { token: 'raw-reset-token-1234567890', password: 'newpassword1' };

    it('consumes the token, sets the password, verifies email, bumps tokenVersion, and logs in', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({ id: 'tok-1', userId: 'uuid-1' });
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.update.mockResolvedValue({
        id: 'uuid-1',
        email: 'test@example.com',
        role: 'USER',
        tokenVersion: 3,
      });
      jwt.sign.mockReturnValue('signed.jwt.token');

      const result = await service.resetPassword(dto);

      expect(mockedBcrypt.hash).toHaveBeenCalledWith(dto.password, 12);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'uuid-1' },
          data: expect.objectContaining({
            password: 'hashed_password',
            emailVerified: true,
            tokenVersion: { increment: 1 },
          }),
        }),
      );
      expect(result).toEqual({ accessToken: 'signed.jwt.token', tokenType: 'Bearer' });
      // The signed session carries the *bumped* version, so it stays valid while
      // the pre-reset sessions do not.
      expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ tokenVersion: 3 }));
    });

    it('looks the token up by its hash, never by the raw value', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await service.resetPassword(dto).catch(() => undefined);

      const lookup = prisma.passwordResetToken.findUnique.mock.calls[0][0];
      expect(lookup.where.tokenHash).toEqual(expect.any(String));
      expect(lookup.where.tokenHash).not.toEqual(dto.token);
    });

    it('rejects an unknown token without touching the user', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword(dto)).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an already-consumed or expired token (atomic consume flips 0 rows)', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({ id: 'tok-1', userId: 'uuid-1' });
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.resetPassword(dto)).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
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

    it('looks up the user by id and selects only safe fields', async () => {
      prisma.user.findUnique.mockResolvedValue(profile);

      await service.getProfile(userId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      });
    });

    it('throws UnauthorizedException when the user no longer exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile(userId)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('increments the user tokenVersion to revoke every outstanding token', async () => {
      prisma.user.update.mockResolvedValue({ id: 'uuid-1' });

      await service.logout('uuid-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        data: { tokenVersion: { increment: 1 } },
        select: { id: true },
      });
    });
  });
});
