/**
 * Nest middleware that attaches/echoes a request correlation id (CLP-00-10).
 *
 * Thin adapter over the pure {@link resolveRequestId} / {@link requestIdMiddleware}
 * helpers so the id rules are unit-testable without a running server. It never
 * mutates application state and never throws on a missing response method.
 *
 * The middleware is NON-global by construction: it resolves a safe id from a
 * bounded header vocabulary and echoes it, so it cannot be used for log
 * injection or header smuggling.
 */
import { Injectable, type NestMiddleware } from '@nestjs/common';

import {
  requestIdMiddleware,
  type HttpRequest,
  type HttpResponse,
  type NextFunction,
} from './index';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: HttpRequest, res: HttpResponse, next: NextFunction): void {
    requestIdMiddleware(req, res, next);
  }
}
