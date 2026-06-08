import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub?: string;
  email?: string;
  role?: string;
  aud?: string;
  tokenVersion?: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Cheap claim checks first — never touch the DB for a structurally invalid
    // or wrong-audience token (e.g. an OAuth-state token replayed as a bearer).
    if (payload.aud === 'oauth-state') {
      throw new UnauthorizedException();
    }
    if (!payload.sub || !payload.email || !payload.role) {
      throw new UnauthorizedException();
    }

    // Stateful revocation: re-fetch the user on every request so that bumping
    // their tokenVersion (logout / forced password or role change) invalidates
    // all previously-issued tokens. We also return the *live* role here, so a
    // demoted admin loses access even while holding a token minted as ADMIN.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, tokenVersion: true, deletedAt: true },
    });

    // Tokens issued before tokenVersion existed carry no claim → treat as 0,
    // which matches every backfilled user until their first revocation.
    const presentedVersion = payload.tokenVersion ?? 0;
    // A soft-deleted (anonymized) account must never authenticate, even though its
    // row still exists to preserve authored data. The deletion bumps tokenVersion
    // too, but gate on deletedAt explicitly as defense-in-depth.
    if (!user || user.deletedAt || user.tokenVersion !== presentedVersion) {
      throw new UnauthorizedException();
    }

    return { id: user.id, email: user.email, role: user.role };
  }
}
