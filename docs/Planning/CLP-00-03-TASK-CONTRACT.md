# Task Contract — CLP-00-03 Configuration & Secret Boundary

**Status:** Accepted by Owner — Dev may execute only the stated scope.

## Objective

Replace skeleton-level direct `process.env` access with a typed, validated server configuration boundary. Define explicit public SPA configuration allowlist. Keep secrets server-only and fail safely when required configuration is invalid.

## In scope

- Add one runtime validation dependency suitable for TypeScript (Zod is the approved default from ADR-001) and lock it in `package-lock.json`.
- API config module/schema for `NODE_ENV`, `API_PORT`, `SPA_ORIGIN` and database/session variable names needed by later tasks, with server-only classification.
- Validate format/range/allowed environment values; fail startup with a safe error category/message and never log values of secret fields.
- Public SPA configuration can include only explicit `VITE_`-prefixed non-secret values (initially API base/origin if needed). No fallback import of arbitrary `process.env`/server variables.
- Update `.env.example`, README, config tests, secret scan patterns/allowlist only if necessary.

## Explicitly out of scope

No database connection, schema/migration, Docker Compose start, login/logout/session/RBAC endpoint, secret manager/provider, real `.env`, production secret, CI/deploy, analytics, learning domain or AI feature.

## Acceptance criteria

1. API starts with valid development config and logs no secret/config dump.
2. Missing/invalid required config fails fast with safe diagnostic and non-zero exit.
3. Invalid port/environment/origin test cases exist.
4. Browser bundle receives only documented `VITE_` public keys; server database/session secrets do not appear in SPA source/bundle/config.
5. `.env.example` contains names/harmless placeholders only; `.env` remains ignored.
6. `npm ci`, format, lint, typecheck, build, tests and secret scan pass.
7. Exact files, command output, config key classification and limitations are reported.

## Required tests

- valid config parse;
- missing API/runtime config failure;
- invalid API port failure;
- invalid/unsafe SPA origin failure;
- secret field redaction/no value in thrown/logged error;
- SPA public key allowlist behavior.

## Security rules

- No `VITE_` key may contain database, password, session, CSRF, token, secret or credential data.
- Error messages may name a missing key but must not reveal its value.
- Test fixtures use synthetic values only.
- Any additional config key must be classified as server-required, server-optional or SPA-public and added by an amendment.
