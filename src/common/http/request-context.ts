import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { Request, Response } from 'express';

export type ContextRequest = Request & {
  requestId?: string;
  startedAt?: number;
};

export function ensureRequestContext(
  request: ContextRequest,
  response: Response,
): void {
  if (!request.requestId) {
    const supplied = request.headers['x-request-id'];
    request.requestId =
      typeof supplied === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(supplied)
        ? supplied
        : randomUUID();
  }
  request.startedAt ??= performance.now();
  response.setHeader('X-Request-ID', request.requestId);
}

export function setTimingHeader(
  request: ContextRequest,
  response: Response,
): void {
  ensureRequestContext(request, response);
  response.setHeader(
    'X-Response-Time',
    `${(performance.now() - request.startedAt!).toFixed(2)}ms`,
  );
}
