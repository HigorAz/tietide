import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginDto } from './dto/login.dto';
import type { LoginResponseDto } from './dto/login-response.dto';
import type { RegisterDto } from './dto/register.dto';
import type { RegisterResponseDto } from './dto/register-response.dto';
import type { UserResponseDto } from './dto/user-response.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  // A precomputed hash compared against when the email is not registered, so the
  // login response takes the same time whether or not the account exists
  // (defeats the timing oracle that would otherwise enumerate valid emails).
  private readonly dummyHash = bcrypt.hashSync('tietide-timing-equalizer', BCRYPT_ROUNDS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          password: passwordHash,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });
      // Auto-login: issue an access token so the SPA can land the user straight
      // in the app instead of bouncing them to the login screen.
      const accessToken = this.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
      });
      return { ...user, accessToken, tokenType: 'Bearer' };
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }
  }

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, email: true, password: true, role: true },
    });

    // Always run a bcrypt comparison — against a dummy hash when the user is
    // missing — so the endpoint's timing does not reveal whether the email is
    // registered. Decide success only after the comparison.
    const passwordMatches = await bcrypt.compare(dto.password, user?.password ?? this.dummyHash);
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return { accessToken, tokenType: 'Bearer' };
  }

  async getProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
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
