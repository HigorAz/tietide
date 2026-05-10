import { BadRequestException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { GlobalExceptionFilter } from './http-exception.filter';

interface RequestStub {
  id?: string;
  originalUrl?: string;
  url?: string;
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;
  let request: RequestStub;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    request = {};
    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
        getRequest: () => request,
        getNext: () => undefined,
      }),
    } as unknown as ArgumentsHost;
  });

  describe('catch', () => {
    it('should map HttpException with string response to its status and message', () => {
      const exception = new NotFoundException('User not found');

      filter.catch(exception, host);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'User not found',
        }),
      );
    });

    it('should extract message from HttpException with object response', () => {
      const exception = new BadRequestException({
        message: 'Validation failed',
        error: 'Bad Request',
      });

      filter.catch(exception, host);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Validation failed',
        }),
      );
    });

    it('should handle HttpException with object response missing message', () => {
      const exception = new HttpException({ error: 'unknown' }, HttpStatus.I_AM_A_TEAPOT);

      filter.catch(exception, host);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.I_AM_A_TEAPOT);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.I_AM_A_TEAPOT,
          message: 'Internal server error',
        }),
      );
    });

    it('should fall back to 500 + generic message for unknown exceptions', () => {
      const exception = new Error('database connection lost');

      filter.catch(exception, host);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
        }),
      );
    });

    it('should not leak stack traces in the response payload', () => {
      const exception = new Error('boom');
      exception.stack = 'Error: boom\n    at /secret/path/file.ts:42';

      filter.catch(exception, host);

      const payload = jsonMock.mock.calls[0][0];
      expect(payload).not.toHaveProperty('stack');
      expect(JSON.stringify(payload)).not.toContain('/secret/path/file.ts');
    });

    it('should include an ISO-8601 timestamp', () => {
      const exception = new NotFoundException();

      filter.catch(exception, host);

      const payload = jsonMock.mock.calls[0][0];
      expect(typeof payload.timestamp).toBe('string');
      expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
    });

    describe('requestId propagation (CLAUDE.md §11)', () => {
      it('should include req.id as requestId for non-webhook routes', () => {
        request.id = 'req-123-abc';
        request.originalUrl = '/v1/workflows/some-id';

        filter.catch(new NotFoundException('Workflow not found'), host);

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({ requestId: 'req-123-abc' }),
        );
      });

      it('should fall back to req.url when originalUrl is absent', () => {
        request.id = 'req-fallback';
        request.url = '/v1/auth/login';

        filter.catch(new BadRequestException('bad'), host);

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({ requestId: 'req-fallback' }),
        );
      });

      it('should omit requestId when req.id is missing', () => {
        request.originalUrl = '/v1/workflows/abc';

        filter.catch(new NotFoundException(), host);

        const payload = jsonMock.mock.calls[0][0];
        expect(payload).not.toHaveProperty('requestId');
      });

      it('should omit requestId when req.id is an empty string', () => {
        request.id = '';
        request.originalUrl = '/v1/workflows/abc';

        filter.catch(new NotFoundException(), host);

        const payload = jsonMock.mock.calls[0][0];
        expect(payload).not.toHaveProperty('requestId');
      });

      it('should omit requestId for /v1/webhooks/<path> routes', () => {
        request.id = 'req-webhook';
        request.originalUrl = '/v1/webhooks/some-hook-path';

        filter.catch(new NotFoundException('Webhook not found'), host);

        const payload = jsonMock.mock.calls[0][0];
        expect(payload).not.toHaveProperty('requestId');
      });

      it('should omit requestId for /v1/provider-webhooks/<...> routes', () => {
        request.id = 'req-provider';
        request.originalUrl = '/v1/provider-webhooks/stripe/sub-1';

        filter.catch(new NotFoundException(), host);

        const payload = jsonMock.mock.calls[0][0];
        expect(payload).not.toHaveProperty('requestId');
      });

      it('should still suppress requestId on webhook routes carrying a query string', () => {
        request.id = 'req-q';
        request.originalUrl = '/v1/webhooks/abc?foo=bar';

        filter.catch(new NotFoundException(), host);

        const payload = jsonMock.mock.calls[0][0];
        expect(payload).not.toHaveProperty('requestId');
      });
    });

    describe('error code (CLAUDE.md §11)', () => {
      it('should derive code from HttpStatus for known statuses', () => {
        filter.catch(new NotFoundException(), host);
        expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ code: 'NOT_FOUND' }));
      });

      it('should set code to BAD_REQUEST for 400', () => {
        filter.catch(new BadRequestException('bad'), host);
        expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ code: 'BAD_REQUEST' }));
      });

      it('should set code to INTERNAL_SERVER_ERROR for unknown exceptions', () => {
        filter.catch(new Error('boom'), host);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR' }),
        );
      });

      it('should set code to I_AM_A_TEAPOT for the matching status', () => {
        filter.catch(new HttpException('tea', HttpStatus.I_AM_A_TEAPOT), host);
        expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ code: 'I_AM_A_TEAPOT' }));
      });
    });
  });
});
