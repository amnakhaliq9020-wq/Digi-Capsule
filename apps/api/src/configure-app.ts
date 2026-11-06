import { INestApplication, ValidationPipe, BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import cookieParser from 'cookie-parser';
import { SafeExceptionFilter } from './safe-exception.filter';

function fieldErrors(errors: ValidationError[], parent = ''): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const message = error.constraints ? Object.values(error.constraints)[0] : undefined;
    if (message) {
      fields[path] = message;
    }
    if (error.children?.length) {
      Object.assign(fields, fieldErrors(error.children, path));
    }
  }

  return fields;
}

export function configureApp(app: INestApplication) {
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          message: 'Please correct the highlighted fields.',
          fields: fieldErrors(errors),
        }),
    }),
  );
  app.useGlobalFilters(new SafeExceptionFilter());
}
