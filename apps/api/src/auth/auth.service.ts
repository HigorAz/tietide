import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { OrganizationsService } from '../organizations/organizations.service';
import type { ForgotPasswordDto } from './dto/forgot-password.dto';
import type { ForgotPasswordResponseDto } from './dto/forgot-password-response.dto';
import type { LoginDto } from './dto/login.dto';
import type { LoginResponseDto } from './dto/login-response.dto';
import type { RegisterDto } from './dto/register.dto';
import type { RegisterResponseDto } from './dto/register-response.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';
import type { UserResponseDto } from './dto/user-response.dto';
import type { VerifyEmailDto } from './dto/verify-email.dto';

const BCRYPT_ROUNDS = 12;

// Verification links are single-use and short-lived.
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

// Reset links are shorter-lived than verification links (a password change is a
// higher-stakes action), single-use, and hashed at rest.
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

// Identical response for every register outcome (new email, taken-but-verified,
// taken-but-unverified, race loss) so the endpoint cannot be used to enumerate
// which emails are registered (W2.1).
const NEUTRAL_REGISTER_RESPONSE: RegisterResponseDto = {
  message: 'If that email can be used, check your inbox to finish creating your account.',
};

// Same neutral-response strategy for forgot-password: identical whether or not
// the email is registered, so it can't be used to enumerate accounts.
const NEUTRAL_FORGOT_RESPONSE: ForgotPasswordResponseDto = {
  message: 'If that email is registered, we’ve sent a link to reset your password.',
};

interface SessionUser {
  id: string;
  email: string;
  role: string;
  tokenVersion: number;
}

@Injectable()
export class AuthService {
  // A precomputed hash compared against when the email is not registered, so the
  // login response takes the same time whether or not the account exists
  // (defeats the timing oracle that would otherwise enumerate valid emails).
  private readonly dummyHash = bcrypt.hashSync('tietide-timing-equalizer', BCRYPT_ROUNDS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mailer: MailerService,
    private readonly organizations: OrganizationsService,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    // Hash unconditionally (even when the email is already taken and we won't
    // create a user) so the dominant cost is paid on every path and the response
    // timing does not betray whether the account exists.
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, emailVerified: true },
    });

    if (existing) {
      // Never disclose that the email is taken. A still-unverified account gets a
      // fresh verification link (this doubles as "resend"); a verified one gets a
      // heads-up that someone tried to register, nudging them to sign in.
      if (existing.emailVerified) {
        await this.mailer.sendAlreadyRegisteredEmail(dto.email);
      } else {
        await this.issueVerificationToken(existing.id, dto.email);
      }
      return NEUTRAL_REGISTER_RESPONSE;
    }

    try {
      const user = await this.prisma.user.create({
        data: { email: dto.email, name: dto.name, password: passwordHash },
        select: { id: true },
      });
      // Provision a personal workspace so the new user has an org to land in once
      // verified — without it, every org-scoped request would 403 (no org context).
      await this.organizations.create(user.id, { name: `${dto.name}'s Workspace` });
      await this.issueVerificationToken(user.id, dto.email);
    } catch (err) {
      // Lost a concurrent create race for the same email — treat it exactly like
      // the already-registered path so the response stays neutral.
      if (!this.isUniqueViolation(err)) {
        throw err;
      }
    }

    return NEUTRAL_REGISTER_RESPONSE;
  }

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        password: true,
        role: true,
        tokenVersion: true,
        emailVerified: true,
        deletedAt: true,
      },
    });

    // Always run a bcrypt comparison — against a dummy hash when the user is
    // missing — so the endpoint's timing does not reveal whether the email is
    // registered. Decide success only after the comparison.
    const passwordMatches = await bcrypt.compare(dto.password, user?.password ?? this.dummyHash);
    // A soft-deleted (anonymized) account is treated exactly like a non-existent
    // one — generic invalid-credentials, no oracle for the deleted address.
    if (!user || user.deletedAt || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Only block (and thereby reveal "unverified") AFTER the credentials are
    // confirmed, so this never becomes an enumeration signal for a bad password.
    if (!user.emailVerified) {
      throw new ForbiddenException(
        'Please verify your email before signing in. Check your inbox for the verification link.',
      );
    }

    return this.signSession(user);
  }

  /**
   * Consume a verification token: marks the user verified and issues a session
   * (the verification-link click is where auto-login happens, now that register
   * no longer hands back a token).
   */
  async verifyEmail(dto: VerifyEmailDto): Promise<LoginResponseDto> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const now = new Date();

    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true },
    });
    if (!record) {
      throw new BadRequestException('This verification link is invalid or has expired.');
    }

    // Atomically consume — single-use AND not expired. A replayed or stale link
    // flips zero rows and is rejected.
    const consumed = await this.prisma.emailVerificationToken.updateMany({
      where: { id: record.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      throw new BadRequestException('This verification link is invalid or has expired.');
    }

    const user = await this.prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: true },
      select: { id: true, email: true, role: true, tokenVersion: true },
    });

    return this.signSession(user);
  }

  /**
   * Start a password reset: emails a single-use reset link if the address belongs
   * to a real account. The response is identical regardless, so it cannot be used
   * to enumerate which emails are registered.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<ForgotPasswordResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (user) {
      await this.issuePasswordResetToken(user.id, dto.email);
    }

    return NEUTRAL_FORGOT_RESPONSE;
  }

  /**
   * Consume a reset token: sets the new password, marks the email verified
   * (clicking the emailed link proves ownership), bumps tokenVersion to revoke
   * every existing session, and issues a fresh session (auto-login).
   */
  async resetPassword(dto: ResetPasswordDto): Promise<LoginResponseDto> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const now = new Date();

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true },
    });
    if (!record) {
      throw new BadRequestException('This password reset link is invalid or has expired.');
    }

    // Atomically consume — single-use AND not expired. A replayed or stale link
    // flips zero rows and is rejected.
    const consumed = await this.prisma.passwordResetToken.updateMany({
      where: { id: record.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      throw new BadRequestException('This password reset link is invalid or has expired.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.update({
      where: { id: record.userId },
      // tokenVersion bump revokes every previously-issued session (including any
      // an attacker may hold); emailVerified is set because clicking the emailed
      // link proves control of the inbox.
      data: {
        password: passwordHash,
        emailVerified: true,
        tokenVersion: { increment: 1 },
      },
      select: { id: true, email: true, role: true, tokenVersion: true },
    });

    // Invalidate any other outstanding reset links for this user so only the one
    // just used could ever have worked.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, consumedAt: null },
      data: { consumedAt: now },
    });

    return this.signSession(user);
  }

  /**
   * Revoke every outstanding token for a user by bumping their tokenVersion.
   * The JWT strategy compares the version embedded in each token against the
   * user's current version on every request, so all previously-issued tokens
   * stop validating immediately.
   */
  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
      select: { id: true },
    });
  }

  async getProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        createdAt: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  // Public so AccountService can reuse the exact single-use, hashed-at-rest token
  // issuance for "resend verification" without duplicating the security logic.
  async issueVerificationToken(userId: string, email: string): Promise<void> {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

    await this.prisma.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
    });
    await this.mailer.sendVerificationEmail(email, rawToken);
  }

  private async issuePasswordResetToken(userId: string, email: string): Promise<void> {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    await this.prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    });
    await this.mailer.sendPasswordResetEmail(email, rawToken);
  }

  // Public so AccountService can mint the fresh post-password-change session that
  // keeps the current device signed in while the tokenVersion bump revokes others.
  signSession(user: SessionUser): LoginResponseDto {
    const accessToken = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });
    return { accessToken, tokenType: 'Bearer' };
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: unknown }).code === 'P2002'
    );
  }
}
