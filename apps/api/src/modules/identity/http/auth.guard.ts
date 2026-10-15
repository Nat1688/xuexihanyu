/**
 * Authentication guard (CLP-00-06; ADR-003).
 *
 * Enforces AUTHENTICATION ONLY. It resolves the session cookie server-side and
 * attaches the principal to the request, or rejects with a uniform 401. It
 * deliberately implements NO role/authorization policy — ADMIN/TEACHER/STUDENT
 * authorization is CLP-00-07 and must not be silently added here.
 *
 * The guard is a pure authentication gate so it can be applied to any route
 * that requires "a logged-in user", independent of role.
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { AuthService } from '../application/auth-service';
import { UnauthenticatedError } from '../application/auth-errors';
import { SESSION_COOKIE_NAME } from '../application/cookie-policy';
import { type AuthenticatedRequest } from './authenticated-request';

/** Minimal cookie accessor; avoids depending on a specific cookie middleware. */
export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readCookie(request.headers?.cookie, SESSION_COOKIE_NAME);
    const resolved = await this.authService.resolveSession(token);
    if (!resolved) {
      // Uniform, non-enumerating failure. The exception filter maps this to 401
      // with a fixed body (no detail about why the session was rejected).
      throw new UnauthenticatedError();
    }
    request.auth = {
      principal: resolved.principal,
      csrfHash: resolved.csrfHash,
      sessionId: resolved.sessionId,
    };
    return true;
  }
}
