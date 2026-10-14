# Test Harness Conventions — CLP-00-08A

**Status:** Current for CP-00 as bounded by task contract **CLP-00-08A**.
**Scope:** Non-database unit/API tests only. Database integration fixtures are
**deferred and blocked by CLP-00-04** (persistence/migrations) — see below.

This document defines how tests are organised, how synthetic data is produced,
how the Nest application lifecycle is managed, and which test layer a given
test belongs to. It exists so that the (later) database integration suite can
be added **without reworking** the existing unit/API structure.

## Test layers

| Layer                | Suffix         | Location                   | Boots Nest? | Uses PostgreSQL? |
| -------------------- | -------------- | -------------------------- | ----------- | ---------------- |
| Unit                 | `.spec.ts`     | `apps/api/test/protected/` | No          | No               |
| API / integration    | `.e2e-spec.ts` | `apps/api/test/protected/` | Yes (HTTP)  | **No**           |
| Database integration | _(deferred)_   | `apps/api/test/db/`        | Yes         | Yes — CLP-00-04  |
| Harness self-tests   | `.spec.ts`     | `apps/api/test/protected/` | Optional    | No               |

Rules:

- **Unit tests** exercise pure logic (config parsing, SPA projection, factories)
  with no Nest application and no I/O.
- **API/integration tests** boot the Nest application through the shared
  lifecycle helper and exercise HTTP routes via `supertest`. In CP-00 these
  cover only the health scaffold and configuration boundary. They do **not**
  connect to a database.
- **Database integration tests** will exercise migrations, constraints,
  transactions and persistence. They are **not implemented** and must not be
  added until CLP-00-04 supplies the isolated disposable test database
  (see ADR-002). Any file matching `test/db/**` is reserved for that work.
- **Harness self-tests** verify the test infrastructure itself (the lifecycle
  helper closes applications, factories are isolated and synthetic).

## Shared harness modules

Both live under `apps/api/test/support/` and are **excluded from Jest test
collection** (`testPathIgnorePatterns`) because they are support code, not specs.

### `support/factories.ts` — synthetic data factories

- `SYNTHETIC_SERVER_CONFIG` — frozen base of all approved server config keys
  with **synthetic, obviously-fake** values (e.g.
  `synthetic-db-password-value`). Never real credentials or personal data.
- `makeEnv({ overrides })` — returns a **fresh, independent** env object each
  call (no shared mutable fixture), applying overrides on top of the base.
- `makeEnvMissing(...keys)` — empties the named keys to exercise the
  "required key absent/empty" failure class.
- `makePublicSpaEnv(url?)` — minimal env for public SPA projection tests.
- `syntheticSecretValue(label?)` — a labelled, deterministic secret-shaped
  value for leak-detection tests.

Factory rules:

1. **Synthetic only.** No real student data, secret, token or production
   credential may ever appear. Values must be recognisably fake.
2. **Deterministic.** Same inputs ⇒ same outputs; no randomness, no clock,
   no process-env dependence.
3. **Isolated.** Factories return new objects so one test cannot mutate another.
4. **No domain entities.** These factories intentionally model **config/env
   values only**. User/student/session/domain factories belong to the future
   database layer (CLP-00-04) and must be synthetic there too.

### `support/test-app.ts` — Nest application lifecycle helper

- `createTestApp({ metadata?, useHttpServer? })` — compiles a Nest module
  (default `AppModule`), creates and initialises the application, and returns
  `{ app, http, close }` where `http` is a supertest agent.
- `withTestApp(options, fn)` — boots the app, runs `fn`, and **always closes**
  it (even when `fn` throws).

Lifecycle rules:

1. **Always close.** Every helper path releases the Nest application. A failed
   bootstrap (compile or `init` throw) closes the partial app before
   re-throwing; `close()` is idempotent.
2. **No external dependencies.** The helper boots no database, no Prisma, no
   migration and starts no socket unless `useHttpServer: true` is requested.
3. **Prefer `withTestApp`** for focused tests; use `createTestApp` with
   `beforeAll`/`afterAll` when a suite shares one booted app.

## Test environment

- Tests run in the **Node** Jest environment with `ts-jest` and
  `apps/api/tsconfig.test.json` (which adds the `node` + `jest` type packages).
- Tests are **deterministic and isolated**: no ordering dependence, no shared
  mutable state, no network, no database.
- `NODE_ENV=test` is the synthetic base value in fixtures; it is a **string
  fixture**, not a live process setting.

## Commands

| Command                             | Purpose                                  |
| ----------------------------------- | ---------------------------------------- |
| `npm test` (repo root)              | Run all workspace tests (API + SPA)      |
| `npm run test -w @clp/api`          | Run API unit + API integration suites    |
| `npm run test:coverage -w @clp/api` | API tests with coverage (reporting only) |
| `npm run verify` (repo root)        | format:check + lint + typecheck + build  |
| `node scripts/secret-scan.cjs`      | Secret/artifact scan (must pass)         |

Coverage is **reporting only** in CP-00: `test:coverage` adds a report and does
**not** enforce thresholds, so it cannot weaken the existing gates.

## Deferred: database integration fixtures

The following are **out of scope for CLP-00-08A** and remain **deferred/blocked
by CLP-00-04**:

- Any PostgreSQL test database, connection string or lifecycle.
- Prisma client/schema/migrations and seed data.
- User/student/session/domain factories backed by persistence.
- Migration validation in tests, transaction fixtures, RBAC route fixtures.

Rationale: ADR-002 requires an **isolated disposable PostgreSQL** test database
with deterministic, order-independent data and cleanup owned by the test
harness. That topology does not exist yet — this repository is a skeleton with
no persistence. Adding DB fixtures now would create unverified, premature
coupling. Once CLP-00-04 lands (per ADR-002), database integration tests belong
in `apps/api/test/db/` and may introduce synthetic domain factories that still
contain **no real student data or secrets**.

## Definition of done for this harness (CLP-00-08A)

- Existing 43 tests remain passing; new tests are deterministic and synthetic.
- Test helpers always close Nest application resources.
- This document identifies database integration fixtures as deferred/blocked by
  CLP-00-04.
- `npm ci`, format, lint, typecheck, build, test and secret scan pass.
