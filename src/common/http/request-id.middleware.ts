import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { performance } from 'node:perf_hooks';
import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { ensureRequestContext } from './request-context.js';
import type { ContextRequest } from './request-context.js';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');
  constructor(private readonly config: ConfigService) {}

  use(request: ContextRequest, response: Response, next: NextFunction): void {
    ensureRequestContext(request, response);
    if (this.config.get<string>('NODE_ENV') !== 'test') {
      response.once('finish', () => {
        this.logger.log({
          event: 'http.request',
          requestId: request.requestId,
          method: request.method,
          route:
            typeof request.route?.path === 'string'
              ? request.route.path
              : 'unmatched',
          statusCode: response.statusCode,
          durationMs: Number(
            (performance.now() - request.startedAt!).toFixed(2),
          ),
        });
      });
    }
    next();
  }
}
