/**
 * Request/correlation ID handling (CLP-00-10).
 *
 * Every request gets a correlation id so structured logs and error bodies can
 * be tied together. The rules:
 *
 *   - Accept an inbound `x-request-id` / `x-correlation-id` header ONLY when it
 *     is "sane" (a bounded, safe token) — otherwise a client could inject
 *     arbitrary content into logs (log injection / header smuggling).
 *   - Otherwise mint a fresh random id.
 *   - Echo the resolved id back on the response `x-request-id` header so a
 *     caller can correlate a failure report with server logs.
 *   - Expose the id on the request for downstream handlers/loggers.
 *
 * The id vocabulary is deliberately narrow: base64url/hex-ish characters and a
 * hard length cap, so nothing untrusted (spaces, quotes, newlines, control
 * chars) ever reaches a log line.
 */

import { randomUUID } from 'node:crypto';

import { type NextFunction, type HttpRequest, type HttpResponse } from './http';
import { StructuredLogger } from './structured-logger';

/** Response/request header carrying the correlation id. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Alternate inbound header accepted for correlation. */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/** Maximum accepted inbound id length (keeps log lines bounded). */
export const REQUEST_ID_MAX_LENGTH = 128;

/** Allowed characters in an accepted inbound id: URL-safe, no spaces/quotes. */
const SANE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/** True when a candidate id is safe to accept from a client and to log. */
export function isSaneRequestId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && SANE_ID.test(value);
}

/** Read the first sane inbound correlation id from the request headers. */
export function readInboundRequestId(req: HttpRequest): string | undefined {
  for (const header of [REQUEST_ID_HEADER, CORRELATION_ID_HEADER]) {
    const raw = req.headers?.[header];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (isSaneRequestId(value)) return value;
  }
  return undefined;
}

/** Mint a fresh correlation id. */
export function newRequestId(): string {
  return randomUUID();
}

/**
 * Resolve the id for a request: reuse a sane inbound value, else mint one.
 * Exported as a pure function so it is unit-testable without a server.
 */
export function resolveRequestId(req: HttpRequest): string {
  return readInboundRequestId(req) ?? newRequestId();
}

/**
 * Express-style middleware attaching the correlation id to the request and
 * echoing it on the response. Wraps the resolution in the pure helpers above so
 * the behavior is covered without booting a server.
 */
export function requestIdMiddleware(
  req: HttpRequest,
  res: HttpResponse,
  next: NextFunction,
  logger?: StructuredLogger,
): void {
  const requestId = resolveRequestId(req);
  (req as HttpRequest & { requestId?: string }).requestId = requestId;
  try {
    res.setHeader?.(REQUEST_ID_HEADER, requestId);
  } catch {
    // Response may already be sent in an edge case; never fail the request.
  }
  logger?.event('debug', 'request.received', { method: req.method, path: req.url }, requestId);
  next();
}
