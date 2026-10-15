# Local Backup & Recovery (CLP-00-10)

**Task:** CLP-00-10 — Operational baseline (local-only).
**Scope:** LOCAL development machines only.

> ## ⚠️ NON-PRODUCTION — READ FIRST
>
> This document describes a **manual, local-only** backup/recovery *procedure* for a
> developer's own PostgreSQL databases. It is **not** a production backup system.
> There is **no automation, no scheduling, no retention policy, no encryption at
> rest, no off-site copy, no monitoring and no restore testing** here. Do **not**
> rely on this for any real/student data, any shared environment, or any
> production deployment — those are **out of scope** for CP-00 and require a
> separately approved task (see the task contract's *Forbidden* section:
> "no production backup automation").
>
> Everything below assumes the **local topology** from
> [`docs/Database/MIGRATIONS.md`](../Database/MIGRATIONS.md): a local PostgreSQL
> 15+ with databases `clp_dev` (development) and `clp_test` (isolated test),
> reachable only on local hosts, with credentials in a git-ignored `.env`.
> Never back up to, or restore from, a committed file. **A dump contains real
> data and secrets — treat it as a secret and delete it when done.**

## What this covers

| Concern                     | In scope (local)                          | Out of scope (needs approval)         |
| --------------------------- | ----------------------------------------- | ------------------------------------- |
| Take a manual `pg_dump`     | ✅ documented command                     | Automated/scheduled dumps             |
| Restore a dump locally      | ✅ documented command (dev/test only)     | Restore into any shared/prod DB       |
| Retention / rotation        | ❌ none — you delete dumps yourself       | Any retention policy or lifecycle     |
| Encryption / off-site copy  | ❌ none                                   | Encrypted or remote backups           |
| Restore verification        | ✅ manual round-trip check                | Automated restore tests / monitoring  |

## Preconditions

- `pg_dump` / `pg_restore` / `psql` on `PATH` (PostgreSQL 15+ client tools).
  If your local install is not on `PATH`, the environment may provide an explicit
  binary path (for example the `CLP_PSQL_BIN` variable some local setups export).
- The target database's connection URL is available **locally** in `.env`
  (`DATABASE_URL` for `clp_dev`, `TEST_DATABASE_URL` for `clp_test`). Never paste a
  real URL/password into a command you commit or share.

## Take a backup (manual, local)

Use the connection URL from your local `.env`. Prefer passing credentials via the
environment (`PGPASSWORD` / `PGPASSFILE`) rather than on the command line, so the
password does not leak into shell history or process listings. Write the dump to a
git-ignored path (e.g. `tmp/` or outside the repo).

```bash
# Example only — substitute YOUR local values; never commit this.
# Option A: use a service file / .pgpass to avoid inline secrets.
mkdir -p tmp/backups
pg_dump --format=custom --no-owner \
  --dbname="$DATABASE_URL" \
  --file="tmp/backups/clp_dev-$(date +%Y%m%d-%H%M%S).dump"
```

- `--format=custom` produces a restorable archive that `pg_restore` can replay.
- `--no-owner` avoids ownership assumptions when restoring elsewhere.
- `tmp/` is git-ignored (`*.db`, `logs/`, etc.); confirm your dump path is ignored
  before writing it. **Never** leave a dump inside a tracked directory.

> The API never performs backups. This is a manual developer action, deliberately
> outside the running service.

## Restore a backup (LOCAL dev/test databases only)

**Only** restore over the local `clp_dev` or `clp_test` databases. Never restore
over any other database.

```bash
# 1. (Recommended) Recreate a clean local database first.
#    For the TEST database, the guarded helper can do a safe local reset:
npm run db:test:reset        # clp_test only — see docs/Database/MIGRATIONS.md

# 2. Restore the dump (custom format).
pg_restore --clean --if-exists --no-owner \
  --dbname="$DATABASE_URL" \
  "tmp/backups/clp_dev-YYYYmmdd-HHMMSS.dump"
```

- `--clean --if-exists` drops existing objects first (safe because the target is a
  **local** dev/test DB).
- If you restored a schema-only dump, re-apply migrations with
  `npm run db:migrate:deploy` (see [`MIGRATIONS.md`](../Database/MIGRATIONS.md)).

## Verify a restore (manual round-trip)

1. Point the API at the (local) restored database and start it.
2. Confirm the app reports ready: `GET /health/ready` returns
   `{ "status": "ok", "dependencies": { "database": "up" } }` (see the
   operational baseline doc). A `"down"` state means the database is not reachable.
3. Run the migration status check: `npm run db:status`.
4. Spot-check the identity tables exist and are populated as expected
   (`users`, `password_credentials`, `user_roles`, `sessions`) — **never** print
   `password_credentials.hash` or any credential value.
5. Delete the dump and any temporary restore artifacts when finished.

## Cleanup

```bash
# Remove local dumps when done — they contain real data and must not linger.
rm -f tmp/backups/*.dump
```

## Explicit limitations (restated)

- **No automation.** Every step is manual; nothing runs on a schedule.
- **No retention/rotation.** You are responsible for deleting dumps.
- **No encryption/off-site.** Local disk only; no remote or encrypted copies.
- **No monitoring/alerting.** Failures are silent; you must verify manually.
- **Not for production or real data.** CP-00 has no production deployment; this
  procedure is a developer convenience only.

Related: [`docs/Database/MIGRATIONS.md`](../Database/MIGRATIONS.md) (migration
foundation & guarded test reset), [`docs/Operations/OPERATIONAL-BASELINE.md`](OPERATIONAL-BASELINE.md)
(structured logging, request IDs, startup diagnostics, readiness).
