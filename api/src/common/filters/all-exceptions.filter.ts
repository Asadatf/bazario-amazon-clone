import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

export interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: string[];
  requestId?: string;
  path: string;
  timestamp: string;
}

/**
 * The single place errors become HTTP responses, so every error has the same JSON shape
 * and nothing internal (stack traces, SQL) ever reaches the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const { status, message, details } = this.describe(exception);

    const body: ErrorBody = {
      statusCode: status,
      error: HttpStatus[status] ?? 'ERROR',
      message,
      ...(details ? { details } : {}),
      requestId: req.requestId,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    };

    const logLine = JSON.stringify({ requestId: req.requestId, method: req.method, path: req.originalUrl, status, message });
    if (status >= 500) {
      this.logger.error(logLine, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.warn(logLine);
    }
    res.status(status).json(body);
  }

  private describe(exception: unknown): { status: number; message: string; details?: string[] } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') return { status, message: response };
      const raw = (response as { message?: unknown }).message;
      // ValidationPipe reports a list of messages; surface them as details with a readable summary.
      if (Array.isArray(raw)) return { status, message: 'Validation failed', details: raw.map(String) };
      return { status, message: typeof raw === 'string' ? raw : exception.message };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') return { status: HttpStatus.CONFLICT, message: 'Resource already exists' };
      if (exception.code === 'P2025') return { status: HttpStatus.NOT_FOUND, message: 'Resource not found' };
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
  }
}
