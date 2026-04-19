import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers — first middleware
  app.use(helmet());

  // CORS — only allow SPA origin
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
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

  // Swagger/OpenAPI
  const config = new DocumentBuilder()
    .setTitle('TieTide API')
    .setDescription('Integration & Automation Platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.API_PORT || 3030;
  await app.listen(port);
}
bootstrap();
