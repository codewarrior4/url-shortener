import { Catch, HttpException, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import type { Response } from 'express';
import { setTimingHeader } from './request-context.js';
import type { ContextRequest } from './request-context.js';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<ContextRequest>();
    const response = http.getResponse<Response>();
    if (response.headersSent) return;
    setTimingHeader(request, response);

    let statusCode = 500;
    let message: string | string[] = 'Internal server error';
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') message = body;
      else if ('message' in body)
        message = (body as { message: string | string[] }).message;
      else message = STATUS_CODES[statusCode] ?? 'Request failed';
      // Nest's Express adapter maps JSON SyntaxErrors to BadRequestException
      // without retaining their cause. Never echo parser diagnostics/body text.
      if (
        statusCode === 400 &&
        request.is('application/json') &&
        request.body === undefined
      ) {
        message = 'Malformed JSON body';
      }
      if (statusCode === 413) message = 'Request body too large';
    } else {
      const type = (exception as { type?: string } | null)?.type;
      if (type === 'entity.parse.failed') {
        statusCode = 400;
        message = 'Malformed JSON body';
      } else if (type === 'entity.too.large') {
        statusCode = 413;
        message = 'Request body too large';
      }
    }
    if (statusCode >= 500) {
      this.logger.error({
        message: 'Unhandled HTTP error',
        requestId: request.requestId,
      });
    }
    response.status(statusCode).json({
      statusCode,
      message,
      error: STATUS_CODES[statusCode] ?? 'Request failed',
      requestId: request.requestId,
    });
  }
}
