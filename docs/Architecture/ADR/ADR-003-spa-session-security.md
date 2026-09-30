# ADR-003 — React SPA, Server-Side Session and Browser Security Boundary

- **Status:** Accepted by Owner — implementation remains limited to approved CP-00 task contracts.
- **Date:** 2026-09-30
- **Checkpoint:** CP-00
- **Depends on:** ADR-001

## Context

ADR-001 selects a React SPA (Vite) calling a NestJS REST API, opaque server-side sessions stored in PostgreSQL, and Docker Compose for local PostgreSQL. The browser is an untrusted client: it receives no database credential, privileged secret, or authorization authority. Authentication and authorization remain server-side.

## Decision

### Topology

- The SPA and API are separate logical origins in local development; the exact hosts/ports are configuration, not hard-coded contract.
- Production should prefer same-site deployment behind a single public site/domain when operationally practical. If the SPA and API are cross-site, the Owner must approve the additional cookie, CSRF, CORS and privacy implications before release.
- The API is the only authority for authentication, session validity and RBAC. SPA route hiding is only UX and never access control.

### CORS

- Credentialed CORS is allowed only for an explicit environment-specific allowlist of exact SPA origins.
- Do not use `*` for an origin with credentials. Do not reflect arbitrary request origins.
- Allow only required methods and request headers. Preflight responses are explicit, cache-bounded and tested.
- CORS configuration is typed environment configuration, fails closed if required origin values are absent/malformed, and never contains production secrets.

### Session cookie

- The browser stores only an opaque session identifier in an `HttpOnly` cookie; no browser-accessible bearer token is the default.
- Cookies use `Secure` outside explicitly documented local HTTP development, a narrow `Path`, no unnecessary `Domain`, and an environment-appropriate `SameSite` policy.
- Session records live server-side in PostgreSQL and include expiry, revocation/invalidation state and only minimum metadata required for security/operations.
- Rotate the session identifier on successful login and any privilege elevation. Logout invalidates the server-side session before clearing the browser cookie. Password reset, account disable and role/security events must invalidate affected sessions according to the future Identity policy.

### CSRF

- State-changing cookie-authenticated requests require CSRF protection in addition to CORS.
- CP-00 adopts a synchronizer-token or signed double-submit mechanism selected during implementation; the token is validated server-side and is bound/verified against the active session as appropriate to the chosen mechanism.
- Safe methods do not change state. Origin/Referer validation is defense in depth, not the only CSRF control.
- Login CSRF/session fixation is explicitly tested; login rotates the session.

### Authentication, authorization and errors

- API flows required in CP-00: login, logout, current user/session check and representative protected routes.
- Login uses uniform externally visible failure responses for invalid credentials/account states unless a documented policy requires otherwise; do not reveal account existence, role or password state.
- Authorization failures do not reveal unauthorized resource existence unnecessarily. API error bodies omit stack traces, SQL/ORM errors, tokens and sensitive student content.
- RBAC is evaluated on the server for every protected operation. Future teacher/student object-level checks do not rely only on role membership.

### Abuse, browser hardening and logging

- Apply rate limits to login and other sensitive endpoints using an implementation selected with deployment topology; responses must not become an account-enumeration oracle.
- Use security headers appropriate to a SPA/API: CSP designed for the actual SPA assets, `frame-ancestors` or equivalent clickjacking protection, `X-Content-Type-Options: nosniff`, referrer policy and transport security only on TLS-enabled environments.
- Prevent XSS through framework-safe rendering, runtime input validation, output encoding and a restrictive CSP; never put secrets in SPA bundles or logs.
- Structured logs include request/correlation identifiers and security event categories but redact passwords, session IDs, cookies, authorization headers, CSRF values, tokens and unnecessary student data.

## Required CP-00 test matrix

1. Valid login rotates a pre-login session and returns a valid authenticated session.
2. Invalid login produces the same safe external response for unknown user and wrong password; no credential/session value appears in logs.
3. Logout invalidates server-side state; replay of the previous cookie is rejected.
4. Anonymous access to protected endpoints is rejected; `STUDENT` is denied teacher/admin route; `TEACHER` is denied admin route; authorized role succeeds.
5. Credentialed requests from an allowed SPA origin pass CORS/preflight; disallowed/unlisted origin cannot receive credentialed API access.
6. State-changing request without valid CSRF proof is rejected even with a valid session; valid CSRF proof succeeds.
7. Cookie attributes match environment policy; secure cookies are not silently weakened outside local development.
8. API errors do not expose stack traces, SQL details, account enumeration, tokens or session identifiers.
9. Rate-limit behavior is deterministic and tested without relying on external services.
10. Browser security headers are present and tested for representative SPA/API responses.

## Consequences

- A separate SPA has a clear client/server boundary but needs deliberate CORS, cookie and CSRF configuration; it is not a reason to use browser JWTs by default.
- Local development configuration and production topology must be treated as security configuration, versioned through typed environment keys without committing secrets.
- Testing needs an actual browser-compatible HTTP setup or integration harness; unit tests alone are insufficient for cookies/CORS/CSRF.

## Open decisions before release-related tasks

1. Production site/API hostname topology and TLS/reverse-proxy provider.
2. Supported browser baseline and mobile-web policy.
3. Concrete rate-limit storage/strategy once production topology and scale are known.
4. Exact CSRF mechanism and SPA boot/config delivery details during implementation, reviewed against the selected NestJS/session libraries.
5. Repository host/CI provider remains deferred, but must be chosen before CLP-00-09.

## Non-goals

This ADR does not implement authentication code, database/session tables, CORS middleware, UI pages, Docker files, deployment config, external identity providers, JWT browser auth, AI integration or a public API.

## Verification gate

Before Dev begins CLP-00-06, Năm/SOL must turn this ADR into an approved task contract with exact permitted files, selected libraries, environment keys, acceptance criteria and the relevant test commands. Any request to weaken CORS, CSRF, cookie or authorization behavior requires explicit Owner approval and ADR update.
