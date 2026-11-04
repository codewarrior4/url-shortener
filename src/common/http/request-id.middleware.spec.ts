import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { RequestIdMiddleware } from './request-id.middleware.js';
import type { ContextRequest } from './request-context.js';

describe('Structured request logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('logs final status and correlation without bodies, credentials or raw URLs', () => {
    const logger = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const middleware = new RequestIdMiddleware(
      new ConfigService({ NODE_ENV: 'production' }),
    );
    const request = {
      headers: {
        'x-request-id': 'log-test',
        authorization: 'Bearer private-access-token',
      },
      method: 'POST',
      body: { password: 'private-password' },
      originalUrl: '/auth/reset-password?token=private-reset-token',
      route: { path: '/auth/reset-password' },
    } as unknown as ContextRequest;
    const response = Object.assign(new EventEmitter(), {
      statusCode: 202,
      setHeader: vi.fn(),
    });
    const next = vi.fn();
    middleware.use(request, response as unknown as Response, next);
    expect(next).toHaveBeenCalledOnce();
    response.statusCode = 400;
    response.emit('finish');
    const entry = logger.mock.calls[0]![0];
    expect(entry).toMatchObject({
      event: 'http.request',
      requestId: 'log-test',
      statusCode: 400,
      route: '/auth/reset-password',
    });
    expect(JSON.stringify(entry)).not.toContain('private-');
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
  });
});
