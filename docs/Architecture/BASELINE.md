# Architecture Baseline v0.1

**Status:** Proposed baseline for Owner approval  
**Applies from:** CP-00  
**Style:** Modular monolith, API/application-service boundaries, relational persistence

## 1. Architectural goal
Create the smallest architecture that safely supports Content → Exercises → Learning Events → Mastery → Student/Teacher UX and later allows an optional AI layer without making the learning platform dependent on an LLM.

## 2. Logical architecture

```text
[ Browser / Student / Teacher / Admin ]
                 |
                 v
        [ Web / API Interface ]
                 |
                 v
        [ Application Services ]
        /       |        |      \
       v        v        v       v
 Identity   Content   Learning   Reporting
                       |   |
                       |   +---- Exercise (CP-02)
                       +-------- Events   (CP-03)
                       +-------- Mastery  (CP-04)
                 |
                 v
           [ Repositories ]
                 |
                 v
          [ Relational DB ]

CP-07+ only:
[ AI Provider Adapter ] <-> [ AI Orchestrator ] -> [ Authorized App Tools ]
                                                  -> Application Services
```

The AI path is optional and points inward through controlled application tools. Core modules never call an AI provider to perform essential learning operations.

## 3. Deployment baseline
CP-00 targets a single deployable application plus relational database. Static/media storage may be local in development and abstracted for later object storage. Reverse proxy/TLS and production deployment details are environment concerns documented separately.

Do not introduce distributed services, queues or caches in CP-00 unless measurement/requirements establish the need and an ADR approves them.

## 4. Module boundaries
### Identity
Users, authentication, session lifecycle, role membership and authorization policy.

### Content (CP-01)
Courses, units, lessons and Chinese-specific learning items. Content owns source curriculum semantics.

### Exercise (CP-02)
Creates exercise instances from approved content and evaluates answers using explicit deterministic contracts.

### Learning Events (CP-03)
Records immutable/append-oriented evidence of learning interactions.

### Mastery (CP-04)
Consumes evidence and produces versioned derived learning state/review schedule.

### Reporting
Reads authorized projections/aggregates for students/teachers. It must not mutate authoritative learning evidence.

### AI (CP-07+)
Optional orchestration and provider adapters. May read/minimize context and propose outputs through authorized tools; does not own curriculum, mastery or identity.

## 5. Dependency direction
Allowed conceptual direction:

`Interface → Application → Domain → repository abstractions`

Infrastructure implements repository/provider adapters. Domain logic must not import web framework, SQL driver or AI SDK concerns.

Cross-module calls should use application contracts/services rather than reaching into another module's tables or persistence implementation.

## 6. Persistence principles
- Relational database is the system of record for application state.
- Migration history is append-only in normal operation.
- Learning-event records become authoritative evidence once CP-03 lands.
- Derived projections may be rebuilt/versioned.
- Store timestamps as unambiguous instants; display in configured user/system timezone.
- Media binaries are not required to live inside relational rows; persist references/metadata.

## 7. Identity and authorization baseline
Roles: `ADMIN`, `TEACHER`, `STUDENT`.

RBAC is necessary but not sufficient: later teacher/student resource relationships require object-level authorization. Authentication/session implementation must use secure server-side controls appropriate to the chosen stack. Authorization checks live on the server and are covered by negative tests.

## 8. API/interface baseline
No public external API is promised in CP-00. Internal web/API contracts should use explicit request/response models and validation. Error responses must not leak secrets, stack traces or unauthorized resource existence unnecessarily.

## 9. Observability
CP-00 establishes structured application logging and health/readiness behavior sufficient for development/deployment diagnosis. Logs must avoid secrets and unnecessary student content. Metrics/tracing can be expanded when operational requirements justify them.

## 10. Security baseline
Trust boundaries exist at browser/API input, authentication, authorization, database access, file/media handling and future AI provider/tool boundaries. Security review is required before each user-facing beta checkpoint.

Minimum CP-00 controls: secure password hashing, session/token hygiene, CSRF protection where applicable to the selected auth model, input validation, secret management via environment/configuration, least privilege, and dependency/CI checks selected by the implementation stack.

## 11. AI isolation invariant
The following must remain true:

```text
Disable all AI providers
        |
        v
Content       works
Exercises     works
Study         works
Events        works
Mastery       works
Teacher UI    works
Analytics     works
AI features   unavailable/degraded
```

Changing this invariant requires Owner approval and a new architecture decision.

## 12. ADRs required before divergence
Create an ADR before introducing: microservices; event broker; non-relational primary datastore; direct client-to-database access; AI direct persistence access; a second source of truth for learning state; or a breaking change to approved module contracts.
