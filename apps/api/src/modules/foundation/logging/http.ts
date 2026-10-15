/**
 * Minimal HTTP request/response typings for the logging boundary (CLP-00-10).
 *
 * Mirrors the small-surface approach taken by the identity HTTP boundary
 * (`modules/identity/http/http-types.ts`): `@types/express` is not a declared
 * dependency of this workspace, so we declare ONLY the properties the logging
 * middleware/readiness code reads. This keeps the dependency graph unchanged.
 *
 * A request MAY carry the resolved `requestId` attached by the middleware.
 */

/** Header bag exposed by Node's IncomingMessage. */
export interface HttpHeaders {
  'x-request-id'?: string | string[];
  'x-correlation-id'?: string | string[];
  [key: string]: string | string[] | undefined;
}

/** Minimal request surface used by the logging boundary. */
export interface HttpRequest {
  headers: HttpHeaders;
  method?: string;
  url?: string;
  /** Correlation id attached by {@link requestIdMiddleware}. */
  requestId?: string;
}

/** Minimal response surface used by the logging boundary. */
export interface HttpResponse {
  setHeader(name: string, value: string | string[]): void;
}

/** Express-style `next` continuation. */
export type NextFunction = (error?: unknown) => void;
