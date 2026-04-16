import type { INestApplication } from '@nestjs/common';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy, type AuthenticatedUser } from '../../auth/strategies/jwt.strategy';
import { CurrentUser } from '../decorators/current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

const TEST_SECRET = 'jwt-auth-guard-spec-secret';

@Controller('protected')
class TestProtectedController {
  @Get('whoami')
  @UseGuards(JwtAuthGuard)
  whoami(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get('role')
  @UseGuards(JwtAuthGuard)
  role(@CurrentUser('role') role: string) {
    return { role };
  }
}

describe('JwtAuthGuard + CurrentUser (integration)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const prevSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = TEST_SECRET;

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: TEST_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [TestProtectedController],
      providers: [JwtStrategy],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
    if (prevSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = prevSecret;
    }
  });

  describe('JwtAuthGuard', () => {
    it('should return 401 when the Authorization header is missing', async () => {
      await request(app.getHttpServer()).get('/protected/whoami').expect(401);
    });

    it('should return 401 when the Bearer token is malformed', async () => {
      await request(app.getHttpServer())
        .get('/protected/whoami')
        .set('Authorization', 'Bearer not-a-real-jwt')
        .expect(401);
    });

    it('should return 401 when the token is signed with a different secret', async () => {
      const alien = jwt.sign(
        { sub: 'u', email: 'a@b.com', role: 'USER' },
        { secret: 'different-secret' },
      );

      await request(app.getHttpServer())
        .get('/protected/whoami')
        .set('Authorization', `Bearer ${alien}`)
        .expect(401);
    });

    it('should return 401 when the token is expired', async () => {
      const expired = jwt.sign({ sub: 'u', email: 'a@b.com', role: 'USER' }, { expiresIn: '-1h' });

      await request(app.getHttpServer())
        .get('/protected/whoami')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
    });

    it('should return 200 when the token is valid', async () => {
      const token = jwt.sign({ sub: 'u1', email: 'a@b.com', role: 'USER' });

      await request(app.getHttpServer())
        .get('/protected/whoami')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  describe('@CurrentUser()', () => {
    it('should inject the authenticated user with sub mapped to id', async () => {
      const token = jwt.sign({ sub: 'u-42', email: 'mc@example.com', role: 'USER' });

      const res = await request(app.getHttpServer())
        .get('/protected/whoami')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ id: 'u-42', email: 'mc@example.com', role: 'USER' });
      expect(res.body).not.toHaveProperty('sub');
    });

    it('should pluck a single field when passed a key argument', async () => {
      const token = jwt.sign({ sub: 'u', email: 'admin@example.com', role: 'ADMIN' });

      const res = await request(app.getHttpServer())
        .get('/protected/role')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ role: 'ADMIN' });
    });
  });
});
