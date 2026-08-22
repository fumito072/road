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
  const allowAnyOrigin =
    process.env.APP_ENV === 'staging' ||
    process.env.NODE_ENV === 'staging' ||
    process.env.CORS_ALLOW_ALL_ORIGINS === 'true';

  if (isProduction && !frontendUrl && !allowAnyOrigin) {
    throw new Error(
      'FRONTEND_URL environment variable must be set when NODE_ENV=production',
    );
  }
  const allowedOrigins = new Set([frontendUrl].filter(Boolean));

  // 開発時のみ localhost / 127.0.0.1 を任意ポートで許可する。
  // dev サーバーのポートは空き状況で変わる（3000 が別アプリに使われている等）ため、
  // ポートを固定すると Next のプロキシが転送する Origin が弾かれて 500 になる。
  const isLocalDevOrigin = (origin: string) =>
    !isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowAnyOrigin || allowedOrigins.has(origin) || isLocalDevOrigin(origin)) {
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
  console.log(`LOAD Backend running on port ${port}`);
}

bootstrap().catch((err) => {
  console.error('[boot] bootstrap failed:', err);
  process.exit(1);
});
