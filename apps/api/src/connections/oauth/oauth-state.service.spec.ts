import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { OAuthStateService, type OAuthStatePayload } from './oauth-state.service';

const SECRET = 'test-secret-for-oauth-state';

describe('OAuthStateService', () => {
  let service: OAuthStateService;
  let jwt: JwtService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SECRET })],
      providers: [OAuthStateService],
    }).compile();

    service = module.get(OAuthStateService);
    jwt = module.get(JwtService);
  });

  const samplePayload: OAuthStatePayload = {
    userId: '00000000-0000-4000-8000-000000000001',
    provider: 'google',
    scopes: ['openid', 'email'],
    label: 'My Gmail',
    nonce: 'aabbccddeeff00112233445566778899',
  };

  describe('sign + verify', () => {
    it('round-trips a payload', async () => {
      const token = await service.sign(samplePayload);
      const decoded = await service.verify(token);

      expect(decoded.userId).toBe(samplePayload.userId);
      expect(decoded.provider).toBe(samplePayload.provider);
      expect(decoded.scopes).toEqual(samplePayload.scopes);
      expect(decoded.label).toBe(samplePayload.label);
      expect(decoded.nonce).toBe(samplePayload.nonce);
    });

    it('rejects a token without the oauth-state audience', async () => {
      const token = await jwt.signAsync({ ...samplePayload, aud: 'session' }, { expiresIn: '10m' });
      await expect(service.verify(token)).rejects.toThrow();
    });

    it('rejects an expired token', async () => {
      const token = await jwt.signAsync(
        { ...samplePayload, aud: 'oauth-state' },
        { expiresIn: '1ms' },
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
      await expect(service.verify(token)).rejects.toThrow();
    });

    it('rejects a token signed with a different secret', async () => {
      const stranger = new JwtService({ secret: 'wrong-secret' });
      const token = await stranger.signAsync(
        { ...samplePayload, aud: 'oauth-state' },
        { expiresIn: '10m' },
      );
      await expect(service.verify(token)).rejects.toThrow();
    });

    it('rejects a token with mutated payload bytes', async () => {
      const token = await service.sign(samplePayload);
      const parts = token.split('.');
      const tampered = `${parts[0]}.${parts[1]}A.${parts[2]}`;
      await expect(service.verify(tampered)).rejects.toThrow();
    });

    it('always sets the oauth-state audience claim on signed tokens', async () => {
      const token = await service.sign(samplePayload);
      const decoded = jwt.decode(token) as { aud?: string };
      expect(decoded?.aud).toBe('oauth-state');
    });

    it('signs with a 10-minute expiry', async () => {
      const before = Math.floor(Date.now() / 1000);
      const token = await service.sign(samplePayload);
      const decoded = jwt.decode(token) as { iat: number; exp: number };
      const ttl = decoded.exp - decoded.iat;
      expect(ttl).toBe(600);
      expect(decoded.iat).toBeGreaterThanOrEqual(before);
    });
  });
});
