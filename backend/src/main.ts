import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  console.log('[boot] starting bootstrap');
  const app = await NestFactory.create(AppModule);
  console.log('[boot] NestFactory.create done');

  app.setGlobalPrefix('api');

  const frontendUrl = process.env.FRONTEND_URL?.trim();
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && !frontendUrl) {
    throw new Error(
      'FRONTEND_URL environment variable must be set when NODE_ENV=production',
    );
  }
  const allowedOrigins = frontendUrl ? [frontendUrl] : ['http://localhost:3000'];
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
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
