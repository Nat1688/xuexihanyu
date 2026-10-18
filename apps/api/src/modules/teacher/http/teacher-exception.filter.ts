/**
 * Teacher exception filter (CP-06; ADR-005).
 *
 * Narrow on purpose: it catches ONLY the CP-06 teacher error family. Shared
 * auth/HTTP exceptions keep Nest's default handling so status codes and
 * messages stay uniform across the API.
 */
import { ArgumentsHost, Catch, ExceptionFilter, Injectable } from '@nestjs/common';

import { TeacherError } from '../domain/teacher-errors';
import { type HttpRequest, type HttpResponse } from '../../identity/http/http-types';
import { mapTeacherError } from './teacher-error-mapper';

function requestIdOf(req: HttpRequest | undefined): string | undefined {
  const header = req?.headers?.['x-request-id'] ?? req?.headers?.['x-correlation-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : undefined;
}

@Catch(TeacherError)
@Injectable()
export class TeacherExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<HttpRequest>();
    const res = http.getResponse<HttpResponse>();

    const mapped = mapTeacherError(exception, requestIdOf(req));
    const status = mapped?.status ?? 500;
    const body = mapped?.body ?? {
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' },
    };

    res.setHeader?.('Cache-Control', 'no-store');
    if (typeof res.status === 'function' && typeof res.json === 'function') {
      res.status(status).json?.(body);
      return;
    }
    res.setHeader?.('Content-Type', 'application/json');
    res.end?.(JSON.stringify(body));
  }
}
