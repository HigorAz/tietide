import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export const OAUTH_STATE_AUDIENCE = 'oauth-state';
const OAUTH_STATE_TTL = '10m';

export interface OAuthStatePayload {
  userId: string;
  // The workspace the flow was started in; the resulting connection is created here.
  organizationId: string;
  provider: string;
  scopes: string[];
  label: string;
  nonce: string;
}

@Injectable()
export class OAuthStateService {
  constructor(private readonly jwt: JwtService) {}

  async sign(payload: OAuthStatePayload): Promise<string> {
    return this.jwt.signAsync(
      { ...payload, aud: OAUTH_STATE_AUDIENCE },
      { expiresIn: OAUTH_STATE_TTL },
    );
  }

  async verify(token: string): Promise<OAuthStatePayload> {
    let decoded: Record<string, unknown>;
    try {
      decoded = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        audience: OAUTH_STATE_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }

    const userId = decoded.userId;
    const organizationId = decoded.organizationId;
    const provider = decoded.provider;
    const scopes = decoded.scopes;
    const label = decoded.label;
    const nonce = decoded.nonce;

    if (
      typeof userId !== 'string' ||
      typeof organizationId !== 'string' ||
      typeof provider !== 'string' ||
      !Array.isArray(scopes) ||
      !scopes.every((s): s is string => typeof s === 'string') ||
      typeof label !== 'string' ||
      typeof nonce !== 'string'
    ) {
      throw new UnauthorizedException('Invalid OAuth state payload');
    }

    return { userId, organizationId, provider, scopes, label, nonce };
  }
}
