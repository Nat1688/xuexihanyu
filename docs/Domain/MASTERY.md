# Domain — mastery & review (CP-04)

CP-04 derives **reproducible** per-user/per-learning-item mastery state and a
review schedule from CP-03 authoritative events, using a **versioned
deterministic rule set**. There is no AI, no randomness and no clock read: the
same ordered evidence under the same rule version always yields the same state
and the same due-at instant.

## Authority model

- `learning_events` (CP-03) are the **source of truth**.
- `mastery_projections` (CP-04) are **derived, replaceable**: they can be dropped
  and rebuilt from events, and a rebuild equals an incremental derivation.
- The mastery boundary **never mutates events** (its event access is read-only).

## Mastery state vocabulary

A closed set, ordered least → most proficient:

```
NEW  →  LEARNING  →  FAMILIAR  →  MASTERED
```

Adding a state requires a separately approved contract; it is not a free-form
value.

## Rule version

The projection is versioned (`ruleVersion`). Version **1** is the current and
supported rule set. A rule change is a **new version** plus a deterministic
rebuild path — the stored source-event cursor lets a rebuild re-derive from
immutable evidence without touching events. A version outside the supported set
is rejected with a typed, safe error.

## Transition rules (rule version 1)

Pure functions of the ordered evidence. Outcomes are read from the CP-03
allow-listed metadata `outcome` token (`correct` / `incorrect`) — never from a
raw answer.

| Evidence | Effect on state | Streak |
| --- | --- | --- |
| `ANSWER_SUBMITTED` · `correct` | `NEW→LEARNING`; `LEARNING→FAMILIAR` at 2 consecutive correct; `FAMILIAR→MASTERED` at 4 | `+1` |
| `ANSWER_SUBMITTED` · `incorrect` (lapse) | state **unchanged** (a lapse affects scheduling only, so the state function stays monotone and rebuild-stable) | reset to `0`, flagged `latestOutcomeLapsed` |
| `EXERCISE_COMPLETED` | `NEW→LEARNING` (engagement); never promotes further, never resets the streak | — |
| `REVIEW_ACTIVITY` | state unchanged; refreshes the schedule anchor | — |
| `LESSON_STARTED` / `LESSON_COMPLETED` / `EXERCISE_PRESENTED` | contextual only; move the anchor, never change state or streak | — |

**Thresholds (v1):** `FAMILIAR` at **2** consecutive correct, `MASTERED` at **4**.

Only events carrying a **learning-item reference** are keyed to a projection;
events without one are ignored (not keyed).

## Deterministic review schedule

Review timing is a pure function of `(state, asOf, latestOutcomeLapsed)`. The
schedule anchor is the latest folded event instant; nothing reads `Date.now()`.

| State | Base interval |
| --- | --- |
| `NEW` | `0` (due immediately) |
| `LEARNING` | 4 hours |
| `FAMILIAR` | 1 day |
| `MASTERED` | 7 days |

A `MASTERED` item whose latest evidence is a **lapse** steps down to the
`FAMILIAR` interval, so renewed difficulty is revisited sooner — still a pure
function of evidence.

## Derivation, replay and rebuild

- **Incremental** (`deriveForActor`): for each item, fold only events *after*
  the stored cursor onto the existing projection, then replace the row.
  Idempotent: re-running with no new evidence leaves an equal projection.
- **Replay** (`replay`, one actor): re-derive from *all* the actor's ordered
  events, ignoring the cursor. Equals the incremental result.
- **Rebuild** (`rebuild`, explicit only): clear the derived store and re-derive
  from *all* events across all actors. This is the contract's bounded,
  explicitly-commanded reprocessing path — it never runs implicitly.

All three share the same pure reducer, so **rebuild == incremental** for
identical ordered evidence.

## Integrity guarantees

- Events remain the source of truth; the projection is replaceable/rebuildable.
- Rule version is stored with every projection.
- **No** LLM/AI decision, random scheduling, manual direct state-update endpoint,
  or silent event alteration. There is no controller and no UI in CP-04.
