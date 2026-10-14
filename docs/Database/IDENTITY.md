# Identity Domain (CLP-00-05)

**Task:** CLP-00-05 — Identity domain.
**ADR:** [ADR-004](../../Architecture/ADR/ADR-004-identity-rbac.md) (identity & role representation).

This document describes the **identity persistence and domain boundary only**. It implements the
approved slice of ADR-004 (users, password credentials, role membership) and **nothing else**.
Authentication/session (login/logout/current-user) is CLP-00-06; server-side authorization
guards are CLP-00-07. Neither is present here.

## Scope

Implemented:

- Prisma models + migration for **exactly three** tables: `users`, `password_credentials`,
  `user_roles`.
- Domain value types/services in `apps/api/src/modules/identity/domain/`: login normalization,
  role validation, account-state vocabulary, public-id minting, password-hash value type,
  identity aggregate + a pure `canAuthenticate` predicate.
- Application **port** `PasswordHasher` and an infrastructure **scrypt** implementation (the
  hashing boundary).
- Unit tests (pure) + a live integration suite against `clp_test`.

Explicitly **not** implemented (forbidden by the contract): login/logout/current-user/session/
cookie/CSRF endpoints, RBAC guards/controllers, profiles/classes/enrollment, teacher/student
relationships, content/exercise/learning-event/mastery/reporting/AI tables, seed/bootstrap admin,
password reset/email/SSO, CI/deploy changes.

## Persistence model

| Prisma model           | Table                  | Key columns |
| ---------------------- | ---------------------- | ----------- |
| `User`                 | `users`                | `id` (uuid PK), `public_id` (uuid, UNIQUE), `login`, `login_normalized` (UNIQUE), `state`, timestamps |
| `PasswordCredential`   | `password_credentials` | `id` (uuid PK), `user_id` (uuid, UNIQUE FK → users, ON DELETE CASCADE), `algorithm`, `parameters` (JSONB), `hash`, `password_changed_at`, timestamps |
| `UserRoleAssignment`   | `user_roles`           | `(user_id, role)` composite PK, FK → users (ON DELETE CASCADE), `created_at` |

Enums:

- `AccountState` = `PENDING` | `ACTIVE` | `DISABLED`
- `UserRole` = `ADMIN` | `TEACHER` | `STUDENT`

### Invariants

- **Public identifier:** `users.public_id` is a random UUID v4, UNIQUE. It is the only identifier
  surfaced to callers; the surrogate `id` never leaves persistence. `domain/public-user-id.ts`
  brands the type so a raw string cannot stand in, and only `newPublicUserId()` mints one.
- **Normalized unique login:** `login_normalized` is UNIQUE and is produced by
  `normalizeLogin()` — Unicode NFC → trim → lower-case. Two raw logins differing only by case
  or whitespace are the same identity and collide at the DB.
- **Account state:** only the three approved values; defaults to `PENDING`.
- **Hash only:** `password_credentials` stores `algorithm`, `parameters` and `hash` — there is no
  plaintext/reversible column. `UNIQUE(user_id)` enforces 1:1 with `users`.
- **Role membership:** `role` is constrained by the `UserRole` enum; the composite PK
  `(user_id, role)` prevents duplicate role rows.

## Password hashing boundary (security review)

- **Algorithm:** `scrypt` (RFC 7914) via Node's `node:crypto` — modern, **memory-hard**
  (resists GPU/ASIC parallelism), ships with the runtime (no third-party native build).
- **Parameters:** `N` (CPU/memory cost), `r` (block size), `p` (parallelism), `keylen`, plus a
  random per-hash **salt**. Defaults: `N=32768, r=8, p=1, keylen=32, saltLength=16`. `N`, `r`,
  `p` are persisted in `parameters` (JSONB); the salt is embedded in the encoded hash string:
  `scrypt$N=<n>,r=<r>,p=<p>$<saltBase64>$<derivedKeyBase64>`.
- **Verification** is constant-time (`crypto.timingSafeEqual`) and returns `false` for any
  mismatch — it never throws for a wrong password, and never for an unknown algorithm/malformed
  hash (returns `false`).
- **Non-leak:** the plaintext is an ephemeral `string` used only during `hash`/`verify`; it is
  never stored in `PasswordHash`, never logged, and never appears in thrown errors. Tests assert
  the plaintext is absent from the persisted value and from validation errors.
- The boundary is an **interface** (`PasswordHasher`), so the algorithm can be upgraded without
  touching domain logic and tests can inject a deterministic fake.

## Tests

| Suite | Location | Coverage |
| ----- | -------- | -------- |
| Domain unit | `apps/api/test/protected/identity-domain.spec.ts` | normalization + unified identity, exactly-3 roles, account states, public-id non-guessability, DISABLED/PENDING domain denial |
| Hashing unit | `apps/api/test/protected/identity-password-hasher.spec.ts` | algorithm/params metadata, non-reversible, random salt, verify correct/wrong, no plaintext leak, malformed input |
| Schema structural | `apps/api/test/db/prisma-identity-schema.spec.ts` | exactly the 3 approved models/enums; every migration creates only approved tables |
| Live DB integration | `apps/api/test/db/identity-persistence.int-spec.ts` | `clp_test` only: public-UUID uniqueness, normalized-login uniqueness, state enum, role enum + PK, hash-only 1:1 credential |

Run the default (no-DB) suite with `npm test`; the live suite with `npm run test:integration`
(requires `TEST_DATABASE_URL`/`clp_test`; it **skips** rather than fails when unavailable).

## Report (this task)

- **Migration:** `prisma/migrations/20261014100700_identity_domain/migration.sql` — created with
  `prisma migrate diff --from-empty --to-schema-datamodel` (deterministic, no shadow DB needed).
  It creates the two enums, three tables, three unique indexes and two FKs (exact SQL in the file).
- **Applied:** `db-migrate.cjs deploy` → `clp_dev`; `db:test:validate` → `clp_test` (zero→current).
- **Table inventory (both DBs):** `_prisma_migrations`, `password_credentials`, `user_roles`,
  `users` — Prisma metadata plus exactly the three approved identity tables.
- **Quality gates:** `npm ci`, format, lint, typecheck, build, test, secret scan, migration status
  — all PASS.
