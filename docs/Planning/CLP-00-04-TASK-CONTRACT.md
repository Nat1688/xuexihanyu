# Task Contract — CLP-00-04 Database & Migration Foundation

**Status:** Accepted by Owner — Dev may execute only the stated migration-foundation scope.

## Objective

Add Prisma migration tooling and a safe local PostgreSQL connection boundary. Establish inspectable migration history and deterministic test-database reset guard without adding any application/domain schema.

## Permitted changes

- Add compatible Prisma CLI/client dependencies and lockfile entries.
- Add `prisma/schema.prisma` with PostgreSQL datasource, generator and **no model definitions**.
- Add migration/test scripts that read local ignored `.env`, never commit connection URLs.
- Add test reset helper that refuses any database except exact `clp_test` and verifies host/database before destructive action.
- Add test/docs for URL classification, guard behavior, migration status and zero-to-current validation.
- Update README/.env.example/secret scan for Prisma command paths only.

## Explicitly forbidden

- Any Prisma model/table/schema beyond Prisma migration metadata.
- User, session, role, content, exercise, event, mastery, reporting or AI table.
- `db push`, manual SQL table creation, seed data, database drop/reset outside clp_test.
- Auth/API feature, Docker service start, CI/deploy/remote, real credential in tracked file.

## Acceptance criteria

1. `clp_dev` and `clp_test` URLs are derived from ignored local env; no URL/secret in Git.
2. `prisma migrate status` is inspectable for both environments.
3. Fresh `clp_test` reaches current migration state from zero.
4. Reset guard rejects `clp_dev`, any non-CLP name, unexpected host or missing explicit test confirmation.
5. Migration history is append-only; no down migration / db push workflow.
6. Existing format/lint/typecheck/build/test/secret scan pass plus migration tests.
7. Dev reports exact SQL-impacting files and confirms no domain tables exist.

## Required verification

- list non-system tables in clp_dev/clp_test before and after; only Prisma migration metadata may exist.
- connect as clp_app, verify it cannot create role/database.
- verify reset guard dry-run and rejection paths.
- run zero-to-current migration on clp_test only.

## Rollback/recovery

No destructive rollback is automated. If a foundation migration fails, stop, capture migration status, and use a forward corrective migration or explicit Owner-approved restore plan. Never edit an already-applied migration.
