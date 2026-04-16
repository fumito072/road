import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  console.log('[boot] starting bootstrap');
  const app = await NestFactory.create(AppModule);
  console.log('[boot] NestFactory.create done');

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`ROAD Backend running on port ${port}`);
}

bootstrap().catch((err) => {
  console.error('[boot] bootstrap failed:', err);
  process.exit(1);
});
