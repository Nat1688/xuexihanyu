# Task Contract — CLP-00-07 RBAC / Authorization Foundation

**Status:** Accepted by Owner — implementation may proceed only within this RBAC scope.

## Objective

Add server-side role authorization for the existing authenticated principal. Roles are resolved from current user role membership; no permission snapshot is stored in sessions.

## Permitted implementation

- `RequireRoles` metadata/decorator and a server-side role guard layered after `AuthGuard`.
- A policy helper that accepts only `ADMIN`, `TEACHER`, `STUDENT`.
- Three representative test-only authorization routes under a CP-00 internal prefix: admin-only, teacher-or-admin, authenticated-only.
- Uniform 401 for absent/invalid session and 403 for authenticated insufficient role.
- Unit/API tests for the required matrix.

## Required negative matrix

| Caller | Auth-only | Teacher/Admin | Admin |
|---|---|---|---|
| Anonymous | 401 | 401 | 401 |
| STUDENT | 200 | 403 | 403 |
| TEACHER | 200 | 200 | 403 |
| ADMIN | 200 | 200 | 200 |

## Forbidden

No role mutation API/UI, no class/enrollment/profile/resource ownership, no teacher→student object policy, no session role snapshot, no new domain table or migration, no password/session flow changes, no CI/deploy/remote.

## Acceptance

- All authorization decisions occur server-side after session authentication.
- Tests prove every matrix row and no SPA hiding reliance.
- 401/403 bodies do not leak session/token/credential details.
- Existing auth/migration/secret gates remain passing.
- Dev/Năm reports exact routes and confirms they are representative CP-00 scaffolding, not a public API commitment.
