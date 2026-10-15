# Test Harness Conventions — CLP-00-08A (+ DB integration, CLP-00-05)

**Status:** Current for CP-00 as bounded by task contract **CLP-00-08A**; the
database integration layer is now live (CLP-00-05, on the CLP-00-04 DB
foundation).

This document defines how tests are organised, how synthetic data is produced,
how the Nest application lifecycle is managed, and which test layer a given
test belongs to.

## Test layers

| Layer                | Suffix          | Location                   | Boots Nest? | Uses PostgreSQL? |
| -------------------- | --------------- | -------------------------- | ----------- | ---------------- |
| Unit                 | `.spec.ts`      | `apps/api/test/protected/` | No          | No               |
| API / integration    | `.e2e-spec.ts`  | `apps/api/test/protected/` | Yes (HTTP)  | **No**           |
| Database integration | `.int-spec.ts`  | `apps/api/test/db/`        | Prisma only | Yes — `clp_test` |
| Schema structural    | `.spec.ts`      | `apps/api/test/db/`        | No          | No               |
| Harness self-tests   | `.spec.ts`      | `apps/api/test/protected/` | Optional    | No               |

Rules:

- **Unit tests** exercise pure logic (config parsing, SPA projection, identity
  domain, hashing boundary) with no Nest application and no I/O.
- **API/integration tests** bootstrap the Nest application through the shared
  lifecycle helper and exercise HTTP routes via `supertest`. They do **not**
  connect to a database.
- **Database integration tests** (`*.int-spec.ts`, `apps/api/test/db/`) connect
  to the **isolated disposable** test database (`TEST_DATABASE_URL` = `clp_test`,
  per ADR-002). They run via the **separate** config
  `apps/api/jest.integration.config.cjs` (`npm run test:integration`) so the
  default `npm test` never requires a running PostgreSQL. Each suite must
  **skip** (not fail) when the test database is unavailable, and must clean up
  the rows it creates. Synthetic values only.
- **Schema structural tests** assert facts about `prisma/schema.prisma` and the
  migration `.sql` files (model/enum set, created tables) without any DB.
- **Harness self-tests** verify the test infrastructure itself.

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
| `npm run test:integration`          | Run live-DB `*.int-spec.ts` on `clp_test`|
| `npm run test:coverage -w @clp/api` | API tests with coverage (reporting only) |
| `npm run verify` (repo root)        | format:check + lint + typecheck + build  |
| `node scripts/secret-scan.cjs`      | Secret/artifact scan (must pass)         |

Coverage is **reporting only** in CP-00: `test:coverage` adds a report and does
**not** enforce thresholds, so it cannot weaken the existing gates.

## Database integration fixtures (now live, CLP-00-05)

The isolated disposable PostgreSQL test database from ADR-002 now exists, and
the first database integration suite ships with CLP-00-05
(`apps/api/test/db/identity-persistence.int-spec.ts`). Conventions:

- Files use the `.int-spec.ts` suffix and live under `apps/api/test/db/`.
- They connect only via `TEST_DATABASE_URL` (must resolve to local `clp_test`),
  through `scripts/db/env.cjs` + `scripts/db/db-url.cjs`. If the URL is missing
  or not the exact local `clp_test`, the suite **skips** entirely — no data is
  touched.
- They clean up every row they create in `afterAll`, use **synthetic** values
  only, and never contain real user data or secrets.
- They run serially (`maxWorkers: 1`) via `npm run test:integration`.

Still out of scope for CP-00 (arrive in later approved tasks): session/RBAC
route fixtures, profile/class/content factories, seed data.

## Definition of done for this harness (CLP-00-08A / CLP-00-05)

- All tests pass; they are deterministic and synthetic.
- Test helpers always close Nest application resources; DB suites clean up.
- Empty-database structural asserts now allow only the three approved CLP-00-05
  identity tables (plus Prisma metadata) — see `prisma-identity-schema.spec.ts`.
- `npm ci`, format, lint, typecheck, build, test, integration test and secret
  scan pass.
