# Operational Baseline (CLP-00-10)

**Task:** CLP-00-10 — Operational baseline (structured logging, request IDs,
startup diagnostics, health readiness, local backup docs).
**Related:** [Backup & Recovery](BACKUP-RECOVERY.md),
[Testing harness](../Testing/TEST-HARNESS.md),
[Migrations](../Database/MIGRATIONS.md).

This document describes the CP-00 operational baseline: how the API logs, how a
request is correlated, how startup failures are reported safely, and how health
readiness distinguishes PostgreSQL availability. Everything here is
**local-only** and adds **no external telemetry/metrics/tracing vendor, no deploy
and no auth/RBAC/domain behavior**.

## Scope

| Concern                          | Where it lives                                                   |
| -------------------------------- | ---------------------------------------------------------------- |
| Structured JSON logging          | `apps/api/src/modules/foundation/logging/structured-logger.ts`   |
| Secret redaction                 | `apps/api/src/modules/foundation/logging/redaction.ts`           |
| Request / correlation ID         | `apps/api/src/modules/foundation/logging/request-id*.ts`         |
| Startup diagnostics              | `apps/api/src/modules/foundation/logging/startup-diagnostics.ts` |
| Readiness check                  | `apps/api/src/modules/foundation/logging/readiness.ts`           |
| Health endpoints                 | `apps/api/src/modules/health/health.controller.ts`               |
| Bootstrap wiring                 | `apps/api/src/main.ts`                                           |

## Structured JSON logging

Every log record is ONE JSON object per line written to the process streams
(`error`/`warn` → stderr, everything else → stdout). The **stable fields** are:

```json
{ "time": "<ISO-8601>", "level": "log|error|warn|debug|verbose", "context": "<name>", "msg": "<event>", "...": "event-specific fields" }
```

- `time` — ISO-8601 timestamp (injectable clock for tests).
- `level` — one of `LOG_LEVELS`.
- `context` — fixed component name (e.g. `Bootstrap`, `Health`).
- `msg` — the stable event name (e.g. `startup.listening`, `startup.failed`).
- Additional fields are merged per event, then **redacted** (below).
- `requestId` is attached when known, so a failure report can be correlated to
  the request's log lines.

The logger is wired as the Nest application logger in `main.ts`
(`app.useLogger(logger)`), so framework logs are structured and redacted too.

## Redaction (mandatory)

No log line may contain the VALUE of anything sensitive. Redaction is applied to
EVERY record and message before serialization, via two complementary strategies:

1. **Field-name based** — any field whose name matches the sensitive vocabulary
   (`password`, `cookie`, `token`, `session`, `csrf`, `authorization`/`auth`,
   `secret`, `credential`, `apiKey`, `connectionString`, `databaseUrl`, …;
   case- and `_`/`-`-insensitive, so `DATABASE_URL` and `POSTGRES_PASSWORD`
   match) is replaced with the fixed marker `[REDACTED]`.
2. **Value based (free text)** — a message or error string is scanned for
   `key=value` / `"key":"value"` pairs and for `scheme://user:pass@host`
   connection-string **userinfo**; each discovered secret is replaced with
   `[REDACTED]` (the host/db is preserved for diagnosis, the password is not).

Errors are converted to a safe `{ name, message }` — a **stack trace is never
emitted**. Recursion is bounded and circular references become `[Circular]`.
The redaction list is the CLP-00-10 set: password, cookie, token, session, CSRF,
authorization and DB-URL values.

## Request / correlation ID

A middleware (`requestIdMiddleware`, applied to every route in `app.module.ts`):

- reuses an inbound `x-request-id` (or `x-correlation-id`) **only when it is
  sane** — ≤128 chars from `[A-Za-z0-9._:-]`, so untrusted text (spaces, quotes,
  newlines) can never reach a log line (log-injection defence);
- otherwise **mints** a fresh random UUID;
- **echoes** the resolved id on the response `x-request-id` header, so a caller
  can quote it in a bug report;
- attaches it to the request for downstream handlers.

`X-Request-Id` is already an allowed CORS request header.

## Safe startup diagnostics

Startup failures are reported as a structured, value-free diagnostic per phase
(`config` → `prisma` (module/DB wiring) → `http` (listen)):

```json
{ "event": "startup.failed", "phase": "prisma", "reason": "Database is unreachable; verify the local database is running. (Error)", "category": "Error" }
```

- The **phase** and a coarse **error category** (the error's `name`) are
  reported; **a stack trace is never emitted**.
- A `ConfigError` contributes only the offending **key NAMES** (never values).
- The error message is scrubbed (a secret embedded in it is removed).
- Any startup failure exits non-zero. Successful startup logs
  `startup.listening` with only the `port` and `environment`.

## Health readiness (`/health/ready`)

Two safe probes:

- **`/health/live`** — process liveness only; returns `200 { "status": "ok" }`
  and never touches a dependency.
- **`/health/ready`** — application readiness PLUS a safe PostgreSQL state:

  | `dependencies.database` | Meaning                                   | HTTP |
  | ----------------------- | ----------------------------------------- | ---- |
  | `not-configured`        | no database wired (skeleton / DB-less)    | 200  |
  | `up`                    | a trivial `SELECT 1` probe answered       | 200  |
  | `down`                  | the probe timed out or errored            | 503  |

The probe is wired **only when `DATABASE_URL` is configured**; otherwise
readiness honestly reports `not-configured` (this also keeps `npm test`
independent of a running PostgreSQL). On failure, ANY underlying error —
connection string, schema, driver message — is collapsed to the coarse `down`
state and **never** surfaced in the body or logs. Both responses are
`Cache-Control: no-store`.

## What this baseline is NOT

- No external telemetry, metrics, tracing or alerting vendor.
- No deploy/production automation.
- No change to authentication, authorization, RBAC or any domain feature.
- Backup/recovery is **manual and local-only** — see
  [Backup & Recovery](BACKUP-RECOVERY.md).
