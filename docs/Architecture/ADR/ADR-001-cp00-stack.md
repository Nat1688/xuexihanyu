# ADR-001 — CP-00 Implementation Stack

- **Status:** Accepted by Owner — implementation authorization remains limited to CP-00 and starts only with approved task contracts.
- **Date:** 2026-09-30
- **Checkpoint:** CLP-00-01
- **Decision owner:** Product Owner
- **Scope:** Foundation stack only; no learning-domain feature, AI integration, public API, production deployment, or migration implementation is authorized by this ADR.

## Context

Chinese Learning Platform (CLP) requires a bootable, testable, secure modular monolith with relational persistence. CP-00 must establish repository/application skeleton, configuration/secrets boundary, PostgreSQL migration foundation, identity, authentication/session lifecycle, server-side RBAC, test harness, CI and operational baseline.

The Architecture Baseline requires the dependency direction:

```text
Interface → Application → Domain → repository abstractions
```

Infrastructure implements adapters. The application core must remain deterministic and usable if every AI provider is disabled. The browser must never receive database credentials or privileged secrets. Authorization is server-side. Later learning events are append-oriented authoritative evidence and later mastery/progress projections must be rebuildable from evidence/versioned rules where practical.

## Decision

CP-00 will use a **TypeScript modular monolith** with the following baseline:

| Area | Decision |
|---|---|
| Runtime | Actively supported Node.js LTS, pinned by the repository at implementation time. |
| Server/API | NestJS application using explicit REST request/response contracts. |
| Persistence | PostgreSQL as the relational system of record. |
| ORM/migrations | A TypeScript ORM with first-class, inspectable migration support; Prisma is the initial proposed implementation, subject to lockfile/version review during CLP-00-02/04. |
| Validation | One primary runtime schema system at HTTP/config boundaries (initial preference: Zod). Domain invariants remain explicit application/domain code, not controller-only validation. |
| Authentication | Password credential boundary plus opaque, server-side sessions stored in PostgreSQL for CP-00. |
| Authorization | Server-side policy/guard layer for `ADMIN`, `TEACHER`, and `STUDENT`; automated positive and negative tests. |
| Testing | TypeScript unit tests plus HTTP/API integration tests using isolated deterministic test data and an isolated PostgreSQL test database or equivalent. |
| Quality/CI | Formatting, lint, TypeScript typecheck, build, migration validation, automated tests, dependency/secret checks; CI must not require production secrets. |
| UI shape | React SPA riêng (Vite) gọi NestJS REST API; API và SPA giữ client/server boundary rõ ràng. |
| Local database | PostgreSQL chạy bằng Docker Compose cho development/test cục bộ tái lập được. |
| CI/repository host | Chưa chốt; CP-00 có thể dùng Git local trước, CI provider sẽ được chọn bằng ADR hoặc Owner decision riêng trước CLP-00-09. |
| Observability | Structured logging with redaction, health/readiness behavior, startup diagnostics and documented minimum backup/recovery assumptions. |

### Module boundaries

The repository/application skeleton will establish these boundaries:

```text
foundation       # config, errors, IDs, clock, health/logging interfaces
identity         # users, credentials, sessions, roles and policy contracts
content          # CP-01 placeholder contracts only
exercise         # CP-02 placeholder contracts only
learning-events  # CP-03 placeholder contracts only
mastery          # CP-04 placeholder contracts only
reporting        # authorized read-model/projection contracts only
ai               # CP-07+ placeholder; no provider SDK in application core
infrastructure   # PostgreSQL/ORM and web-framework adapters
```

Cross-module collaboration uses exported application contracts/services. A module must not read or mutate another module's persistence implementation directly. Domain logic must not import NestJS, ORM/SQL driver, HTTP, or AI SDK concerns.

### Session and RBAC baseline

- Browser sessions are opaque identifiers in secure cookies, backed by server-side session state in PostgreSQL.
- React SPA riêng được phục vụ/deploy tách logic với NestJS REST API. Session cookie flags, CSRF measures, CORS allowlist, origin policy và local development ports phải được chốt trong ADR-003 trước CLP-00-06.
- Password hashing must use a modern memory-hard algorithm selected and verified during CLP-00-05; plaintext/reversible password storage is forbidden.
- Required authorization tests: anonymous denied; STUDENT denied teacher/admin route; TEACHER denied admin route; authorized role allowed representative route.
- RBAC is a baseline only; teacher/student relationship authorization will later require object-level policy checks.

### Persistence and migration baseline

- PostgreSQL is the sole system of record for CP-00.
- CP-00 persistence may include only foundation/identity/session/role/bootstrap metadata required for the approved design. It must not prebuild content, exercise, mastery, reporting or learning-event domain schemas.
- Migration history is append-only in ordinary operation. Schema changes require migration tests and recovery/rollback consideration. Destructive changes require explicit Owner approval.
- Raw/parameterized SQL is permitted only behind infrastructure repository boundaries when profiling or ORM limitations justify it; no direct SQL from web controllers/domain code.

## Consequences

### Positive

- A small team can use one language across API, runtime validation, tests and a future web interface.
- NestJS modules and dependency injection give visible boundaries for the modular monolith.
- PostgreSQL supports transactional identity/RBAC now and append-oriented evidence/projection rebuilds later.
- Server-side sessions support immediate logout/revocation and reduce browser bearer-token exposure.
- The baseline preserves provider-neutral AI isolation for CP-07+.

### Costs and constraints

- Team must maintain dependency direction; framework decorators, DTOs and ORM entities must not become the domain model by default.
- ORM abstractions may not fit future projection/reporting queries; use measured, repository-contained SQL rather than bypassing module boundaries.
- Server-side session and CSRF details depend on the UI topology; implementation must not guess these controls.
- This decision does not authorize microservices, queues, caches, event brokers, client-to-database access, non-relational primary storage, AI direct persistence access, or a second learning-state source of truth.

## Alternatives considered

### FastAPI + PostgreSQL

Strong option for a Python-first team and future AI/data work. It was not selected because the CP-00 web/API foundation for a small team benefits from a unified TypeScript toolchain and NestJS's more explicit module structure. Reconsider only if Owner confirms Python-first staffing or a materially different product/operations need.

### Go + PostgreSQL

Operationally efficient and explicit with interfaces, but more boilerplate slows initial product/API iteration for a small team. Reconsider if the team is Go-first or measured operational constraints outweigh delivery speed.

### Microservices/event broker/cache in CP-00

Rejected. They contradict the modular-monolith and single-deployable baseline unless an ADR backed by requirements/measurement approves divergence.

### Browser JWT as default session strategy

Not selected for CP-00. Opaque server-side sessions simplify revocation/logout and minimize client token handling. A future change requires an ADR with CSRF/origin/token-lifetime/revocation analysis.

## Required follow-up ADRs / Owner decisions

1. **ADR-002:** final migration/ORM policy, test database lifecycle and transaction boundaries.
2. **ADR-003:** web UI topology, session cookie settings, CSRF/origin controls and deployment assumptions.
3. **ADR-004:** identity account lifecycle and detailed role/policy contract.
4. **ADR-005:** error model, structured logging, redaction and health/readiness standard.
5. **Owner decisions recorded:** React SPA riêng (Vite) gọi NestJS REST API; PostgreSQL local/test chạy bằng Docker Compose; repository host/CI provider được Owner hoãn quyết định. Production deployment target và supported browser policy vẫn cần chốt hoặc được ghi rõ là deferred trước các task liên quan.

## Verification / implementation gate

Before CLP-00-02 begins, Năm/SOL must confirm the follow-up decisions needed by that task contract. CLP-00 completion remains gated on: clean setup and boot; zero-to-current migrations; login/logout/session tests; RBAC positive and negative tests; CI pass; secret/config review; independent review; documentation accuracy; and no CP-01+ feature implementation.

## Compliance

This ADR does not amend the Project Charter, Architecture Baseline, Roadmap or AGENTS rules. Any conflict or future need to change AI isolation, persistence model, security boundary, public contract, module boundary, or checkpoint scope must stop and be escalated to the Owner.
