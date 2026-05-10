import type { ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

// Routes that intentionally omit `requestId` from the response body.
// Webhook callers (HMAC + provider-signed) bring their own correlation IDs;
// the platform's internal request id is still echoed in the X-Request-Id
// response header for operators, but should not leak into the body returned
// to external systems.
const REQUEST_ID_SUPPRESSED_PREFIXES = ['/v1/webhooks/', '/v1/provider-webhooks/'];

interface RequestWithId {
  id?: unknown;
  originalUrl?: unknown;
  url?: unknown;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : ((exceptionResponse as Record<string, unknown>).message?.toString() ?? message);
    }

    const code = HttpStatus[status] ?? 'INTERNAL_SERVER_ERROR';
    const requestId = resolveRequestId(request);

    const body: Record<string, unknown> = {
      statusCode: status,
      code,
      message,
      timestamp: new Date().toISOString(),
    };
    if (requestId !== undefined) {
      body.requestId = requestId;
    }

    response.status(status).json(body);
  }
}

function resolveRequestId(req: RequestWithId | undefined): string | undefined {
  if (!req || typeof req.id !== 'string' || req.id.length === 0) return undefined;

  const path =
    typeof req.originalUrl === 'string'
      ? req.originalUrl
      : typeof req.url === 'string'
        ? req.url
        : '';
  for (const prefix of REQUEST_ID_SUPPRESSED_PREFIXES) {
    if (path.startsWith(prefix)) return undefined;
  }
  return req.id;
}
