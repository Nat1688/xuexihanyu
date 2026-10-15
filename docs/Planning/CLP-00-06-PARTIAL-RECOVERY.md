# CLP-00-06 Partial Recovery Status

Partial authentication/session code remains isolated in the Dev working copy and has **not** been synced to the project root.

## Current review

- Candidate unit/API tests now pass after updating the CLP-00-06 Session schema allowlist and synthetic config harness.
- Prisma schema validation and secret scan pass in the candidate.
- Candidate SQL declares only the approved `sessions` table in addition to existing identity tables; cookie/token/CSRF design remains subject to final review.

## Blocker

Database integration tests in the Dev sandbox cannot authenticate as `clp_app` against the host PostgreSQL because the sandbox intentionally does not receive the project root's ignored `.env` credentials. No password or `.env` will be copied into the sandbox.

## Safe recovery path

1. Review partial source/migration/cookie implementation and sync only approved source files to a **recovery branch/worktree** at the project root.
2. Use the existing root `.env` (not copied or committed) to run migration/integration/full tests on host PostgreSQL.
3. Sync/commit only after host tests, secret scan, migration table inventory and auth security review pass.

No partial candidate code is approved for project-root sync yet.
