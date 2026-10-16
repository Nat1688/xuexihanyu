# Database & Migration Foundation (CLP-00-04) + Identity Schema (CLP-00-05)

**Tasks:** CLP-00-04 — Database & migration foundation; CLP-00-05 — Identity domain schema.
**ADR:** [ADR-002](../../Architecture/ADR/ADR-002-postgresql-migrations-test-db.md) (PostgreSQL + Prisma
migrations + isolated test DB), [ADR-004](../../Architecture/ADR/ADR-004-identity-rbac.md) (identity/RBAC).

CLP-00-04 established the **migration foundation** with **no models** (empty baseline). CLP-00-05
supersedes that specific scope by adding **exactly three identity models** — `users`,
`password_credentials`, `user_roles` — per ADR-004. Everything else remains **forbidden** in
CP-00: sessions/login/CSRF tables, profiles, classes/enrollment, teacher/student relationships,
content, exercises, learning events, mastery, reporting and AI tables arrive in later,
separately approved tasks.

## Identity schema (CLP-00-05)

| Model (Prisma)         | Table                  | Purpose                                                       |
| ---------------------- | ---------------------- | ------------------------------------------------------------- |
| `User`                 | `users`                | Stable identity: public UUID, normalized unique login, state. |
| `PasswordCredential`   | `password_credentials` | 1:1 with `users`; **hash only** + algorithm metadata.         |
| `UserRoleAssignment`   | `user_roles`           | Role membership: ADMIN / TEACHER / STUDENT (composite PK).    |

Enums: `AccountState` = `PENDING | ACTIVE | DISABLED`; `UserRole` = `ADMIN | TEACHER | STUDENT`.

Key invariants (enforced in the DB and in tests):

- `users.public_id` — **UUID v4, UNIQUE**, the only externally surfaced identifier (never the
  surrogate `id`).
- `users.login_normalized` — **UNIQUE**; `login` holds the raw form. The domain normalizes
  (NFC → trim → lower-case) so casing/whitespace variants collide to one identity.
- `users.state` — enum, defaults to `PENDING`.
- `password_credentials` stores `algorithm`, `parameters` (JSONB) and `hash` **only** — there is
  no plaintext/reversible column. 1:1 via `UNIQUE(user_id)`.
- `user_roles` — `role` constrained by the enum; composite PK `(user_id, role)` prevents
  duplicates.

## What CLP-00-04/05 deliver

| Artifact                       | Purpose                                                             |
| ------------------------------ | ------------------------------------------------------------------- |
| `prisma/schema.prisma`         | Datasource (`postgresql`) + `prisma-client-js` generator + 3 identity models |
| `prisma/migrations/0_init/`    | Baseline migration (applies **no DDL**) — history baseline          |
| `prisma/migrations/<ts>_identity_domain/` | Identity DDL: enums + 3 tables + indexes + FKs           |
| `prisma/migrations/migration_lock.toml` | Pins the migration provider (`postgresql`)                 |
| `scripts/db/db-url.cjs`        | URL parse/classify + **strict reset guard** logic (pure, no I/O)    |
| `scripts/db/env.cjs`           | Reads the git-ignored `.env` for the DB URL names                   |
| `scripts/db/db-status.cjs`     | Migration status inspector (dev / test / both)                      |
| `scripts/db/db-migrate.cjs`    | `deploy` / `dev` / `validate` migration runner wrapper              |
| `scripts/db/db-reset-guard.cjs`| **`clp_test`-only** destructive reset guard (dry-run by default)    |
| `scripts/db/db-test-validate.cjs` | Zero→current validation + **approved-tables-only** assertion     |

## Datasource & connection URLs

Prisma reads the connection string from the environment variable named in the schema
(`env("DATABASE_URL")`). Two **names** are used (values never committed):

| Variable            | Environment              | Example database |
| ------------------- | ------------------------ | ---------------- |
| `DATABASE_URL`      | development (`clp_dev`)  | `clp_dev`        |
| `TEST_DATABASE_URL` | isolated test (`clp_test`)| `clp_test`      |

Both live **only** in the git-ignored repo-root `.env`. `.env.example` lists the **names and
placeholder values** (with `CHANGE_ME`) — never real credentials. These URLs are used by the
Prisma CLI and the `scripts/db/*` helpers; they are **not** part of the API server config
boundary (`apps/api/src/config/`, CLP-00-03) and never reach the SPA.

## Required local topology

- **PostgreSQL 15+** reachable at the host/port in your `.env`.
- A **login role** (e.g. `clp_app`) that is **not** a superuser and **cannot** `CREATEROLE` /
  `CREATEDB` — the foundation tooling only needs DDL on the two CLP databases.
- Databases `clp_dev` and `clp_test` owned by that role.

Connection URLs must target **local hosts** (`localhost`, `127.0.0.1`, `::1`,
`host.docker.internal`) for the reset guard to permit any destructive action.

## Commands (run from the repository root)

```bash
# Validate the schema parses (no DB connection)
npm run db:validate

# Regenerate the Prisma client from schema.prisma
npm run db:generate

# Inspect migration status
npm run db:status           # both dev and test
npm run db:status:dev
npm run db:status:test

# Apply pending migrations
npm run db:migrate:deploy           # -> DATABASE_URL (clp_dev)
npm run db:migrate:deploy -- --env test   # -> TEST_DATABASE_URL (clp_test)

# Create + apply a development migration (clp_dev only; rewrites are refused elsewhere)
npm run db:migrate:dev

# Strict test reset (DESTRUCTIVE, clp_test only, dry-run first)
npm run db:test:reset:dry-run       # classify + report, no change
npm run db:test:reset               # reset clp_test and re-apply migrations from zero

# Full zero->current validation on clp_test + approved-tables-only assertion
npm run db:test:validate
```

### Workflow policy (ADR-002)

- **Append-only history.** Migrations are added, never edited in place once applied. There are
  **no down migrations** and **no `prisma db push`** — the schema reaches databases only
  through committed migrations under `prisma/migrations/`.
- **`migrate dev` is for `clp_dev` only.** The wrapper refuses any non-`clp_dev` / non-local
  target because `migrate dev` can rewrite history.
- **`clp_test` is reset, never incrementally mutated.** It is the only resettable database, and
  only via the guard with explicit confirmation.

## The strict `clp_test` reset guard

`scripts/db/db-reset-guard.cjs` permits a destructive reset **only** when *all* hold:

1. the URL parses as a `postgresql:`/`postgres:` URL;
2. the database name is **exactly** `clp_test`;
3. the host is a recognised **local** host;
4. explicit confirmation is present (`--yes` or `CLP_RESET_CONFIRM=1`).

`clp_dev` and **any other** database are always refused. The default mode is **dry-run**
(report only). The guard is covered by unit tests
(`apps/api/test/db/db-url.spec.ts`, `db-env-guard.spec.ts`).

## Verification performed (CLP-00-05 task)

Against a local PostgreSQL 15.19 instance with `clp_app` (non-superuser):

- `npm run db:validate` → schema parses (`prisma/schema.prisma` valid).
- `node scripts/db/db-migrate.cjs deploy` → `20261014100700_identity_domain` applied to `clp_dev`;
  `db:status both` → up to date (dev) / pending (test, before deploy).
- `npm run db:test:validate` → `PASS: zero->current, only approved identity tables present.`
- Table inventory (both DBs): `_prisma_migrations`, `password_credentials`, `user_roles`, `users`
  — the three approved identity tables only.
- Live integration suite `npm run test:integration` (against `clp_test`): 5/5 PASS — public-UUID
  uniqueness, normalized-login uniqueness, account-state enum, role enum + PK, hash-only credential
  1:1.

## Local database impact

The tooling creates/uses **`clp_dev`** and **`clp_test`** on your local PostgreSQL only. It
creates only Prisma's `_prisma_migrations` bookkeeping table plus the three approved CLP-00-05
identity tables, and performs **no** destructive action unless `db:test:reset` (or
`db:test:validate`) is invoked with the guard's confirmation against `clp_test`.

---

# Content Domain (CP-01)

**Task:** CP-01 — Content domain (teacher-managed curriculum hierarchy + reusable Chinese-aware
learning items). **Status:** Accepted by Owner.

CP-01 adds the **content foundation** only, within the accepted task contract: the ordered
curriculum hierarchy (`courses` → `units` → `lessons`) plus a reusable learning-item library with
an explicit Chinese-aware `kind` and a lesson↔item association. It is added by one new,
append-only migration; no existing table is altered.

## Schema (CP-01)

| Model (Prisma)       | Table                   | Purpose                                                          |
| -------------------- | ----------------------- | ---------------------------------------------------------------- |
| `Course`             | `courses`               | Top of the hierarchy; UNIQUE slug, indexed order, author, visibility. |
| `Unit`               | `units`                 | Belongs to one course; ordered per course.                       |
| `Lesson`             | `lessons`               | Belongs to one unit; ordered per unit.                           |
| `LearningItem`       | `learning_items`        | Reusable Chinese-aware item with an explicit `kind`.             |
| `LessonLearningItem` | `lesson_learning_items` | Ordered lesson↔item association.                                 |

Enums: `ContentVisibility` = `DRAFT | PUBLISHED`; `LearningItemKind` =
`VOCABULARY | CHARACTER | GRAMMAR | EXAMPLE | MEDIA_REFERENCE`.

Key invariants (enforced in the DB and in tests):

- `courses.slug` is **UNIQUE**; `courses.position` is **indexed** for ordering (NOT globally
  unique, so any number of courses may coexist).
- `units` UNIQUE `(course_id, slug)` and `(course_id, position)` — order/slug uniqueness is
  **within the parent course**.
- `lessons` UNIQUE `(unit_id, slug)` and `(unit_id, position)` — order/slug uniqueness is
  **within the parent unit**.
- Every node carries `visibility` (default `DRAFT`) and an `author_id` FK (TEACHER/ADMIN).
- `learning_items` carries an explicit `kind` plus Chinese fields `simplified`, `traditional`,
  `pinyin`, `meaning`, `hsk_level` and a structured `reference` JSONB. A `MEDIA_REFERENCE` item
  stores **no media** — only a structured reference (no media table exists).
- `lesson_learning_items` composite PK `(lesson_id, learning_item_id)` + UNIQUE
  `(lesson_id, position)` orders items within a lesson; items are reusable across lessons.

## Authorization & read policy (CP-01)

- **All authoring mutations require TEACHER/ADMIN, enforced server-side.** The HTTP routes are
  guarded by the shared `AuthGuard` + `RoleGuard` (`@RequireRoles('TEACHER','ADMIN')`), and the
  per-object rule is applied in `ContentService` via the domain policy: a **TEACHER may mutate
  only their OWN content**; an **ADMIN any**. A non-authoring caller is refused with a uniform 403.
- **Students read only PUBLISHED content.** DRAFT content is authorable but filtered out of every
  student-facing read server-side (`content-read-policy.ts`). UI hiding is never authorization.
- Reads are **deterministic** (stable ordering) and carry **no** exercise generation/evaluation.

## Migration (CP-01)

| Artifact                                          | Purpose                                                        |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `prisma/migrations/20261016030000_content_domain/` | CP-01 DDL: 2 enums + 5 tables + indexes + FKs (append-only).   |

Generated with `prisma migrate diff --from-url <clp_test current> --to-schema-datamodel
prisma/schema.prisma --script` (deterministic; no shadow DB). The approved-tables assertion in
`db:test:validate` and the schema/secret gates were extended to include exactly these tables.

## Verification performed (CP-01 task)

Against a local PostgreSQL instance with `clp_app` (non-superuser):

- `npm run db:validate` → schema parses.
- `npm run db:test:validate` → `PASS: zero->current, only approved identity tables present.`
  Table inventory (`clp_test`): `_prisma_migrations`, `courses`, `learning_items`,
  `lesson_learning_items`, `lessons`, `password_credentials`, `sessions`, `units`, `user_roles`,
  `users` — the approved set only.
- Unit suite (identity + content): 388/388 PASS. Content covers the hierarchy order/uniqueness/
  ownership matrix, the Chinese field + item-kind contracts, and the read-visibility policy.
- Integration suite against `clp_test`: 20/20 PASS — including content persistence invariants
  (per-parent position/slug uniqueness, Chinese field round-trip, ordered lesson items, FK).
- HTTP authorization e2e: anonymous → 401, STUDENT → 403, TEACHER → 201, cross-owner TEACHER →
  403, ADMIN → allowed; students never see DRAFT content.
- `npm run secret-scan` → PASSED (no findings).

---

# Learning Events (CP-03)

**Task:** CP-03 — Learning events (append-only, versioned interaction evidence).
**Status:** Accepted by Owner.

CP-03 adds the **append-only learning-event foundation** only, within the accepted task contract: a
single immutable `learning_events` record capturing *that* an interaction happened, with a versioned
payload and bounded, allow-listed metadata. It is added by one new, append-only migration; no
existing table is altered.

## Schema (CP-03)

| Model (Prisma)  | Table             | Purpose                                                       |
| --------------- | ----------------- | ------------------------------------------------------------- |
| `LearningEvent` | `learning_events` | Append-only, versioned interaction evidence (one row per event). |

Enum: `LearningEventType` = `LESSON_STARTED | LESSON_COMPLETED | EXERCISE_PRESENTED |
ANSWER_SUBMITTED | EXERCISE_COMPLETED | REVIEW_ACTIVITY`.

Key invariants (enforced in the DB and in tests):

- `public_id` is a non-guessable **UNIQUE** UUID, distinct from the surrogate `id` (which never
  leaves persistence).
- `schema_version` is a bounded integer (currently `1`); `type` is constrained to the enum.
- `actor_id` FK → `users` with **ON DELETE RESTRICT** — evidence is attributable and never ownerless.
- Optional `course_id`/`unit_id`/`lesson_id`/`learning_item_id` FKs use **ON DELETE SET NULL** — the
  interaction record **survives** deletion of its content.
- `exercise_ref` is bounded `VARCHAR(200)`; `metadata` is bounded `JSONB`; `occurred_at`/`created_at`
  are `TIMESTAMPTZ`.
- Indexes support deterministic reads: `(actor_id, occurred_at)`, `(occurred_at, id)`, and `(type)`.
- **Append-only:** the migration defines no update/delete trigger and no mutable column; the
  application port/service expose no mutation method (asserted by tests).

## Privacy & retention (CP-03)

- **Events are evidence, not derived progress.** A row records interaction evidence and a normalized
  outcome only; mastery/review scheduling/progress projection is **CP-04** and absent here.
- **Metadata is fail-closed and allow-listed** (`mode`, `format`, `outcome`, `durationMs`,
  `feedbackCode`, `source`) with per-key/total size limits; any other key (`answer`, `token`,
  `cookie`, `csrf`, `sessionId`, …) is rejected and its value is never echoed.
- No raw answers/credentials/cookies/CSRF/session payloads are stored.
- Teacher/admin reporting is deferred to a separately approved reporting/query contract.

## Migration (CP-03)

| Artifact                                           | Purpose                                                       |
| -------------------------------------------------- | ------------------------------------------------------------- |
| `prisma/migrations/20261016100400_learning_events/` | CP-03 DDL: 1 enum + 1 table + indexes + FKs (append-only).    |

Hand-written to match the deterministic `prisma migrate diff … --script` format (no shadow DB was
available in the implementation environment). The match was **verified** by diffing the live
`clp_test` schema (after applying the migration) against `prisma/schema.prisma`, which produced
“an empty migration”. The approved-tables assertion in `db:test:validate` and the schema/structural
gates were extended to include exactly this table and enum.

## Verification performed (CP-03 task)

Against a local PostgreSQL instance with `clp_app` (non-superuser):

- `npm run db:validate` → schema parses.
- Full migration reset on `clp_test` → all five migrations apply cleanly from zero.
- `prisma migrate diff --from-url <clp_test current> --to-schema-datamodel prisma/schema.prisma
  --script` → `empty migration` (migration is byte-equivalent to the schema).
- Unit + schema-structural suite: 499/499 PASS — covering the closed vocabulary, the schema-version
  policy, the metadata allow-list/privacy guard (fail-closed, no value echoed), deterministic
  `(occurredAt, id)` ordering, the append-only boundary (no update/delete method at port or service),
  and the CP-03 schema/migration facts.
- Integration suite against `clp_test`: 30/30 PASS — including learning-event persistence
  (public UUID, closed type, FK attributability, `SET NULL` on content deletion, deterministic
  ordering, bounded JSONB metadata).
