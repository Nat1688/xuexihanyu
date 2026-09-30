# CP-00 Task Breakdown — Foundation

**Checkpoint objective:** establish a secure, reproducible, testable application foundation.  
**Implementation authorization:** tasks may begin only after Owner approves the CP-00 baseline and stack decision.  
**Forbidden in CP-00:** vocabulary/course CRUD, exercises, mastery, learning analytics, AI integration.

## Dependency map

```text
CLP-00-01 Baseline/stack decision
   ├── CLP-00-02 Repository skeleton
   ├── CLP-00-03 Configuration/secrets
   └── CLP-00-04 Database/migrations
             |
             +--> CLP-00-05 Identity model
                      |
                      +--> CLP-00-06 Authentication/session
                               |
                               +--> CLP-00-07 RBAC/authorization

CLP-00-02/03 --> CLP-00-08 Test harness
CLP-00-02/08 --> CLP-00-09 CI/quality gates
CLP-00-03/04 --> CLP-00-10 Health/logging/ops baseline
CLP-00-05/06/07 --> CLP-00-11 Bootstrap/seed
All above --> CLP-00-12 Security + architecture review
CLP-00-12 findings closed --> CLP-00-13 Full regression/docs/checkpoint
```

## CLP-00-01 — Stack Decision & ADR
**Owner:** SOL  
**Objective:** select and document the implementation stack without changing the architecture principles.

**Must decide:** server/web framework, relational DB, migration mechanism, test framework, dependency management, formatting/lint/static checks, session/auth approach, supported dev/prod runtime.

**Acceptance:** ADR records choice, alternatives, constraints and consequences; no framework choice weakens the AI isolation or modular-monolith baseline; Owner approval recorded.

## CLP-00-02 — Repository & Module Skeleton
**Owner:** TERRA  
**Depends:** 00-01

Create the application skeleton and module boundaries for identity, content, exercise, learning events, mastery, reporting and future AI, while only Identity/Foundation receives functional implementation in CP-00.

**Acceptance:** clean dependency install/build; app starts; future modules are empty contracts/placeholders rather than speculative features; README contains local startup path.

## CLP-00-03 — Configuration & Secret Boundary
**Owner:** TERRA / review by LUNA

Define typed/validated configuration for dev/test/prod. Provide `.env.example` or equivalent containing names only, never secrets.

**Acceptance:** missing required config fails clearly; test config isolated; production secrets absent from repository; secret scan/check documented.

## CLP-00-04 — Database & Migration Foundation
**Owner:** TERRA

Configure relational persistence, connection lifecycle and migration framework.

**Acceptance:** clean DB migrates from zero; migration status is inspectable; test DB can be recreated deterministically; migration tests exist; no learning-domain schema is added prematurely.

## CLP-00-05 — Identity Domain
**Owner:** SOL contract → TERRA implementation

Define user identity and role representation for ADMIN/TEACHER/STUDENT, account lifecycle states needed for CP-00, and password credential boundary.

**Acceptance:** uniqueness/invariants documented and tested; password hashes only; role semantics documented; no teacher/student profile over-modeling yet.

## CLP-00-06 — Authentication & Session Lifecycle
**Owner:** TERRA

Implement login/logout/current-user/session behavior using the approved auth ADR.

**Acceptance:** correct login succeeds; invalid login fails without credential leakage; logout invalidates expected session state; protected route rejects anonymous requests; session/cookie security settings are environment-appropriate and tested where feasible.

## CLP-00-07 — RBAC / Authorization Foundation
**Owner:** SOL contract → TERRA implementation

Implement server-side authorization primitives for ADMIN/TEACHER/STUDENT and representative protected endpoints/routes.

**Required negative matrix:** anonymous denied; STUDENT denied teacher/admin resource; TEACHER denied admin-only resource; authorized role allowed representative resource.

**Acceptance:** automated authorization tests PASS; no reliance on UI visibility for security.

## CLP-00-08 — Test Harness & Fixtures
**Owner:** LUNA

Establish unit/integration test structure, isolated database fixture strategy, deterministic user/role factories and commands for targeted/full suite.

**Acceptance:** tests run from clean checkout; tests do not depend on execution order or real external services; failure exit codes work in CI.

## CLP-00-09 — CI & Quality Gates
**Owner:** LUNA / TERRA

Add CI for install/build, formatting/lint/static checks selected in ADR, migration validation and automated tests.

**Acceptance:** pull/branch workflow receives deterministic PASS/FAIL; no production secret required; cache is optional and cannot change correctness.

## CLP-00-10 — Operational Baseline
**Owner:** TERRA

Add health/readiness behavior, structured logging policy, startup diagnostics and minimum backup/recovery notes appropriate to the selected DB/deployment.

**Acceptance:** operators can distinguish app-start failure from DB/config failure; logs redact secrets; health endpoint does not expose sensitive internals.

## CLP-00-11 — Bootstrap / Seed
**Owner:** TERRA

Provide deterministic non-production seed/test users and a safe production ADMIN bootstrap mechanism.

**Acceptance:** no hard-coded production password; bootstrap cannot silently recreate/overwrite an existing privileged account; seed data clearly separated from production behavior.

## CLP-00-12 — Independent Foundation Review
**Owner:** Reviewer

Review CP-00 diff against PROJECT_CHARTER, AGENTS and Architecture Baseline.

**Required review areas:** auth/session, RBAC negatives, secret handling, migrations, dependency direction, test isolation, error leakage, logging, bootstrap privilege path.

**Gate:** CRITICAL/HIGH/MEDIUM findings must be resolved or explicitly Owner-accepted before checkpoint. LOW findings may be deferred only with tracked rationale.

## CLP-00-13 — Checkpoint Closure
**Owner:** SOL + LUNA; Owner approves closure

Run full regression, reconcile docs with actual implementation, record review/finding closure and create checkpoint commit/tag according to repository convention.

**CP-00 Definition of Done:**
- clean checkout setup documented;
- application boots;
- zero-to-current migrations PASS;
- login/logout/session tests PASS;
- RBAC positive + negative tests PASS;
- CI PASS;
- secret/config review PASS;
- independent review gate satisfied;
- docs reflect implementation;
- no CP-01+ feature accidentally implemented.

## Suggested first agent dispatch
1. **SOL:** execute CLP-00-01 only; return proposed ADR, no application code.
2. **Explorer:** in parallel only if requested, compare viable stack choices against the Charter; no architecture authority.
3. **Owner:** approve stack/ADR.
4. **TERRA/LUNA:** begin tasks according to dependency map.

### Prompt for SOL
> Read `PROJECT_CHARTER.md`, `ROADMAP.md`, `AGENTS.md`, `docs/Architecture/BASELINE.md`, and `docs/Planning/CP-00_TASKS.md`. Execute **CLP-00-01 only**. Propose the concrete technology stack and an ADR. Do not implement application code. Preserve all architecture invariants. Explicitly identify unresolved decisions, tradeoffs, security implications, development/deployment assumptions, and whether any proposed choice requires an amendment to the baseline. End with a clear `READY FOR OWNER APPROVAL` or `BLOCKED` status.
