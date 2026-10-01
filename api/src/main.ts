import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { setupApp } from './setup-app';

async function bootstrap(): Promise<void> {
  // rawBody: payment webhooks verify their signature against the exact bytes received.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  setupApp(app);
  const port = app.get(AppConfigService).get('PORT');
  await app.listen(port, '0.0.0.0');
  Logger.log(`API on http://localhost:${port}/api/v1  docs: http://localhost:${port}/docs`, 'Bootstrap');
}

void bootstrap();
