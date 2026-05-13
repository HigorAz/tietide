import type { ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let issues: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (exceptionResponse && typeof exceptionResponse === 'object') {
        const obj = exceptionResponse as Record<string, unknown>;
        message = obj.message?.toString() ?? message;
        // Structured-validation errors (Zod / topology) carry a typed `issues`
        // array describing each violation. Preserve it so clients can map
        // errors to specific form fields. See CLAUDE.md §11.
        if (Array.isArray(obj.issues)) {
          issues = obj.issues;
        }
      }
    } else {
      // Non-HttpException — the response stays generic, but we surface the
      // underlying error in the server log so it's not invisible to operators.
      this.logger.error(
        { err: exception, path: resolvePath(request) },
        'Unhandled non-HTTP exception',
      );
    }

    const code = HttpStatus[status] ?? 'INTERNAL_SERVER_ERROR';
    const requestId = resolveRequestId(request);

    const body: Record<string, unknown> = {
      statusCode: status,
      code,
      message,
      timestamp: new Date().toISOString(),
    };
    if (issues !== undefined) {
      body.issues = issues;
    }
    if (requestId !== undefined) {
      body.requestId = requestId;
    }

    response.status(status).json(body);
  }
}

function resolveRequestId(req: RequestWithId | undefined): string | undefined {
  if (!req || typeof req.id !== 'string' || req.id.length === 0) return undefined;

  const path = resolvePath(req);
  for (const prefix of REQUEST_ID_SUPPRESSED_PREFIXES) {
    if (path.startsWith(prefix)) return undefined;
  }
  return req.id;
}

function resolvePath(req: RequestWithId | undefined): string {
  if (!req) return '';
  if (typeof req.originalUrl === 'string') return req.originalUrl;
  if (typeof req.url === 'string') return req.url;
  return '';
}
