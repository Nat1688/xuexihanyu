/**
 * Content exception filter (CP-01; ADR-005).
 *
 * Translates content-domain errors thrown from the content controller into the
 * ADR-005 HTTP error contract. It is deliberately NARROW: it catches only the
 * content error classes it owns, so an `HttpException` (controller-mapped
 * errors) or an unrelated error keeps Nest's default handling. It never leaks a
 * stack, SQL/ORM message or internal identifier.
 */
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Injectable } from '@nestjs/common';

import {
  ContentConflictError,
  ContentNotFoundError,
  ContentValidationError,
} from '../domain/content-errors';
import { mapContentError } from './content-error-mapper';
import { type HttpRequest, type HttpResponse } from '../../identity/http/http-types';

/** Read a correlation id from the common headers, if present and sane. */
function requestIdOf(req: HttpRequest | undefined): string | undefined {
  const header = req?.headers?.['x-request-id'] ?? req?.headers?.['x-correlation-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : undefined;
}

@Catch(ContentValidationError, ContentNotFoundError, ContentConflictError)
@Injectable()
export class ContentExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<HttpRequest>();
    const res = http.getResponse<HttpResponse>();

    const mapped = mapContentError(exception, requestIdOf(req));
    if (!mapped) {
      throw new HttpException(
        { error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } },
        500,
      );
    }

    res.setHeader?.('Cache-Control', 'no-store');
    if (typeof res.status === 'function' && typeof res.json === 'function') {
      const withStatus = res.status(mapped.status);
      withStatus.json?.(mapped.body);
      return;
    }
    res.setHeader?.('Content-Type', 'application/json');
    res.end?.(JSON.stringify(mapped.body));
  }
}
