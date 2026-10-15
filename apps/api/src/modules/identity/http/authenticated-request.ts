/**
 * HTTP request typing for authenticated requests (CLP-00-06).
 *
 * The auth guard attaches a minimal, server-derived principal plus the resolved
 * session's CSRF hash to the request. Nothing here is trusted from the client;
 * it is populated only after the session is validated server-side.
 */
import { type AuthenticatedPrincipal } from '../application/auth-service';
import { type HttpRequest } from './http-types';

/** The authentication context attached to a validated request. */
export interface RequestAuthContext {
  readonly principal: AuthenticatedPrincipal;
  /** The session's bound CSRF hash (double-submit verification). */
  readonly csrfHash: string;
  readonly sessionId: string;
}

/** An HTTP request that MAY carry a resolved auth context. */
export interface AuthenticatedRequest extends HttpRequest {
  auth?: RequestAuthContext;
}
