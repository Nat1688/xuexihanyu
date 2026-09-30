# Chinese Learning Platform (CLP) — Foundation

NestJS REST API + React/Vite SPA skeleton for the Chinese Learning Platform.

**Checkpoint:** CP-00 (Foundation) — **Task:** CLP-00-02 (Repository & Module Skeleton).

> **Scope note.** This repository currently contains a **skeleton only**. There is **no**
> database schema, migration, login/logout, RBAC, learning-domain feature (content, exercise,
> learning events, mastery, reporting) or AI integration. Module boundaries exist as empty
> placeholders per ADR-001; the health scaffold exists only to prove build/start behavior.
> Do not treat any part of this skeleton as an implemented product feature.

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
│   │       ├── main.ts           # bootstrap (health scaffold only)
│   │       ├── app.module.ts     # root module wiring all boundaries
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
├── compose.yaml                  # local PostgreSQL dev/test topology (declarations only)
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

| Command                | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `npm install`          | Install all workspace dependencies                            |
| `npm run format`       | Format sources with Prettier                                  |
| `npm run format:check` | Verify formatting (CI-style)                                  |
| `npm run lint`         | ESLint over API and SPA (0 warnings tolerated)                |
| `npm run typecheck`    | TypeScript typecheck (no emit) for both apps                  |
| `npm run build`        | Build the API (`nest build`) and SPA (`vite build`)           |
| `npm test`             | Run automated tests (API health smoke test; SPA has none yet) |
| `npm run verify`       | format:check + lint + typecheck + build                       |

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

The API port comes from the `API_PORT` environment variable (default `3000`).

### Run the SPA

```bash
npm run dev -w @clp/web            # Vite dev server on http://localhost:5173
npm run build -w @clp/web          # production build to apps/web/dist
```

The SPA reads no privileged secret; nothing sensitive is bundled into the browser.

## Local PostgreSQL (Docker Compose)

`compose.yaml` **declares** a development database (`db`) and an isolated test database
(`db-test`). It contains **no committed credentials** — values are interpolated from your
local `.env`.

```bash
docker compose config       # validate interpolation (does not start anything)
docker compose up -d db     # start the dev database (later tasks)
```

Database connection, migrations and schema are **not implemented** in CLP-00-02 and are owned
by later approved tasks (CLP-00-03 config, CLP-00-04 persistence/migrations).

## Definition of done for this task

- clean `npm install`;
- `npm run build` (API + SPA) succeeds;
- `npm run format:check`, `npm run lint`, `npm run typecheck` succeed;
- API starts and answers `/health/live` and `/health/ready` without exposing internals;
- SPA builds with no privileged API/database secret;
- module boundaries exist with no CP-01+ behavior/schema;
- Compose declares PostgreSQL without committed credentials; `.env.example` has names only.

## Known deferred decisions

- **Repository host / CI provider** — deferred by Owner; must be chosen before CLP-00-09.
  This repository is **Git local only** for now: no remote, no CI workflow.
- **Prisma / migration tooling and exact versions** — pinned when CLP-00-04 starts (ADR-002).
- **Typed configuration loading & secret boundary** — CLP-00-03 (ADR-001/ADR-005).
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
