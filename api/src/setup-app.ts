import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { REFRESH_COOKIE } from './auth/auth.controller';
import { AppConfigService } from './config/app-config.service';

export const API_PREFIX = 'api/v1';

/** Shared by main.ts and the e2e tests so tests exercise the exact production HTTP pipeline. */
export function setupApp(app: NestExpressApplication): INestApplication {
  const config = app.get(AppConfigService);

  // Behind Render/Railway's proxy: trust its X-Forwarded-For so rate limits apply per real client IP.
  app.set('trust proxy', 1);
  app.setGlobalPrefix(API_PREFIX, { exclude: ['docs', 'docs-json'] });
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('WEB_ORIGINS'),
    credentials: true,
    exposedHeaders: ['x-request-id', 'idempotent-replayed'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown fields...
      forbidNonWhitelisted: true, // ...and reject the request if any were sent (catches typos and mass-assignment)
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  const doc = new DocumentBuilder()
    .setTitle('Bazario API')
    .setDescription('Amazon-style store API. Money is integer cents. Auth: Bearer access token + httpOnly refresh cookie.')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth(REFRESH_COOKIE)
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, doc));
  return app;
}
