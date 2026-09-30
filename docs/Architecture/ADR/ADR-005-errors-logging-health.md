# ADR-005 — API Errors, Structured Logging and Health

- **Status:** Accepted by Owner — implementation remains limited to approved CP-00 task contracts.
- **Checkpoint:** CP-00

## Decision

- API errors use a stable machine-readable code, safe user-facing message, HTTP status, request/correlation ID and optional field-level validation details. They never expose stack traces, SQL/ORM errors, secrets, session/cookie/CSRF values, tokens or unauthorized resource existence.
- Controllers map known domain/application errors to this contract; unexpected errors become a generic internal error and are logged server-side with correlation ID.
- Logs are structured and include timestamp, level, service/environment, request/correlation ID, route/method/status/duration and safe error category. Redact credentials, headers/cookies, tokens, session IDs, CSRF, passwords and unnecessary student content.
- Log levels: `error` for unexpected failures/security-relevant failures, `warn` for safe expected operational/auth failures, `info` for lifecycle/audit-safe events, `debug` disabled by default outside local development.
- Health endpoints distinguish liveness (process can respond) from readiness (required dependencies such as PostgreSQL are usable). Neither exposes credentials, full config, schema, internal topology or stack traces.
- Startup diagnostics identify configuration, database and application bootstrap failures without leaking secrets.

## Required tests

1. Validation error has safe stable contract.
2. Unauthorized/forbidden/not-found behavior does not enumerate resources.
3. Unexpected exception becomes generic response with correlation ID.
4. Sensitive headers/cookies/passwords/tokens are absent from logs.
5. Liveness works without revealing internals; readiness fails safely when DB unavailable.
6. Startup/config/database failure paths are distinguishable in logs.

## Non-goals

No external log vendor, distributed tracing, metrics platform, alerting, audit-event schema, production health monitoring, or error-reporting SaaS is selected in CP-00.

## Gate

Dev may implement these controls only under approved CLP-00 task contracts. Any request to log raw authentication/student data or weaken error privacy requires Owner approval.
