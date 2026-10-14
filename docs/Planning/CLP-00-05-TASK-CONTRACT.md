# Task Contract — CLP-00-05 Identity Domain

**Status:** Accepted by Owner — Dev may execute only the stated identity scope.

## Objective

Implement the minimal persistence/domain boundary for user identity, password credential and role membership required by ADR-004. No authentication HTTP/session flow is included.

## Permitted schema

- `users`: internal primary key, non-guessable public UUID, normalized unique login identifier, account state (`PENDING`, `ACTIVE`, `DISABLED`), created/updated timestamps.
- `password_credentials`: one-to-one user relationship, modern memory-hard password hash and algorithm metadata only; no plaintext/reversible password.
- `user_roles`: normalized membership constrained to `ADMIN`, `TEACHER`, `STUDENT`.

## Permitted implementation

- Prisma models/migration for the three identity tables only.
- Domain/application value types/services for normalization, role validation, account state and password hashing boundary.
- Unit/integration tests using synthetic users/passwords and clp_test only.
- Migration docs and guarded test database reset.

## Forbidden

No login/logout/current-user/session/cookie/CSRF endpoint, no RBAC guard/controller, no profile/class/enrollment, no teacher/student relationship, no content/exercise/event/mastery/reporting/AI table, no seed/bootstrap admin, no real user data, no password reset/email/SSO, no CI/deploy.

## Acceptance criteria

1. Migration applies on clp_dev and zero-to-current on clp_test.
2. Public UUID and normalized login uniqueness constraints are enforced.
3. Only password hashes are persisted; raw password never reaches Prisma data/log/error.
4. Role membership accepts only three ADR roles; account state only approved values.
5. Tests cover duplicate normalized login, invalid role/state, password non-leak and disabled-state behavior at domain level.
6. `npm ci`, format/lint/typecheck/build/test, secret scan and migration status pass.
7. Dev reports exact SQL/schema impact; Năm verifies table inventory contains only Prisma metadata plus three approved identity tables.

## Security review

Password algorithm/library and parameters must be named in implementation and independently testable. Any HTTP authentication, session invalidation or authorization behavior is CLP-00-06/07 and must not be silently added.
