# Database — mastery projection (CP-04)

CP-04 adds **one** table: `mastery_projections`. It is a **derived, replaceable
projection** over CP-03 evidence — never a source of truth. It can be dropped
and rebuilt from the immutable `learning_events` at any time, and a rebuild
yields the same rows as an incremental derivation.

## Model

```
model MasteryProjection {
  id                  String       @id @default(uuid()) @db.Uuid
  actorId             String       @map("actor_id") @db.Uuid
  learningItemId      String       @map("learning_item_id") @db.Uuid
  state               MasteryState
  dueAt               DateTime     @map("due_at") @db.Timestamptz(6)
  ruleVersion         Int          @map("rule_version")
  consecutiveCorrect  Int          @default(0) @map("consecutive_correct")
  latestOutcomeLapsed Boolean      @default(false) @map("latest_outcome_lapsed")
  sourceLastEventAt   DateTime?    @map("source_last_event_at") @db.Timestamptz(6)
  sourceLastEventId   String?      @map("source_last_event_id") @db.VarChar(64)
  recomputedAt        DateTime     @map("recomputed_at") @db.Timestamptz(6)
  createdAt           DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime     @updatedAt @map("updated_at") @db.Timestamptz(6)

  actor        User         @relation(fields: [actorId], references: [id], onDelete: Restrict)
  learningItem LearningItem @relation(fields: [learningItemId], references: [id], onDelete: Cascade)

  @@unique([actorId, learningItemId])
  @@index([actorId])
  @@index([dueAt])
  @@index([state])
  @@map("mastery_projections")
}
```

### Columns

- `actorId` / `learningItemId` — the **(user, learning item)** pair the
  projection is keyed by. `actorId` is `RESTRICT` (a user is never silently
  erased with derived rows); `learningItemId` is `CASCADE` (deleting an item
  removes its now-meaningless projections). Evidence rows are unaffected:
  deleting an item `SET NULL`s the event's item reference, it does not delete the
  event.
- `state` — the derived `MasteryState` (`NEW` / `LEARNING` / `FAMILIAR` /
  `MASTERED`). A **closed** vocabulary; new states require a separately approved
  contract.
- `dueAt` — derived review due-at instant (UTC), a pure function of `state` and
  the schedule anchor.
- `ruleVersion` — the deterministic rule set the state was derived under. Stored
  with every row so the rules can evolve without misreading old projections.
- `consecutiveCorrect` / `latestOutcomeLapsed` — the running rule inputs that
  drove the transition and the schedule step-down; exposed for auditability.
- `sourceLastEventAt` / `sourceLastEventId` — the **source-event cursor**: the
  instant and stable public id of the latest event folded in. An incremental
  pass folds only events strictly after this cursor; a rebuild ignores it.
- `recomputedAt` — server recompute instant supplied by the caller (the mastery
  boundary never reads the wall clock).

### Key & indexes

- `@@unique([actorId, learningItemId])` — exactly **one** projection per pair. A
  recompute **overwrites** the row (upsert); it never appends a duplicate.
- `@@index([actorId])` — per-learner reads.
- `@@index([dueAt])` — review-due queries.
- `@@index([state])` — state-distribution queries.

## Replaceable / rebuildable

Because the table is derived, the mastery boundary may:

- **replace** a row (idempotent upsert by the unique pair), and
- **clear** the whole table and **rebuild** it from ordered `learning_events`.

This is the only exception to the project's append-only posture, and it applies
to **derived** rows only. `learning_events` remains strictly append-only; the
mastery code path has no write access to evidence.

## Migration

`prisma/migrations/20261016140000_mastery_projections/migration.sql`
(hand-verified against `prisma migrate diff`) creates:

- `CREATE TYPE "MasteryState" AS ENUM ('NEW', 'LEARNING', 'FAMILIAR', 'MASTERED')`
- `CREATE TABLE "mastery_projections" (…)`
- the three indexes, the pair unique index, and the two foreign keys.

It does **not** create any trigger or any statement touching `learning_events`.
