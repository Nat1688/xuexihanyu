/**
 * Student exception filter (CP-05; ADR-005).
 *
 * Narrow on purpose: it catches ONLY the CP-05 student error family (plus the
 * CP-01/CP-02 content-contract error, which is a client-shape failure on this
 * surface). An `HttpException` raised by the controller or the shared auth
 * layer keeps Nest's default handling, so status codes/messages stay uniform
 * across the API.
 */
import { ArgumentsHost, Catch, ExceptionFilter, Injectable } from '@nestjs/common';

import { ContentValidationError } from '../../content/domain/content-errors';
import { StudentError } from '../domain/student-errors';
import { mapStudentError } from './student-error-mapper';
import { type HttpResponse, type HttpRequest } from '../../identity/http/http-types';

/** Read a correlation id from the common headers, if present and sane. */
function requestIdOf(req: HttpRequest | undefined): string | undefined {
  const header = req?.headers?.['x-request-id'] ?? req?.headers?.['x-correlation-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : undefined;
}

@Catch(StudentError, ContentValidationError)
@Injectable()
export class StudentExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<HttpRequest>();
    const res = http.getResponse<HttpResponse>();

    const mapped = mapStudentError(exception, requestIdOf(req));
    const status = mapped?.status ?? (exception instanceof ContentValidationError ? 400 : 500);
    const body =
      mapped?.body ??
      (exception instanceof ContentValidationError
        ? {
            error: {
              code: exception.code,
              message: `Invalid ${exception.field}.`,
              ...(requestIdOf(req) ? { requestId: requestIdOf(req) } : {}),
            },
          }
        : { error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } });

    res.setHeader?.('Cache-Control', 'no-store');
    if (typeof res.status === 'function' && typeof res.json === 'function') {
      res.status(status).json?.(body);
      return;
    }
    res.setHeader?.('Content-Type', 'application/json');
    res.end?.(JSON.stringify(body));
  }
}
