import { Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { ensureRequestContext } from './request-context.js';
import type { ContextRequest } from './request-context.js';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: ContextRequest, response: Response, next: NextFunction): void {
    ensureRequestContext(request, response);
    next();
  }
}
