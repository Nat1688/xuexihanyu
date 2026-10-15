# Task Contract — CLP-00-10 Operational Baseline

**Status:** Accepted by Owner — runtime changes may proceed only within this operations scope.

## Scope

- Structured JSON logging with redaction for password, cookie, token, session, CSRF, authorization and DB URL values.
- Correlation/request ID handling.
- Safe startup diagnostics for config, Prisma/database and HTTP bootstrap failures.
- `/health/live` process liveness and `/health/ready` safe PostgreSQL readiness distinction.
- Local-only backup/recovery documentation with explicit non-production limitations.

## Forbidden

No external telemetry SaaS, metrics/tracing vendor, alerting, deploy, production backup automation, raw request/credential logging, auth/RBAC/domain feature changes.

## Acceptance

- Logs have stable structured fields and redact secrets.
- Readiness reports unavailable DB without internal error/URL/schema leak.
- Tests cover redaction, request ID, readiness/config failure behavior.
- Existing quality, migration and secret gates pass.
