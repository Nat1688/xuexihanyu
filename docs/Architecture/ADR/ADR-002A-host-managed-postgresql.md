# ADR-002A — Host-Managed PostgreSQL for Local Development and Test

- **Status:** Accepted by Owner — supersedes the Docker Compose local/test topology in ADR-002 for the approved host-managed local/test path.
- **Reason:** The host has no PostgreSQL client/service/install and no Compose provider, so Compose cannot be runtime-validated.

## Decision

Use a directly installed, host-managed PostgreSQL instance for local development and integration tests.

- PostgreSQL binds to loopback only unless a later ADR explicitly approves remote access.
- Create separate non-production roles and databases: one development database and one disposable test database. Test credentials never target the development database.
- Names must use a CLP-specific prefix and test reset commands must reject any database name outside the approved test prefix.
- Credentials reside only in local ignored `.env`/OS secret storage; `.env.example` contains names/placeholders only.
- Test lifecycle: create/migrate/reset the test database deterministically; never drop/reset the development database.
- Development backup/recovery documentation is minimal and explicitly non-production. Production provider, backup retention and restore objectives remain deferred.

## Installation/provisioning proposal

1. Install a supported PostgreSQL Windows distribution using an approved installer/package-manager path.
2. Confirm service status, client version, loopback port and data directory without logging credentials.
3. Create least-privilege CLP application role plus separate development/test databases after Owner approves the exact names and secret-entry method.
4. Verify client connectivity, database isolation and test-name guard before CLP-00-04 implementation.

## Consequences

- Removes dependency on missing Compose provider.
- Adds host service lifecycle, local disk/data directory and upgrade responsibility.
- Test isolation remains mandatory but requires guardrails in code/scripts.
- Docker Compose stays in the repository as a future/deferred declaration unless a later task removes it after an explicit ADR update.

## Open decisions

- Exact PostgreSQL major version (recommend currently supported stable major compatible with Prisma).
- Installer source/package manager and whether it needs admin/UAC approval.
- Approved local database names, local role name and secure method for entering its password.
- Loopback port if 5432 becomes occupied.

## Provisioning record (2026-09-30)

- Owner approved host-managed provisioning.
- PostgreSQL 17.11 was installed through Windows Package Manager.
- Windows service `postgresql-x64-17` is running; `pg_isready -h 127.0.0.1 -p 5432` reports accepting connections.
- No CLP application role, development database, test database, schema, migration or credential file was created.
- Administrator password recovery is **deferred**: the agent can read/write the PostgreSQL config directory but cannot restart the Windows service under current gateway privilege policy. `pg_hba.conf` was restored from backup after the failed recovery attempt; no authentication policy remains changed.

## Gate

No CLP role/database creation, schema or migration may begin until a local PostgreSQL administrator credential is recovered or securely supplied and the Owner approves the exact role/database provisioning contract.
