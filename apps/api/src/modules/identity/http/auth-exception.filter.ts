/**
 * Auth exception filter (CLP-00-06; ADR-005).
 *
 * Translates the identity application's auth errors into the ADR-005 HTTP error
 * contract (stable machine code + safe message + status + optional correlation
 * id). It exists because the {@link AuthGuard} throws application errors
 * (`UnauthenticatedError`) from OUTSIDE the controller's try/catch — without a
 * filter those would surface as a generic `500`, breaking the uniform-401
 * authentication contract.
 *
 * The filter is deliberately NARROW: `@Catch(...)` lists only the auth errors
 * this boundary owns, so an `HttpException` (the controller's own mapped errors)
 * or any unrelated error never reaches the filter and keeps Nest's default
 * handling (which already omits internals). The filter never leaks a stack,
 * SQL/ORM message, token, cookie or credential detail.
 */
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Injectable } from '@nestjs/common';

import {
  AuthenticationFailedError,
  CsrfInvalidError,
  ForbiddenError,
  LoginRateLimitedError,
  UnauthenticatedError,
} from '../application/auth-errors';
import { mapAuthError } from './auth-error-mapper';
import { type HttpRequest, type HttpResponse } from './http-types';

/** Read a correlation id from the common headers, if present and sane. */
function requestIdOf(req: HttpRequest | undefined): string | undefined {
  const header = req?.headers?.['x-request-id'] ?? req?.headers?.['x-correlation-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : undefined;
}

@Catch(
  UnauthenticatedError,
  CsrfInvalidError,
  AuthenticationFailedError,
  LoginRateLimitedError,
  ForbiddenError,
)
@Injectable()
export class AuthExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<HttpRequest>();
    const res = http.getResponse<HttpResponse>();

    const mapped = mapAuthError(exception, requestIdOf(req));
    if (!mapped) {
      // Defensive: shouldn't happen given the @Catch list. Fall back to a
      // generic, safe 500 without leaking the error.
      throw new HttpException(
        { error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } },
        500,
      );
    }

    res.setHeader?.('Cache-Control', 'no-store');
    // Write the mapped status + JSON body using the narrow response surface.
    if (typeof res.status === 'function' && typeof res.json === 'function') {
      const withStatus = res.status(mapped.status);
      withStatus.json?.(mapped.body);
      return;
    }
    res.setHeader?.('Content-Type', 'application/json');
    res.end?.(JSON.stringify(mapped.body));
  }
}
