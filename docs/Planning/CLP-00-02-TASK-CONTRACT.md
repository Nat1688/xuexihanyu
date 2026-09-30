# Task Contract — CLP-00-02 Repository & Module Skeleton

**Status:** Accepted by Owner — Dev may execute only the stated scope.

## Objective

Create the first version-controlled NestJS + React SPA repository skeleton and empty module boundaries required by accepted ADR-001 through ADR-005. No domain feature behavior is authorized.

## In scope

- Initialize Git locally in `chinese-learning-foundation`.
- Create NestJS API and React/Vite SPA workspace structure using current supported versions.
- Add package/lock files, formatting/lint/typecheck/build baseline, `.gitignore`, `.env.example` containing names only, README local startup stub and Docker Compose PostgreSQL development/test topology.
- Create empty boundaries/placeholders only: foundation, identity, content, exercise, learning-events, mastery, reporting and ai.
- Configure only enough application boot/health scaffolding to prove build/start behavior; functional Identity/auth/database work belongs to later approved tasks.

## Explicitly out of scope

No database schema/migration, user/session/role table, login/logout/RBAC endpoint, content/course/lesson/exercise/mastery/event/reporting/AI feature, production deploy, CI provider workflow, seed account, external identity provider, secret or public API.

## Governing documents

`PROJECT_CHARTER.md`, `ROADMAP.md`, `AGENTS.md`, `docs/Architecture/BASELINE.md`, `ADR-001`, `ADR-002`, `ADR-003`, `ADR-004`, `ADR-005`.

## Acceptance criteria

1. Git repository initialized with coherent first commit containing task ID `CLP-00-02`.
2. Clean install, format/lint/typecheck/build commands succeed and are documented.
3. API starts and exposes safe liveness/readiness scaffolding without secrets/internal details.
4. React SPA starts/builds and has no privileged API/database secret.
5. Module boundaries exist but no CP-01+ domain behavior/schema is implemented.
6. Docker Compose declares PostgreSQL without committed credentials; `.env.example` has names only.
7. README states prerequisites, local setup, commands, and known deferred decisions.
8. Dev reports exact files, commands/exit codes, dependency versions, limitations and confirms no scope drift.

## Required verification

- clean dependency install;
- API build and SPA build;
- lint/format/typecheck;
- application boot/health smoke test;
- secret scan/check;
- review that no learning-domain schema or features exist.

## Security and review gates

- Owner approval is required before Dev begins.
- Năm reviews the diff against all accepted ADRs.
- Any package, architecture, CORS/session behavior, migration or Docker change outside this contract stops work for amendment.
- No push, remote repository creation, CI provider setup, merge or deployment without a separate Owner instruction.
