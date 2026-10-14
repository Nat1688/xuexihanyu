# Chinese Learning Platform (CLP) — Foundation

NestJS REST API + React/Vite SPA skeleton for the Chinese Learning Platform.

**Checkpoint:** CP-00 (Foundation) — **Task:** CLP-00-04 (Database & Migration Foundation).

> **Scope note.** This repository currently contains a **skeleton only**. There is **no**
> database schema, migration of domain tables, login/logout, RBAC, learning-domain feature
> (content, exercise, learning events, mastery, reporting) or AI integration. Module boundaries
> exist as empty placeholders per ADR-001; the health scaffold exists only to prove build/start
> behavior. CLP-00-03 adds a **typed, validated configuration boundary**; CLP-00-04 adds a
> **Prisma migration foundation with no models** (empty baseline only). Do not treat any part of
> this skeleton as an implemented product feature.

## Prerequisites

- **Node.js** >= 20 (LTS; verified here with Node 24) and **npm** (verified with npm 11).
- **Git**.
- **Docker** with Compose v2 — required only for the local PostgreSQL topology
  (`compose.yaml` declares it; later tasks start it). Not required to build the API/SPA.

## Repository layout

```text
chinese-learning-foundation/
├── apps/
│   ├── api/                      # NestJS REST API (TypeScript)
│   │   └── src/
│   │       ├── main.ts           # bootstrap (config load + health scaffold only)
│   │       ├── app.module.ts     # root module wiring all boundaries
│   │       ├── config/           # CLP-00-03 typed config & secret boundary
│   │       │   ├── config.schema.ts   # Zod schema + key classification
│   │       │   ├── config.loader.ts   # loadServerConfig(), safe ConfigError
│   │       │   └── spa-config.ts      # public SPA key allowlist
│   │       └── modules/
│   │           ├── foundation/       # cross-cutting contracts (placeholder)
│   │           ├── health/           # safe liveness/readiness scaffold
│   │           ├── identity/         # EMPTY placeholder (later CP-00 tasks)
│   │           ├── content/          # EMPTY placeholder (CP-01)
│   │           ├── exercise/         # EMPTY placeholder (CP-02)
│   │           ├── learning-events/  # EMPTY placeholder (CP-03)
│   │           ├── mastery/          # EMPTY placeholder (CP-04)
│   │           ├── reporting/        # EMPTY placeholder
│   │           └── ai/               # EMPTY placeholder (CP-07+)
│   └── web/                      # React 19 + Vite 6 SPA (TypeScript)
├── apps/api/test/                # unit + API tests (see docs/Testing/TEST-HARNESS.md)
│   ├── protected/                # *.spec.ts (unit) + *.e2e-spec.ts (API, no DB)
│   └── support/                  # shared harness: factories + Nest lifecycle helper
├── compose.yaml                  # local PostgreSQL dev/test topology (declarations only)
├── prisma/                       # CLP-00-04 migration foundation (NO models)
│   ├── schema.prisma             # datasource + client generator only
│   └── migrations/0_init/        # baseline migration (applies no DDL)
├── scripts/
│   ├── db/                       # DB URL classification, guard, status, migrate, validate
│   └── secret-scan.cjs           # secret/artifact scan (also blocks Prisma models in CP-00)
├── docs/Database/MIGRATIONS.md   # migration foundation guide
├── .env.example                  # environment variable NAMES only
└── package.json                  # npm workspaces root
```

## Local setup

```bash
# 1. Install all workspace dependencies
npm install

# 2. (Optional) create a local, git-ignored env file from the names template
cp .env.example .env        # Windows: copy .env.example .env
```

`.env.example` lists variable **names only**. Never commit real credentials.

## Commands (run from the repository root)

| Command                | Purpose                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `npm install`          | Install all workspace dependencies                                 |
| `npm run format`       | Format sources with Prettier                                       |
| `npm run format:check` | Verify formatting (CI-style)                                       |
| `npm run lint`         | ESLint over API and SPA (0 warnings tolerated)                     |
| `npm run typecheck`    | TypeScript typecheck (no emit) for both apps                       |
| `npm run build`        | Build the API (`nest build`) and SPA (`vite build`)                |
| `npm test`             | Run automated tests (API unit + API integration; SPA has none yet) |
| `npm run verify`       | format:check + lint + typecheck + build                            |
| `npm run db:validate`  | Validate `prisma/schema.prisma` (no DB connection)                 |
| `npm run db:status`    | Prisma migration status (dev + test)                               |
| `npm run db:migrate:deploy` | Apply pending migrations to `clp_dev`                         |
| `npm run db:test:reset`| **Destructive** reset of `clp_test` only (guard-protected)         |
| `npm run db:test:validate` | Zero→current validation of `clp_test`, asserts no domain tables |

### Run the API

```bash
npm run start -w @clp/api          # production build (requires npm run build first)
npm run start:dev -w @clp/api      # watch mode
```

Health scaffold:

```bash
curl http://localhost:3000/health/live    # -> {"status":"ok"}
curl http://localhost:3000/health/ready   # -> {"status":"ok","dependencies":{"database":"not-configured"}}
```

The API port comes from the validated `API_PORT` environment variable (default in
`.env.example` is `3000`). Startup fails fast with a safe diagnostic if required config is
missing or invalid (see "Configuration & secret boundary").

### Run the SPA

```bash
npm run dev -w @clp/web            # Vite dev server on http://localhost:5173
npm run build -w @clp/web          # production build to apps/web/dist
```

The SPA reads no privileged secret; nothing sensitive is bundled into the browser.

## Configuration & secret boundary (CLP-00-03)

Server configuration is read through **one typed, validated boundary** —
`apps/api/src/config/` — not raw `process.env`. It uses **Zod** (ADR-001 default).

- `config.schema.ts` — the schema and the key **classification** table.
- `config.loader.ts` — `loadServerConfig(env?)` returns a frozen typed config object, or
  throws a `ConfigError` with a **safe** diagnostic (names the offending key, never its value).
  `redactServerConfig()` masks secret values for safe logging.
- `spa-config.ts` — the **public SPA allowlist** (see below).

On invalid/missing configuration the API **fails fast**: it logs a safe `[config]` line and
exits non-zero — no config dump, no secret value.

### Key classification

| Key                                  | Class                               |
| ------------------------------------ | ----------------------------------- |
| `NODE_ENV`, `API_PORT`, `SPA_ORIGIN` | server-required                     |
| `POSTGRES_HOST/PORT/DB/USER`         | server-required                     |
| `POSTGRES_PASSWORD`                  | server-required, **secret**         |
| `SESSION_SECRET`, `CSRF_SECRET`      | server-required, **secret**         |
| `SESSION_TTL_MINUTES`                | server-required                     |
| `VITE_API_BASE_URL`                  | **SPA-public** (bundled in browser) |

Validation rules: `API_PORT`/`POSTGRES_PORT` are integers in `1..65535`; `NODE_ENV` must be
one of `development|test|production`; `SPA_ORIGIN` must be an absolute `http`/`https` origin
(no path/query/hash); required keys must be non-empty.

### Public SPA boundary

The browser receives **only** explicit `VITE_`-prefixed, non-secret keys, projected via
`spa-config.ts` (`SPA_PUBLIC_KEYS`). A key is refused if its **name** contains any of
`password, secret, session, csrf, token, credential, database, ...`. The SPA itself reads
public config only via `apps/web/src/config/public-config.ts` (`getPublicConfig()`), never
`process.env`. No server database/session secret can reach the SPA source or bundle.

### Adding a new key

Any new configuration key must be **classified** (server-required / server-optional /
SPA-public) and added here by an amendment to the CLP-00-03 contract. A `VITE_` key may never
carry database, password, session, CSRF, token, secret or credential data.

## Testing (CLP-00-08A)

Tests are split by layer and kept **non-database** in CP-00:

| Layer           | Suffix         | Location                   | Nest? | PostgreSQL? |
| --------------- | -------------- | -------------------------- | ----- | ----------- |
| Unit            | `.spec.ts`     | `apps/api/test/protected/` | No    | No          |
| API/integration | `.e2e-spec.ts` | `apps/api/test/protected/` | Yes   | No          |
| DB tooling unit | `.spec.ts`     | `apps/api/test/db/`        | No    | No          |
| Database (live) | _(deferred)_   | `apps/api/test/db/`        | Yes   | CLP-00-04+  |

- `apps/api/test/support/factories.ts` — **synthetic** env/config factories
  (`makeEnv`, `makeEnvMissing`, `syntheticSecretValue`). Deterministic, isolated,
  no real credentials or personal data.
- `apps/api/test/support/test-app.ts` — Nest lifecycle helper
  (`createTestApp`, `withTestApp`) that **always closes** the application.

Full conventions: **[`docs/Testing/TEST-HARNESS.md`](docs/Testing/TEST-HARNESS.md)**.
`apps/api/test/db/` holds **pure-logic** specs for the CLP-00-04 database tooling (URL
classification, reset guard, env loader, schema invariant) — these require **no** database.
Live database integration fixtures remain deferred to a later task.

## Database & migrations (CLP-00-04)

The migration foundation uses **Prisma** (ADR-002): `prisma/schema.prisma` declares the
PostgreSQL datasource and client generator with **no models**, and a single **baseline
migration** (`prisma/migrations/0_init/`) applies **no DDL**. Destructive resets are gated to a
local **`clp_test`** database only; `clp_dev` and any other database are always refused.

```bash
npm run db:validate            # schema parses (no connection)
npm run db:migrate:deploy      # apply migrations to clp_dev
npm run db:test:reset:dry-run  # report what a reset would do (no change)
npm run db:test:validate       # zero->current on clp_test + "no domain tables" check
```

See **[`docs/Database/MIGRATIONS.md`](docs/Database/MIGRATIONS.md)** for the full command set,
the strict reset guard rules, and the append-only / no-`db push` policy.

## Local PostgreSQL

`compose.yaml` **declares** a development database (`db`) and an isolated test database
(`db-test`). It contains **no committed credentials** — values are interpolated from your
local `.env`.

```bash
docker compose config       # validate interpolation (does not start anything)
docker compose up -d db     # start the dev database (later tasks)
```

The Prisma migration foundation (CLP-00-04) targets local PostgreSQL databases `clp_dev` and
`clp_test` via `DATABASE_URL` / `TEST_DATABASE_URL` (git-ignored `.env`). The API still does
**not** connect to a database at runtime — no domain schema, session store or repository exists
yet; those arrive in later approved tasks.

## Definition of done for this task

- clean `npm install` / `npm ci`;
- `npm run build` (API + SPA) succeeds;
- `npm run format:check`, `npm run lint`, `npm run typecheck` succeed;
- `npm test` (config + health suites) and the secret scan (`node scripts/secret-scan.cjs`) pass;
- API starts with valid config, logs no config dump/secret, and **fails fast (non-zero)** on
  missing/invalid required config with a safe diagnostic;
- Browser bundle receives only documented `VITE_` public keys; no server database/session
  secret appears in SPA source/bundle/config;
- module boundaries exist with no CP-01+ behavior/schema;
- Compose declares PostgreSQL without committed credentials; `.env.example` has names/placeholders only;
- Prisma schema declares **no models**; baseline migration applies **no DDL**;
- `clp_test` reset is guarded to a local `clp_test` only; `clp_dev`/others are refused;
- `db:test:validate` reaches current state from zero on `clp_test` with no domain tables.

## Known deferred decisions

- **Repository host / CI provider** — deferred by Owner; must be chosen before CLP-00-09.
  This repository is **Git local only** for now: no remote, no CI workflow.
- **Prisma / migration tooling and exact versions** — **foundation added in CLP-00-04**
  (Prisma 6.19.3 pinned; empty baseline migration; ADR-002). Domain schema/modules are later tasks.
- **Domain schema & live DB test fixtures** — later approved tasks (CLP-00-05+); CP-00 keeps the
  schema model-free.
- **Typed configuration loading & secret boundary** — **done in CLP-00-03** (ADR-001/ADR-005);
  a new key requires a classification amendment.
- **Session cookie / CSRF / CORS concrete settings** — CLP-00-06 under ADR-003.
- **Rate limiting, security headers, structured logging/redaction** — CLP-00-10 (ADR-005).
- **Identity schema, login/logout, RBAC implementation** — CLP-00-05/06/07.
- **Readiness dependency checks (PostgreSQL)** — added with persistence in CLP-00-10; the
  current `/health/ready` reports application readiness only and explicitly **not** DB readiness.
- **Production topology, TLS/reverse proxy, browser support policy** — deferred (ADR-003).

## Security notes

- No secret, token or production credential is committed.
- No client-to-database access; the browser receives no DB credential.
- Authorization (when implemented) will be enforced server-side; UI hiding is never authorization.
- The `ai` boundary imports no provider SDK; the application core must remain independent of AI.
