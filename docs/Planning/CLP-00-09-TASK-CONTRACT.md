# Task Contract — CLP-00-09 CI & Quality Gates

**Status:** Accepted by Owner — workflow implementation may proceed only within this CI scope.

## Objective

Add deterministic GitHub Actions quality workflow for push/pull_request after a remote is later configured. No deploy and no production secret.

## Workflow

- Ubuntu runner, pinned Node 24.
- PostgreSQL service container with CI-only synthetic credentials/database.
- `npm ci`, Prisma generate/validate, format check, lint, typecheck, build, unit/API test, integration test, migration status/reset validation, secret scan.
- Failure is blocking; cache is optional and cannot affect correctness.

## Security

- No repository/production secret, token, `.env`, deploy, publish or external API call.
- CI database URL is composed from workflow-local synthetic service values only.
- Test reset targets CI `clp_test` only through existing guard.

## Forbidden

No GitHub remote creation/push, release/deploy, environment secret configuration, production database, branch protection change or app feature change.

## Acceptance

- YAML valid and reviewable.
- Local equivalent commands pass.
- Workflow contains all quality gates and PostgreSQL integration validation.
- README documents workflow is dormant until a remote repository is connected.
