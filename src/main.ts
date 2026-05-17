import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { AppModule } from './app.module';

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://dokonect.uz',
  'https://www.dokonect.uz',
  'https://dokonect-frontend-seven.vercel.app',
  /https:\/\/.*\.vercel\.app$/,
  'http://16.16.213.165',
  'http://16.16.213.165:5000',
];

class CorsIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions): any {
    return super.createIOServer(port, {
      ...options,
      cors: {
        origin: (origin: string, cb: (err: Error | null, ok?: boolean) => void) => {
          if (!origin) return cb(null, true);
          const ok = ALLOWED_ORIGINS.some(o =>
            typeof o === 'string' ? o === origin : o.test(origin),
          );
          cb(ok ? null : new Error('Not allowed by CORS'), ok);
        },
        credentials: true,
      },
    });
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new CorsIoAdapter(app));

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // CORS
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:5173',
    'https://dokonect.uz',
    'https://www.dokonect.uz',
    'https://dokonect-frontend-seven.vercel.app',
    /https:\/\/.*\.vercel\.app$/,
    'http://16.16.213.165',
    'http://16.16.213.165:5000',
    'https://16.16.213.165',
  ];

  // Add CLIENT_URL from env if exists
  if (process.env.CLIENT_URL) {
    allowedOrigins.push(process.env.CLIENT_URL);
  }

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      const isAllowed = allowedOrigins.some(allowed => {
        if (typeof allowed === 'string') return allowed === origin;
        if (allowed instanceof RegExp) return allowed.test(origin);
        return false;
      });

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Dokonect API')
    .setDescription('B2B Marketplace API Documentation')
    .setVersion('3.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 5000;
  await app.listen(port);
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
