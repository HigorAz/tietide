import { BadRequestException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { GlobalExceptionFilter } from './http-exception.filter';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
        getRequest: () => ({}),
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
  });
});
