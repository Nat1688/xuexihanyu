# AGENTS.md — Chinese Learning Platform

This file is binding guidance for all coding/research/review agents operating in this repository.

## 1. Authority hierarchy
1. Owner-approved task/spec.
2. Approved architecture/ADR.
3. This file.
4. Checkpoint documentation and tests.
5. Implementation convenience.

If sources conflict, stop and escalate. Never silently resolve a higher-level conflict by changing code.

## 2. Team responsibilities
### SOL — Lead / Architect
May define contracts, ADRs, task boundaries and adjudicate findings. Should not implement a large feature it will later approve without independent review.

### Explorer — Research
Investigates product patterns, libraries, pedagogy, security approaches and edge cases. Produces evidence/options; does not authorize or merge architecture changes.

### TERRA — Implementation
Implements only approved task scope. Must preserve contracts, add/update tests, run targeted tests, and report exact files changed and commands/results.

### LUNA — Verification / bounded work
Owns fixtures, unit/integration tests, documentation consistency and explicitly delegated low-risk tasks. Must not alter business rules merely to make tests pass.

### Reviewer — Independent review
Reviews diff + governing spec/ADR. Classifies findings: CRITICAL/HIGH/MEDIUM/LOW. Does not implement fixes during the same review pass.

## 3. Mandatory feature lifecycle
`REQUEST → SPEC → RESEARCH if needed → ARCHITECTURE → OWNER APPROVAL → IMPLEMENT → TARGETED TEST → REVIEW → FIX → RE-REVIEW → FULL REGRESSION → DOC UPDATE → CHECKPOINT`

No direct `IDEA → CODE` path.

## 4. Task contract
Every implementation task must state:
- Task ID and checkpoint.
- Objective.
- In scope.
- Explicitly out of scope.
- Governing contracts/docs.
- Allowed files/modules where practical.
- Acceptance criteria.
- Required tests.
- Security/data migration implications.

If an implementation requires an out-of-scope change, stop and request a task/spec amendment.

## 5. Architecture invariants
- Modular monolith first; do not introduce microservices without an approved ADR.
- UI depends on application/API contracts, not persistence internals.
- Domain/application code must not depend on a specific LLM vendor.
- AI tools call authorized application services; AI gets no direct database access.
- Server-side authorization is mandatory; UI hiding is not authorization.
- Learning events are append-oriented evidence. Do not overwrite history to update progress.
- Derived mastery/progress is not authoritative event history.
- Time is stored unambiguously (UTC instants where applicable); presentation timezone is explicit.
- IDs exposed outside persistence should not rely on guessable sequencing when that creates unnecessary enumeration risk.
- Secrets, tokens and production credentials never enter the repository.

## 6. Data and migrations
Every schema change requires a migration and tests. Destructive migration requires explicit approval and recovery/backup consideration. Never edit an already-applied migration to disguise a schema change. Seed/bootstrap data must be deterministic and must not contain real student data.

## 7. Testing policy
For each task: run targeted tests first, then checkpoint-relevant regression. Before checkpoint closure, run the full automated suite. Bug fixes require a regression test when reproducible. Do not weaken assertions, skip tests or alter fixtures to hide a defect without explicit justification and review.

## 8. Security/privacy rules
- Least privilege for ADMIN/TEACHER/STUDENT.
- Validate input at trust boundaries.
- Protect state-changing browser requests against the chosen session/auth threat model.
- Passwords use a modern password hashing scheme; never reversible encryption/plaintext.
- Rate-limit/authenticate sensitive endpoints as appropriate.
- Avoid logging passwords, tokens, session secrets or unnecessary student content.
- Teacher access to student data must be scoped to authorized relationships/classes.
- AI context must be minimized to what the requested operation needs.

## 9. AI-specific rules
Until CP-07 is opened, production AI integration is forbidden except isolated prototypes explicitly marked non-production.

After CP-07:
- AI output is untrusted input to the application.
- Tool arguments are validated and authorized server-side.
- AI cannot directly change mastery, grades, permissions or source curriculum.
- Generated exercises/content are distinguishable from teacher-authored source content.
- Provider failure must degrade gracefully; core study flows continue.

## 10. Git/checkpoint discipline
Prefer one coherent task per commit. Commit messages include task ID, e.g. `CLP-00-04 add migration bootstrap`. Do not rewrite shared history without Owner approval. Checkpoint commit is created only after required review, regression and docs are complete.

## 11. Agent completion report
Every implementation handoff must include:
1. Task ID / status.
2. Files changed.
3. Behavior implemented.
4. Tests run + exact result.
5. Known limitations/findings.
6. Migration/config changes.
7. Whether scope/contracts changed (normally `NO`).

## 12. Stop conditions
Stop instead of guessing when encountering ambiguity involving authorization, data loss, schema semantics, mastery/evaluation rules, privacy, AI write authority, public API compatibility or a conflict with an approved contract.
