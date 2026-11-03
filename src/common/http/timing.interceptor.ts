import { Injectable } from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { tap } from 'rxjs';
import type { Observable } from 'rxjs';
import { setTimingHeader } from './request-context.js';
import type { ContextRequest } from './request-context.js';

@Injectable()
export class TimingInterceptor implements NestInterceptor {
  intercept<T>(context: ExecutionContext, next: CallHandler<T>): Observable<T> {
    const http = context.switchToHttp();
    const request = http.getRequest<ContextRequest>();
    const response = http.getResponse<Response>();
    const stamp = () => {
      if (!response.headersSent) setTimingHeader(request, response);
    };
    return next.handle().pipe(tap({ next: stamp, error: stamp }));
  }
}
