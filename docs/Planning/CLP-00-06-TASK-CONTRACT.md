# Task Contract — CLP-00-06 Authentication & Session Lifecycle

**Status:** Accepted by Owner — Dev may execute only the stated authentication/session scope.

## Objective

Implement login, logout and current-user session behavior using opaque server-side sessions in PostgreSQL, as defined by ADR-003. Authentication proves identity only; role authorization remains CLP-00-07.

## Permitted schema

- `sessions` table only: opaque random identifier/hash boundary, user foreign key, created/last-used/expiry/revoked timestamps and minimum safe metadata.
- No role-policy/session permission snapshot, profile or domain data.

## Permitted endpoints

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- One representative authentication-only protected endpoint returning 401 for anonymous access; no role policy/guard beyond authentication.

## Security rules

- Verify passwords through the Identity `PasswordHasher`; never log/store raw password.
- Login failure response is uniform for unknown login, wrong password, disabled or pending state.
- Rotate session on successful login; logout revokes server-side session before clearing cookie.
- Opaque session cookie: HttpOnly; Secure outside development; explicit SameSite/path/max age; no browser JWT.
- CORS/CSRF contract stays ADR-003-compatible; state-changing session endpoints use the selected minimal CSRF-compatible policy and tests.
- Rate limit only login with bounded in-memory development implementation; no distributed provider or production claim.

## Forbidden

No RBAC guard/controller or ADMIN/TEACHER/STUDENT authorization behavior, no password reset/email/SSO, no public registration, no profile/class/content/domain feature, no production cookie domain/TLS config, no CI/deploy/remote.

## Acceptance criteria

1. Migration adds only sessions table and indexes/FK approved above.
2. Valid login returns opaque cookie and `/auth/me` identity without password/hash/credential data.
3. Uniform invalid login response avoids enumeration; disabled/pending do not authenticate.
4. Logout invalidates server session and replayed cookie is rejected.
5. Anonymous protected route gets 401; role guard is not implemented.
6. Tests cover rotation, expiry/revocation, cookie attributes by environment, non-leak, and login rate limit.
7. clp_test zero-to-current migration, integration tests, quality gates and secret scan pass.
