# Database & Migration Foundation (CLP-00-04)

**Task:** CLP-00-04 — Database & migration foundation.
**ADR:** [ADR-002](../../Architecture/ADR/ADR-002-postgresql-migrations-test-db.md) (PostgreSQL + Prisma
migrations + isolated test DB).

This document describes the **migration foundation only**. There is **no domain schema** yet:
`prisma/schema.prisma` declares the PostgreSQL datasource and the Prisma client generator and
**no models**. Users, sessions, roles, content, exercises, learning events, mastery, reporting
and AI tables are all **forbidden** in CP-00 and arrive in later, separately approved tasks.

## What CLP-00-04 delivers

| Artifact                       | Purpose                                                             |
| ------------------------------ | ------------------------------------------------------------------- |
| `prisma/schema.prisma`         | Datasource (`postgresql`) + `prisma-client-js` generator, **no models** |
| `prisma/migrations/0_init/`    | Baseline migration (applies **no DDL**) — history baseline          |
| `prisma/migrations/migration_lock.toml` | Pins the migration provider (`postgresql`)                 |
| `scripts/db/db-url.cjs`        | URL parse/classify + **strict reset guard** logic (pure, no I/O)    |
| `scripts/db/env.cjs`           | Reads the git-ignored `.env` for the DB URL names                   |
| `scripts/db/db-status.cjs`     | Migration status inspector (dev / test / both)                      |
| `scripts/db/db-migrate.cjs`    | `deploy` / `dev` / `validate` migration runner wrapper              |
| `scripts/db/db-reset-guard.cjs`| **`clp_test`-only** destructive reset guard (dry-run by default)    |
| `scripts/db/db-test-validate.cjs` | Zero→current validation + "no domain tables" assertion           |

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

# Regenerate the Prisma client from schema.prisma (no models -> empty client)
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

# Full zero->current validation on clp_test + "no domain tables" assertion
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

## Verification performed (this task)

Against a local PostgreSQL 15.19 instance with `clp_app` (non-superuser):

- `npm run db:migrate:deploy` → `0_init` applied to `clp_dev`; `db:status:dev` = up to date.
- `npm run db:test:reset:dry-run` → reported `would be permitted with --yes` (no change);
  `--env dev` dry-run → **refused** (`only clp_test may be reset`).
- `npm run db:test:reset` → reset `clp_test` to zero then applied `0_init`.
- `npm run db:test:validate` → `PASS: zero->current, no domain tables`.
- Table inventory (both DBs): only `_prisma_migrations` exists — **no domain tables**.

## Local database impact

The tooling creates/uses **`clp_dev`** and **`clp_test`** on your local PostgreSQL only. It
creates no tables other than Prisma's own `_prisma_migrations` bookkeeping table, and performs
**no** destructive action unless `db:test:reset` (or `db:test:validate`) is invoked with the
guard's confirmation against `clp_test`.
