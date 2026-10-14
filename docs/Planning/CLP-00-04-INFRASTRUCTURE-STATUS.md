# CLP-00-04 Infrastructure Status

**Date:** 2026-10-14  
**Status:** PostgreSQL host provisioning and CLP dev/test database isolation completed; schema/migration remains out of scope.

## Confirmed host state

- PostgreSQL 17.11 client tools are installed.
- Windows service `postgresql-x64-17` is running on `127.0.0.1:5432`.
- Local administrator authentication was recovered using a temporary loopback-only trust rule; original SCRAM rules were restored and verified.
- `clp_app` is a non-superuser, non-createdb, non-createrole application role.
- `clp_dev` and `clp_test` are separate non-production databases.
- Connectivity as `clp_app` to both databases is verified; each has zero non-system tables.

## Local credential handling

- Application connection variables are stored in project `.env`, which is git-ignored and ACL-restricted to the current Windows user.
- Local psql credentials are stored in `%APPDATA%\postgresql\pgpass.conf`, ACL-restricted to the current Windows user.
- No secret is committed to Git, emitted in project docs, or exposed in chat.

## Still not created

- No Prisma schema, migration, table, seed data, login/RBAC endpoint, or application database connection code.
- CLP-00-04 implementation requires a separate Owner-approved task contract.

## Required verification

Before CLP-00-04 can start, Năm must verify clp_app connectivity and isolation, that no user tables exist, and that test-reset tooling can reject non-test database names.
