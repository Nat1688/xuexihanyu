# Learning Events (CP-03)

**Task:** CP-03 — Learning events (append-only, versioned interaction evidence).
**Status:** Accepted by Owner.

This document describes the **learning-event domain and application boundary only**. It implements
the approved CP-03 slice and **nothing else**: an append-only, versioned, validated record of learner
interactions. Exercise generators/evaluators (CP-02 — stateless, in-memory), mastery/review
scheduling or progress projection (CP-04), the Student MVP UI flow, an analytics dashboard, AI, an
event broker/microservice and any mutable event endpoint are **not** present here.

## Scope

Implemented (`apps/api/src/modules/learning-events/`):

- **Domain** (`domain/`):
  - `learning-event-type.ts` — the **closed** `LearningEventType` vocabulary
    (`LESSON_STARTED`, `LESSON_COMPLETED`, `EXERCISE_PRESENTED`, `ANSWER_SUBMITTED`,
    `EXERCISE_COMPLETED`, `REVIEW_ACTIVITY`). There is no free-form or untyped event.
  - `schema-version.ts` — the payload schema-version policy (`CURRENT_SCHEMA_VERSION`,
    `SUPPORTED_SCHEMA_VERSIONS`, append-only history).
  - `event-metadata.ts` — the **bounded, allow-listed** metadata contract (the privacy guard):
    approved keys, per-key/total size limits, fail-closed rejection.
  - `event-ordering.ts` — UTC `occurredAt` validation and deterministic `(occurredAt, publicId)`
    ordering (`compareEvents` / `orderEvents`).
  - `learning-event.ts` — the validated event record contract (`AppendLearningEventInput`,
    `NewLearningEvent`, `StoredLearningEvent`, `makeLearningEvent`).
  - `learning-event-errors.ts` — typed, safe domain errors.
- **Application** (`application/`):
  - `learning-event-repository.ts` — the **append-only** `LearningEventRepository` port
    (`append`, bounded `listByActor`).
  - `learning-event-service.ts` — `LearningEventService` (`record` + bounded read).
  - `tokens.ts` — the DI token for the repository port.
- **Infrastructure** (`infrastructure/prisma-learning-event.repository.ts`) —
  `PrismaLearningEventRepository`, append-only adapter over `learning_events`.
- **Tests** — pure domain/service units, schema-structural tests, and a live `clp_test`
  integration suite.

Explicitly **not** implemented (forbidden by the contract): any update/delete/mutable event path,
mastery/review scheduling or progress projection (CP-04), Student MVP UI flow, analytics dashboard,
AI, event broker/microservice, and any raw answer/secret/session payload.

## Event vocabulary

| type                 | meaning                                                    |
| -------------------- | ---------------------------------------------------------- |
| `LESSON_STARTED`     | the learner began a lesson                                 |
| `LESSON_COMPLETED`   | the learner finished a lesson                              |
| `EXERCISE_PRESENTED` | an exercise was shown to the learner                       |
| `ANSWER_SUBMITTED`   | the learner submitted an answer (normalized outcome only)  |
| `EXERCISE_COMPLETED` | the learner finished an exercise                           |
| `REVIEW_ACTIVITY`    | a review interaction occurred                              |

Each type records **that an interaction happened** and its normalized outcome — never a derived
judgement.

## Event contract

`makeLearningEvent(input)` validates and freezes a `NewLearningEvent`:

- `type` — must be one of the closed vocabulary, else `LearningEventUnknownTypeError`.
- `schemaVersion` — defaults to the current version; unsupported values raise
  `LearningEventVersionError`.
- `actorPublicId` — required non-empty external id (server-derived, never a client claim).
- `occurredAt` — a valid UTC `Date` instant, else `LearningEventValidationError`.
- `refs` — optional `course`/`unit`/`lesson`/`learning_item` public ids and an opaque `exerciseRef`
  (≤ 200 chars).
- `metadata` — validated against the allow-list, else `LearningEventMetadataError`.

Errors carry a STABLE code and a SAFE message that names only the offending FIELD — never the
rejected value (which may be a secret).

## Metadata allow-list (privacy guard)

Approved keys (a rejected value is never echoed):

| key            | type   | notes                                  |
| -------------- | ------ | -------------------------------------- |
| `mode`         | string | CP-02 exercise mode token              |
| `format`       | string | CP-02 answer format token              |
| `outcome`      | string | normalized evaluation outcome evidence |
| `durationMs`   | number | non-negative whole milliseconds        |
| `feedbackCode` | string | CP-02 deterministic feedback code      |
| `source`       | string | bounded interaction-source token       |

Limits: each string ≤ 120 chars; the whole object ≤ 1024 bytes; at most the six approved keys.
Nested objects/arrays and any unlisted key — e.g. `answer`, `token`, `cookie`, `csrf`,
`sessionId` — are **rejected** (fail-closed), so an accidental secret can never be persisted.

## Ordering

Events are ordered by ascending `occurredAt` with ascending `publicId` as the stable tiebreak
(`compareEvents`). Ordering is total, deterministic, independent of input order and **clock-free**;
timestamps are UTC instants validated by `validateOccurredAt`.

## Append-only boundary

The port and service expose **no** mutation path. Tests assert the absence of `update`/`delete`/
`remove`/`upsert`/`replace` at both the port and the service, so the guarantee is enforced by a
failing test rather than convention. Records are frozen value objects (defensive immutability).

## Events are evidence, not derived progress

A learning event records interaction evidence only. Mastery, review scheduling and any progress
projection are **CP-04** and are deliberately absent: this boundary never computes or stores a
mastery/streak/schedule value. Teacher/admin read access is deferred to a separately approved
reporting/query contract.
