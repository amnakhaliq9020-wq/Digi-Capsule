import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (isMulterSizeError(exception)) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'This file is larger than the allowed size.',
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        response.status(status).json({ statusCode: status, message: body });
        return;
      }
      response.status(status).json({ statusCode: status, ...body });
      return;
    }

    const code =
      exception instanceof Prisma.PrismaClientKnownRequestError
        ? exception.code
        : exception instanceof Error
          ? exception.name
          : 'UnknownError';
    console.error('Unhandled error', code);

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Something went wrong. Please try again.',
    });
  }
}

function isMulterSizeError(exception: unknown) {
  if (!(exception instanceof Error) || exception.name !== 'MulterError') return false;
  return (exception as Error & { code?: string }).code === 'LIMIT_FILE_SIZE';
}
