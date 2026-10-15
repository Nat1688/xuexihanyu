/**
 * Minimal HTTP request/response typings (CLP-00-06).
 *
 * The API runs on Express via `@nestjs/platform-express`, but `@types/express`
 * is not a declared dependency of this workspace. Rather than add one purely for
 * a handful of property reads, we declare the SMALL surface the auth boundary
 * actually uses. This keeps the dependency graph unchanged and the boundary
 * explicit.
 *
 * The auth guard/controller read only: request headers (specifically `cookie`
 * and `x-csrf-token`), the client address, and set the `Set-Cookie` /
 * `Cache-Control` response headers via `setHeader`.
 */

/** The header bag exposed by Node's IncomingMessage. */
export interface HttpHeaders {
  cookie?: string;
  'x-csrf-token'?: string;
  'x-request-id'?: string;
  'x-correlation-id'?: string;
  [key: string]: string | string[] | undefined;
}

/** Minimal request surface used by the auth boundary. */
export interface HttpRequest {
  headers: HttpHeaders;
  /** Express-populated client address (may be undefined in narrow contexts). */
  ip?: string;
  socket?: { remoteAddress?: string };
}

/** Minimal response surface used by the auth boundary. */
export interface HttpResponse {
  setHeader(name: string, value: string | string[]): void;
  /** Express status setter (present on the real Express response). */
  status?(code: number): HttpResponse;
  /** Express JSON body writer (present on the real Express response). */
  json?(body: unknown): void;
  /** Node raw response terminator (fallback). */
  end?(body?: string): void;
}
