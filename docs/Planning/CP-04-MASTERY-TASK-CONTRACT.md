# CP-04 Mastery & Review Engine Task Contract

**Status:** Accepted by Owner — deterministic mastery implementation may proceed only within this scope.

## Objective

Derive reproducible per-user/per-learning-item mastery state and review schedule from CP-03 authoritative events using a versioned deterministic rule set.

## Allowed

- Projection table keyed by user + learning item, storing derived state, due-at, rule version, source-event cursor/reference, recompute timestamp.
- Rule vocabulary: `NEW`, `LEARNING`, `FAMILIAR`, `MASTERED`.
- Deterministic transition/review interval functions from explicitly accepted event types/outcomes.
- Replay/rebuild command that derives projection from ordered event evidence without mutating events.
- Unit/integration fixtures proving same ordered events produce same state/due time and rebuild equals incremental result.

## Integrity

- Events remain source of truth; mastery projection is replaceable/rebuildable.
- Rule version is stored with projection; rule changes require versioned deterministic migration/rebuild path.
- No LLM/AI decision, random scheduling, manual direct state update endpoint or silent event alteration.

## Forbidden

No Student UI/TODAY flow, notification/reminder job, analytics dashboard, teacher override UI, CP-05/06 features, AI, event mutation, unbounded historical reprocessing without explicit command.

## Acceptance

- Projection migration and rebuild/incremental tests pass.
- NEW→LEARNING→FAMILIAR→MASTERED transitions and review intervals are explicit/tested.
- Event ordering/version/replay idempotency tests pass.
- Host migration/reset/secret/quality gates pass.
