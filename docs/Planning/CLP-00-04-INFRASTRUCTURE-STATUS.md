# CLP-00-04 Infrastructure Status

**Date:** 2026-10-14  
**Status:** Blocked before role/database provisioning.

## Confirmed host state

- PostgreSQL 17.11 client tools are installed.
- Windows service `postgresql-x64-17` is running.
- `pg_isready -h 127.0.0.1 -p 5432` reports that the server accepts connections.
- Host-managed PostgreSQL path is accepted in ADR-002A.

## Not yet created

- No `clp_app` role.
- No `clp_dev` or `clp_test` database.
- No `.env` credential file.
- No Prisma schema, migration, table or seed data.

## Blocker

The PostgreSQL superuser password is unknown after silent installation. Password recovery requires a controlled temporary local authentication change plus restart of `postgresql-x64-17`. Gateway policy currently lacks permission to restart that Windows service.

`pg_hba.conf` was restored from backup after the unsuccessful recovery attempt. No temporary `trust` rule remains.

## Required next gate

One of the following must happen before CLP-00-04 implementation:

1. Grant the agent an approved elevated capability that can restart the PostgreSQL Windows service, then run the documented recovery procedure; or
2. An owner/administrator resets the local `postgres` password and provides a secure non-chat credential-entry path; or
3. Replace the host-managed local database decision with another Owner-approved orchestration path.

After admin access is available, Năm must obtain explicit approval for exact `clp_app`, `clp_dev`, `clp_test` provisioning and the secret storage method before creating any database objects.
