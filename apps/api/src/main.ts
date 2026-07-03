import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: provider-callback HMAC signatures are computed over the exact
  // bytes received, so the raw buffer must survive JSON parsing.
  const app = await NestFactory.create(AppModule, { cors: true, rawBody: true });
  app.setGlobalPrefix('api');
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = process.env.API_PORT ? +process.env.API_PORT : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`KuKuMBA API running at http://localhost:${port}/api`);
}
bootstrap();
