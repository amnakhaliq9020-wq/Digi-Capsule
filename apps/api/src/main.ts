import 'reflect-metadata';
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

config();

async function bootstrap() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required');
  }

  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const port = process.env.PORT || 3001;
  await app.listen(port);
}

bootstrap();
