import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import {
  buildHelmetOptions,
  resolveCorsOrigin,
  resolveTrustProxy,
  shouldEnableSwagger,
} from './common/security/security.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });

  // Cap the request body so a single request cannot exhaust memory. Re-registers
  // the JSON/urlencoded parsers with a limit; rawBody capture (for webhook HMAC)
  // is preserved by the rawBody:true option above.
  const bodyLimit = process.env.BODY_LIMIT ?? '1mb';
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true });

  // Replace default logger with Pino — structured JSON logs
  app.useLogger(app.get(Logger));

  // Socket.IO adapter — required for the executions WebSocket gateway.
  app.useWebSocketAdapter(new IoAdapter(app));

  // Trust proxy — behind the prod reverse proxy/tunnel, so the rate limiter
  // and logs see the real client IP (X-Forwarded-For) instead of the proxy's.
  // Off by default; never trust-all by default (would let clients spoof IPs).
  const trustProxy = resolveTrustProxy();
  if (trustProxy !== false) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
  }

  // Security headers — first middleware. Env-aware: strict CSP + strong HSTS
  // in production, relaxed in dev so the Swagger UI loads.
  app.use(helmet(buildHelmetOptions()));

  // CORS — only allow the SPA origin(s). Mandatory in production (no
  // permissive localhost fallback); throws at boot if unset.
  app.enableCors({
    origin: resolveCorsOrigin(),
    credentials: true,
  });

  // API versioning prefix
  app.setGlobalPrefix('v1', { exclude: ['health'] });

  // Global validation pipe — whitelist + forbid unknown fields
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter — no stack traces leaked
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Swagger/OpenAPI — gated off in production unless SWAGGER_ENABLED=true,
  // so the full API surface is not exposed on the public deployment.
  if (shouldEnableSwagger()) {
    const config = new DocumentBuilder()
      .setTitle('TieTide API')
      .setDescription('Integration & Automation Platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.API_PORT || 3030;
  await app.listen(port);
}
bootstrap();
