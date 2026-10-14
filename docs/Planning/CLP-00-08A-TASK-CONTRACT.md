# Task Contract — CLP-00-08A Non-Database Test Harness

**Status:** Accepted by Owner — bounded portion of CLP-00-08; full database integration fixture lifecycle remains deferred pending CLP-00-04.

## Objective

Strengthen deterministic unit/API test structure without database access, synthetic-data conventions, test commands and documentation.

## In scope

- Test utility/factory conventions with synthetic values only; no user/domain persistence assumptions.
- API test lifecycle helper to avoid repeated app bootstrap/cleanup code where justified.
- Clear separation of unit vs API integration vs future database integration tests.
- Deterministic test environment helpers; test commands/docs; coverage/reporting configuration only if it does not weaken existing gates.
- Add tests for existing health/config/public SPA config boundary only.

## Out of scope

No PostgreSQL connection, database/test database, schema/migration, Prisma, seed data, identity/auth/RBAC endpoint, domain model, real student data, CI provider, Docker service start or completion claim for full CLP-00-08.

## Acceptance

- Existing 43 tests remain passing; new tests are deterministic and synthetic.
- Test helpers always close Nest application resources.
- Docs identify database integration fixtures as deferred/blocked by CLP-00-04.
- `npm ci`, format, lint, typecheck, build, test and secret scan pass.
- Dev reports exact files/commands and confirms no database/domain scope drift.
