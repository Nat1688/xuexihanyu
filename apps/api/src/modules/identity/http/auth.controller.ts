import { RegistrationService } from '../application/registration.service';
import { Optional, HttpException as SignupHttpException } from '@nestjs/common';
/**
 * Authentication controller (CLP-00-06; ADR-003/ADR-005).
 *
 * Exposes the approved CP-00 auth surface ONLY:
 *   - POST /auth/login   — authenticate; set opaque session + CSRF cookies.
 *   - POST /auth/logout  — revoke the server session, then clear cookies.
 *   - GET  /auth/me      — the authenticated principal (no credential data).
 *   - GET  /auth/session — a representative AUTHENTICATION-ONLY protected route.
 *
 * No RBAC role guard/controller and no ADMIN/TEACHER/STUDENT authorization.
 * "Who am I" is authentication; "may I do X" is CLP-00-07.
 *
 * Cookies are emitted by setting the raw `Set-Cookie` header so the exact,
 * ADR-003-derived attribute string is produced (testable byte-for-byte). The
 * controller never logs tokens, cookies, passwords or CSRF values.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import { AuthService } from '../application/auth-service';
import { CsrfInvalidError } from '../application/auth-errors';
import {
  csrfCookiePolicy,
  serializeClearedCookie,
  serializeCookie,
  sessionCookiePolicy,
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
} from '../application/cookie-policy';
import { CSRF_HEADER, verifyCsrfProof } from '../domain/csrf';
import { type NodeEnvironment } from '../../../config/config.schema';
import { mapAuthError } from './auth-error-mapper';
import { AuthGuard, readCookie } from './auth.guard';
import { type AuthenticatedRequest } from './authenticated-request';
import { type HttpRequest, type HttpResponse } from './http-types';

/** Login request body (validated defensively in the controller). */
interface LoginBody {
  login?: unknown;
  password?: unknown;
}

/** Options the controller needs from typed config. */
export interface AuthControllerOptions {
  readonly nodeEnv: NodeEnvironment;
  readonly spaOrigin?: string;
  readonly sessionTtlMinutes: number;
}

/** DI token for {@link AuthControllerOptions}. */
export const AUTH_CONTROLLER_OPTIONS = Symbol('AUTH_CONTROLLER_OPTIONS');

/**
 * Read request/correlation id from the common headers, if present. Purely
 * defensive; no framework middleware is assumed.
 */
function requestIdOf(req: HttpRequest): string | undefined {
  const header = req.headers['x-request-id'] ?? req.headers['x-correlation-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : undefined;
}

@Controller('auth')
export class AuthController {
  private readonly options: AuthControllerOptions;

  constructor(
    private readonly authService: AuthService,
    @Inject(AUTH_CONTROLLER_OPTIONS) options: AuthControllerOptions,
    @Optional() private readonly registration?: RegistrationService,
  ) {
    this.options = options;
  }

  @Post('register')
  @HttpCode(201)
  async register(
    @Body() body: { login?: unknown; password?: unknown; confirmPassword?: unknown } | undefined,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: HttpResponse,
  ) {
    if (!this.registration) throw new SignupHttpException('Registration unavailable', 503);
    if (
      !this.options.spaOrigin ||
      req.headers.origin !== this.options.spaOrigin ||
      (req.headers['sec-fetch-site'] &&
        !['same-origin', 'same-site'].includes(String(req.headers['sec-fetch-site'])))
    )
      throw new CsrfInvalidError();
    const credentials = await this.registration.register(
      body ?? {},
      req.ip ?? req.socket?.remoteAddress ?? 'unknown',
    );
    return this.login(credentials, req, res);
  }

  /** POST /auth/login — authenticate and issue an opaque session. */
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginBody,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: HttpResponse,
  ): Promise<{ user: PrincipalBody }> {
    try {
      const existingToken = readCookie(req.headers.cookie, SESSION_COOKIE_NAME);
      const result = await this.authService.login({
        login: body?.login,
        password: body?.password,
        rotateExistingToken: existingToken,
        rateLimitKey: this.loginKey(req, body?.login),
      });

      const sessionPolicy = sessionCookiePolicy(
        this.options.nodeEnv,
        this.options.sessionTtlMinutes,
      );
      const csrfPolicy = csrfCookiePolicy(this.options.nodeEnv, this.options.sessionTtlMinutes);
      res.setHeader('Set-Cookie', [
        serializeCookie(sessionPolicy, result.session.rawToken),
        serializeCookie(csrfPolicy, result.session.csrfToken),
      ]);
      res.setHeader('Cache-Control', 'no-store');
      return { user: toPrincipalBody(result.principal) };
    } catch (error) {
      throw this.toHttp(error, req);
    }
  }

  /** POST /auth/logout — revoke the server session, then clear cookies. */
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: HttpResponse,
  ): Promise<void> {
    try {
      const token = readCookie(req.headers.cookie, SESSION_COOKIE_NAME);

      // CSRF: logout is state-changing. Resolve the presented session
      // SERVER-SIDE to obtain its bound CSRF hash — logout is not guarded (it
      // must stay idempotent and non-enumerating), so `req.auth` is not
      // populated here. When no valid session exists there is nothing to
      // revoke, and the request is treated as a silent, non-enumerating no-op
      // (cookies are still cleared below).
      const resolved = token ? await this.authService.resolveSession(token) : null;
      if (resolved) {
        const cookieToken = readCookie(req.headers.cookie, CSRF_COOKIE_NAME);
        const headerToken = req.headers[CSRF_HEADER];
        const headerValue = Array.isArray(headerToken) ? headerToken[0] : headerToken;
        const ok = verifyCsrfProof({
          cookieToken,
          headerToken: headerValue,
          sessionHash: resolved.csrfHash,
        });
        if (!ok) {
          throw new CsrfInvalidError();
        }

        // Revoke server-side FIRST (awaited), THEN clear cookies.
        await this.authService.logout(token);
      }

      const sessionPolicy = sessionCookiePolicy(
        this.options.nodeEnv,
        this.options.sessionTtlMinutes,
      );
      const csrfPolicy = csrfCookiePolicy(this.options.nodeEnv, this.options.sessionTtlMinutes);
      res.setHeader('Set-Cookie', [
        serializeClearedCookie(sessionPolicy),
        serializeClearedCookie(csrfPolicy),
      ]);
      res.setHeader('Cache-Control', 'no-store');
    } catch (error) {
      throw this.toHttp(error, req);
    }
  }

  /** GET /auth/me — the authenticated principal (no credential/hash data). */
  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: AuthenticatedRequest): { user: PrincipalBody } {
    // The guard guarantees `req.auth`; this access never leaks detail.
    return { user: toPrincipalBody(req.auth!.principal) };
  }

  /**
   * GET /auth/session — a representative authentication-only protected route.
   * Returns the caller's session identity and nothing role-dependent.
   */
  @Get('session')
  @UseGuards(AuthGuard)
  session(@Req() req: AuthenticatedRequest): {
    authenticated: true;
    user: { publicId: string; login: string };
  } {
    const principal = req.auth!.principal;
    return {
      authenticated: true,
      user: { publicId: principal.publicId, login: principal.login },
    };
  }

  /** Compose a bounded rate-limit key from the login and client address. */
  private loginKey(req: HttpRequest, login: unknown): string | undefined {
    const rawIp = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const ip = Array.isArray(rawIp) ? rawIp[0] : rawIp;
    if (typeof login !== 'string') return `login:__invalid__|${ip}`;
    const normalized = login.normalize('NFC').trim().toLowerCase();
    return `login:${normalized}|${ip}`;
  }

  /** Translate a caught auth error to an HttpException, or rethrow. */
  private toHttp(error: unknown, req: HttpRequest): never {
    const mapped = mapAuthError(error, requestIdOf(req));
    if (mapped) {
      throw new HttpException(mapped.body, mapped.status);
    }
    throw error;
  }
}

/** The externally visible principal (NO credential/hash/session data). */
interface PrincipalBody {
  readonly publicId: string;
  readonly login: string;
  readonly roles: readonly string[];
}

function toPrincipalBody(principal: {
  publicId: string;
  login: string;
  roles: readonly string[];
}): PrincipalBody {
  return { publicId: principal.publicId, login: principal.login, roles: principal.roles };
}
