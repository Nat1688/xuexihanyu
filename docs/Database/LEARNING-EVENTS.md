# Learning Events (CP-03)

**Task:** CP-03 — Learning events (append-only, versioned interaction evidence).
**Status:** Accepted by Owner.

This document describes the **learning-event persistence and domain boundary only**. It implements
the approved CP-03 slice and **nothing else**: an append-only, versioned, validated record of
learner interactions. Exercise generators/evaluators (CP-02 — stateless, in-memory), mastery/review
scheduling or progress projection (CP-04), the Student MVP UI flow, an analytics dashboard, AI, an
event broker/microservice and any mutable event endpoint are **not** present here.

## Scope

Implemented:

- Prisma model + one append-only migration for exactly one table: `learning_events`, plus the
  `LearningEventType` enum.
- Domain contracts in `apps/api/src/modules/learning-events/domain/`:
  - `learning-event-type.ts` — the closed `LearningEventType` vocabulary.
  - `schema-version.ts` — the payload schema-version policy.
  - `event-metadata.ts` — the bounded, allow-listed metadata contract (privacy guard).
  - `event-ordering.ts` — `occurredAt` validation + deterministic `(occurredAt, id)` ordering.
  - `learning-event.ts` — the validated event record contract (`makeLearningEvent`).
  - `learning-event-errors.ts` — typed, safe domain errors.
- Application port `LearningEventRepository` (**append-only**) + `LearningEventService`.
- Infrastructure `PrismaLearningEventRepository` (append-only).
- Unit tests (pure), schema-structural tests and a live integration suite against `clp_test`.

Explicitly **not** implemented (forbidden by the contract): any update/delete/mutable event path,
mastery/review scheduling or progress projection, Student MVP UI flow, analytics dashboard, AI, an
event broker/microservice, and any raw answer/secret/session payload.

## Persistence model

| Prisma model    | Table             | Key columns |
| --------------- | ----------------- | ----------- |
| `LearningEvent` | `learning_events` | `id` (uuid PK), `public_id` (uuid, UNIQUE), `schema_version` (int), `type`, `actor_id` (uuid FK → users, ON DELETE RESTRICT), `course_id`/`unit_id`/`lesson_id`/`learning_item_id` (uuid FK, nullable, ON DELETE SET NULL), `exercise_ref` (varchar(200), nullable), `occurred_at` (timestamptz), `metadata` (JSONB, nullable), `created_at` (timestamptz); indexes `(actor_id, occurred_at)`, `(occurred_at, id)`, `(type)` |

Enums:

- `LearningEventType` = `LESSON_STARTED` | `LESSON_COMPLETED` | `EXERCISE_PRESENTED` |
  `ANSWER_SUBMITTED` | `EXERCISE_COMPLETED` | `REVIEW_ACTIVITY`

## Event contract

Every event carries:

- a non-guessable `public_id` (external UUID; the surrogate `id` never leaves persistence);
- a `schema_version` (`1` today; new events are written at the current version);
- a `type` from the closed vocabulary (no free-form/untyped event);
- a server-derived `actor_id` (evidence is attributable and never a client-claimed identity);
- optional content/exercise references (`course`/`unit`/`lesson`/`learning_item` by public id, and
  an opaque `exercise_ref`);
- a UTC `occurred_at` instant (caller-supplied, validated);
- bounded, allow-listed `metadata`;
- a server `created_at` receipt instant.

## Integrity — append-only

Mutation of evidence is impossible through the application boundary:

- The `LearningEventRepository` port declares only `append` and a bounded, read-only `listByActor`.
  There is no `update`, `delete`, `upsert` or `replace` method.
- `LearningEventService` exposes only `record` (validate + append) and `listByActor`. It has no
  mutation method.
- The migration defines no update/delete trigger and no mutable column. Records are plain relational
  rows, so the contract stays portable and auditable.

Tests assert the ABSENCE of these methods at both the port and the service, so the guarantee is
enforced by a failing test rather than convention. Ordering is deterministic: ascending
`occurred_at`, with ascending `public_id` as the stable tiebreak; timestamps are UTC instants.

## Privacy, metadata & retention

- **Events are EVIDENCE, not derived progress.** A row records *that* an interaction happened and
  its normalized outcome; it never stores a mastery, streak, schedule or progress value. Any future
  progress/mastery view is a separately approved projection (CP-04) computed from these events, and
  is deliberately absent here.
- **Metadata is fail-closed.** Only a small allow-list of keys is accepted
  (`mode`, `format`, `outcome`, `durationMs`, `feedbackCode`, `source`); any other key — e.g.
  `answer`, `token`, `cookie`, `csrf`, `sessionId` — is rejected. Values must be flat primitives
  within per-key length and total byte budgets; nested objects/arrays are refused. A rejected value
  is **never** echoed in the error message.
- **No raw secrets.** The boundary never stores raw answers, credentials, cookies, CSRF tokens or
  session payloads; evaluation outcome is a short normalized token supplied by CP-02, not the
  submitted answer text.
- **Attributable & bounded.** Every event is tied to an existing actor (FK, `RESTRICT`) and its
  optional content references `SET NULL` on deletion — the interaction record survives its content
  but never becomes ownerless.
- **Read access is minimal.** Only a bounded, evidence-inspection read (`listByActor`) exists.
  Teacher/admin reporting is deferred to a separately approved reporting/query contract.

## Migration

`prisma/migrations/20261016100400_learning_events/` — additive DDL (1 enum, 1 table, indexes, FKs).
Hand-written to match the deterministic `prisma migrate diff … --script` output (the format is
verified by a diff that produces "an empty migration"); never edited once applied.
