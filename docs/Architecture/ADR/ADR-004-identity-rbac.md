# ADR-004 — Identity and RBAC Foundation

- **Status:** Accepted by Owner — implementation remains limited to approved CP-00 task contracts.
- **Checkpoint:** CP-00
- **Depends on:** ADR-001, ADR-003

## Decision

CP-00 defines a minimal identity boundary with roles `ADMIN`, `TEACHER`, and `STUDENT`.

- A user has a stable non-guessable external identifier, normalized unique login identifier, account state, role membership and timestamps.
- Password credentials are separate from user profile data. Store only a modern memory-hard password hash and required metadata; never plaintext/reversible values.
- CP-00 account states are limited to active, disabled and pending/bootstrap where required. Any lifecycle state that changes access invalidates sessions according to ADR-003.
- Role checks execute server-side through policy/guard contracts. UI visibility never grants authorization.
- CP-00 RBAC does not model teacher classes, student profiles, assignments or object-level relationships. Those belong to later checkpoints; future policy checks must combine role and resource relationship.
- Bootstrap creates no hard-coded production password and never overwrites/recreates an existing privileged account.

## Required tests

1. Unique identity invariant is enforced.
2. Credential storage contains hashes only.
3. Anonymous access is denied to protected routes.
4. STUDENT is denied representative teacher/admin route.
5. TEACHER is denied representative admin route.
6. Authorized role is allowed representative route.
7. Disabled account/session is rejected after invalidation.
8. Auth errors do not leak account existence or credential details.

## Non-goals

No social login, SSO, password reset delivery, email verification, teacher/student relationship schema, class enrollment, learner profile, public registration policy, or content/domain authorization in CP-00 unless Owner approves a separate task/ADR.

## Open decisions

- Login identifier format and registration/invitation policy.
- Password reset/verification channel and production email provider.
- Exact object-level authorization model for CP-06.
- Data retention/privacy policy for disabled accounts.

## Gate

Dev may implement Identity only after an approved CLP-00-05 task contract defines exact schema, endpoints, permitted files, migration, tests and security review. This ADR does not create code, schema or migration.
