# Chinese Learning Platform (CLP) — Foundation

NestJS REST API + React/Vite SPA skeleton for the Chinese Learning Platform.

**Checkpoint:** CP-00 (Foundation) — **Latest task:** CLP-00-05 (Identity Domain).

> **Scope note.** This repository is an early foundation. CLP-00-05 adds the **identity domain
> boundary** — exactly three Prisma tables (`users`, `password_credentials`, `user_roles`) plus a
> memory-hard password-hashing boundary and synthetic tests — per ADR-004. There is **still no**
> login/logout/current-user session flow, **no** RBAC guards/controllers, **no** profile/class/
> enrollment, **no** learning-domain feature (content, exercise, learning events, mastery,
> reporting) and **no** AI integration. Module boundaries beyond identity remain empty
> placeholders per ADR-001; the health scaffold proves build/start behavior. CLP-00-03 adds a
> **typed, validated configuration boundary**; CLP-00-04 adds the **Prisma migration
> foundation**; CLP-00-05 adds the **identity schema + domain/hashing boundary**. Do not treat
> any part of this skeleton as an implemented product feature.

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
│   │           ├── identity/         # CLP-00-05 identity domain + hashing boundary
│   │           │   ├── domain/       # login/role/state/public-id/password-hash/user
│   │           │   ├── application/  # PasswordHasher port
│   │           │   └── infrastructure/ # scrypt (memory-hard) hasher
│   │           ├── content/          # EMPTY placeholder (CP-01)
│   │           ├── exercise/         # EMPTY placeholder (CP-02)
│   │           ├── learning-events/  # EMPTY placeholder (CP-03)
│   │           ├── mastery/          # EMPTY placeholder (CP-04)
│   │           ├── reporting/        # EMPTY placeholder
│   │           └── ai/               # EMPTY placeholder (CP-07+)
│   └── web/                      # React 19 + Vite 6 SPA (TypeScript)
├── apps/api/test/                # unit + API + DB tests (see docs/Testing/TEST-HARNESS.md)
│   ├── protected/                # *.spec.ts (unit) + *.e2e-spec.ts (API, no DB)
│   ├── db/                       # schema/tooling *.spec.ts + *.int-spec.ts (clp_test)
│   └── support/                  # shared harness: factories + Nest lifecycle helper
├── compose.yaml                  # local PostgreSQL dev/test topology (declarations only)
├── prisma/                       # CLP-00-04 foundation + CLP-00-05 identity schema
│   ├── schema.prisma             # datasource + generator + 3 identity models
│   └── migrations/               # 0_init baseline + identity_domain migration
├── scripts/
│   ├── db/                       # DB URL classification, guard, status, migrate, validate
│   └── secret-scan.cjs           # secret/artifact scan (also guards approved models/tables)
├── docs/Database/MIGRATIONS.md   # migration foundation guide
├── docs/Database/IDENTITY.md     # CLP-00-05 identity domain guide
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
| `npm run test:integration` | Run live-DB `*.int-spec.ts` suites against `clp_test`          |
| `npm run verify`       | format:check + lint + typecheck + build                            |
| `npm run db:validate`  | Validate `prisma/schema.prisma` (no DB connection)                 |
| `npm run db:generate`  | Regenerate the Prisma client from the schema                       |
| `npm run db:status`    | Prisma migration status (dev + test)                               |
| `npm run db:migrate:deploy` | Apply pending migrations to `clp_dev`                         |
| `npm run db:test:reset`| **Destructive** reset of `clp_test` only (guard-protected)         |
| `npm run db:test:validate` | Zero→current validation of `clp_test`, asserts only approved tables |

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

## Testing (CLP-00-08A + CLP-00-05)

Tests are split by layer:

| Layer           | Suffix         | Location                   | Nest? | PostgreSQL? |
| --------------- | -------------- | -------------------------- | ----- | ----------- |
| Unit            | `.spec.ts`     | `apps/api/test/protected/` | No    | No          |
| API/integration | `.e2e-spec.ts` | `apps/api/test/protected/` | Yes   | No          |
| DB tooling unit | `.spec.ts`     | `apps/api/test/db/`        | No    | No          |
| Database (live) | `.int-spec.ts` | `apps/api/test/db/`        | Prisma| `clp_test`  |

- `apps/api/test/support/factories.ts` — **synthetic** env/config factories
  (`makeEnv`, `makeEnvMissing`, `syntheticSecretValue`). Deterministic, isolated,
  no real credentials or personal data.
- `apps/api/test/support/test-app.ts` — Nest lifecycle helper
  (`createTestApp`, `withTestApp`) that **always closes** the application.

Full conventions: **[`docs/Testing/TEST-HARNESS.md`](docs/Testing/TEST-HARNESS.md)**.
`apps/api/test/db/` holds **pure-logic** specs for the database tooling (URL classification,
reset guard, env loader, identity-schema invariants) — these require **no** database. The
**live** database integration suite (`identity-persistence.int-spec.ts`) connects to the
isolated `clp_test` database and runs via `npm run test:integration`; it **skips** (not fails)
when that database is unavailable.

## Identity domain (CLP-00-05)

The identity boundary implements the approved ADR-004 slice:

- **Persistence** — three Prisma tables only: `users` (public UUID + normalized unique login +
  state), `password_credentials` (1:1; hash + algorithm metadata only), `user_roles`
  (ADMIN/TEACHER/STUDENT; composite PK). See
  [`docs/Database/IDENTITY.md`](docs/Database/IDENTITY.md).
- **Domain** (`apps/api/src/modules/identity/domain/`) — login normalization (NFC → trim →
  lower-case), role validation, account-state vocabulary (`PENDING | ACTIVE | DISABLED`),
  public-id minting (UUID v4, branded type), password-hash value type, and an identity
  aggregate with a pure `canAuthenticate` predicate.
- **Hashing boundary** — the application **port** `PasswordHasher` with a **scrypt**
  (RFC 7914, memory-hard) implementation (`node:crypto`). Stores only a hash; the plaintext is
  never persisted, logged or leaked into errors.

No login/logout/current-user/session/cookie/CSRF behavior and no RBAC guard/controller exist
here — those are CLP-00-06/07.

## Database & migrations (CLP-00-04 + CLP-00-05)

Migrations use **Prisma** (ADR-002) with an **append-only** history and no `db push`.
`prisma/schema.prisma` declares the PostgreSQL datasource, the client generator and the three
approved identity models; migrations are `0_init` (baseline, no DDL) and the identity-domain
migration. Destructive resets are gated to a local **`clp_test`** database only; `clp_dev` and
any other database are always refused.

```bash
npm run db:validate            # schema parses (no connection)
npm run db:migrate:deploy      # apply migrations to clp_dev
npm run db:test:reset:dry-run  # report what a reset would do (no change)
npm run db:test:validate       # zero->current on clp_test + approved-tables-only check
```

See **[`docs/Database/MIGRATIONS.md`](docs/Database/MIGRATIONS.md)** for the full command set,
the strict reset guard rules, and the append-only / no-`db push` policy, and
**[`docs/Database/IDENTITY.md`](docs/Database/IDENTITY.md)** for the identity schema and hashing
boundary.

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

## Definition of done for CLP-00-05

- clean `npm install` / `npm ci`;
- `npm run build` (API + SPA) succeeds;
- `npm run format:check`, `npm run lint`, `npm run typecheck` succeed;
- `npm test` (unit + API + schema/db-tooling) passes; `npm run test:integration` passes against
  `clp_test`; secret scan (`node scripts/secret-scan.cjs`) passes;
- identity migration applies on `clp_dev`; `clp_test` reaches current state from zero;
- public UUID and normalized-login uniqueness enforced; role membership limited to the three ADR
  roles; account state limited to approved values; only password hashes persisted;
- table inventory contains only Prisma metadata plus the three approved identity tables;
- no login/logout/current-user/session, no RBAC guard/controller, no profile/class/enrollment,
  no learning-domain or AI schema/behavior, no seed/bootstrap admin;
- module boundaries exist with no CP-01+ behavior/schema.

## Known deferred decisions

- **Repository host / CI provider** — deferred by Owner; must be chosen before CLP-00-09.
  This repository is **Git local only** for now: no remote, no CI workflow.
- **Prisma / migration tooling and exact versions** — **foundation added in CLP-00-04**
  (Prisma 6.19.3 pinned; baseline migration; ADR-002); identity schema added in CLP-00-05.
- **Domain schema & live DB test fixtures** — **identity slice done in CLP-00-05** (three ADR-004
  tables, memory-hard hashing, live `clp_test` integration suite); the remaining learning-domain
  schema arrives in later approved tasks.
- **Typed configuration loading & secret boundary** — **done in CLP-00-03** (ADR-001/ADR-005);
  a new key requires a classification amendment.
- **Session cookie / CSRF / CORS concrete settings** — CLP-00-06 under ADR-003.
- **Rate limiting, security headers, structured logging/redaction** — CLP-00-10 (ADR-005).
- **Identity schema** — **done in CLP-00-05**; **login/logout/current-user (CLP-00-06)** and
  **RBAC guards/policy (CLP-00-07)** remain.
- **Readiness dependency checks (PostgreSQL)** — added with persistence in CLP-00-10; the
  current `/health/ready` reports application readiness only and explicitly **not** DB readiness.
- **Production topology, TLS/reverse proxy, browser support policy** — deferred (ADR-003).

## Security notes

- No secret, token or production credential is committed.
- No client-to-database access; the browser receives no DB credential.
- Authorization (when implemented) will be enforced server-side; UI hiding is never authorization.
- The `ai` boundary imports no provider SDK; the application core must remain independent of AI.
