# Exercise Engine (CP-02)

**Task:** CP-02 — Exercise engine (provider-neutral, deterministic exercise contracts,
generators, evaluators, normalization). **Status:** Accepted by Owner.

This document describes the **exercise domain and application boundary only**. It implements the
approved CP-02 slice and **nothing else**: content-derived, provider-neutral exercises that are
**generated** from approved content and **evaluated** deterministically, with one explicit
normalization policy. Learning events/attempt capture (CP-03), mastery/review scheduling (CP-04),
AI generation/orchestration, media storage/delivery, persisted exercise sessions and any UI are
**not** present here.

## Scope

Implemented (`apps/api/src/modules/exercise/`):

- **Domain** (`domain/`):
  - `exercise-mode.ts` — the closed mode/format vocabulary:
    - content-derived modes `ZH_TO_VI`, `VI_TO_ZH`, `ZH_TO_PINYIN`, `PINYIN_TO_ZH`, each pinned to
      a fixed (question, answer) content-field binding;
    - answer formats `MULTIPLE_CHOICE`, `TYPING`;
    - audio modes `AUDIO_TO_ZH`/`AUDIO_TO_VI` declared as **contract placeholders only** — they
      exist in the vocabulary but the generator/evaluator **refuse** them (no media delivery).
  - `normalization.ts` — the single, pure, deterministic normalization policy (see below).
  - `distractors.ts` — deterministic, seed-stable multiple-choice distractor selection drawn
    from approved candidates only.
  - `exercise-definition.ts` — the content-REferenced definition/instance contract plus the
    learner-facing projection that strips the answer key.
  - `evaluation.ts` — pure, deterministic evaluation of a submitted answer.
  - `exercise-errors.ts` — typed, safe domain errors.
- **Application** (`application/`):
  - `exercise-ports.ts` — the narrow, read-only `ExerciseContentReader` port + request/batch types.
  - `exercise-service.ts` — `ExerciseService` (generate + evaluate + learner projection).
  - `tokens.ts` — the DI token for the reader port.
- **Infrastructure** (`infrastructure/prisma-exercise-content.reader.ts`) —
  `PrismaExerciseContentReader`, a read-only adapter over the CP-01 content tables that surfaces
  **approved content only**.
- **Tests** — pure domain + service units, and a live `clp_test` integration suite for the reader.

Explicitly **not** implemented (forbidden by the contract): learning-event/attempt capture,
mastery/review scheduling, AI generation/orchestration, media storage/delivery, persisted exercise
sessions, import/export, analytics and any UI/HTTP controller.

## Persistence

**None.** CP-02 adds **no** Prisma models, **no** migration and **no** tables. Exercises are
generated in-memory from approved content and evaluated in-memory; nothing is stored. The only
data access is a **read-only** view of CP-01 content through
`ExerciseContentReader` / `PrismaExerciseContentReader`.

## Approved-content rule

An exercise may only be seeded from content a **learner is allowed to read**:

- a lesson must be `PUBLISHED` for its items to be listed (`listApprovedItemIds` returns `null`
  for a missing or `DRAFT` lesson);
- a single item is returned only when it is attached to at least one `PUBLISHED` lesson
  (`getApprovedItem` returns `null` otherwise).

The reader surfaces only `publicId` plus the Chinese fields (`simplified`, `pinyin`, `meaning`);
the internal surrogate `id` never leaves the infrastructure layer.

## Determinism

Generation and evaluation are **pure and deterministic** — no AI, no model, no randomness, no
clock:

- items are processed in the lesson's stored **position order**;
- multiple-choice options are the answer plus distractors chosen by a stable hash of
  `seed + publicId`, so the same `(pool, answer, seed)` always yields the same options and the
  result is independent of the candidate input order;
- distractors are **de-duplicated** (after field normalization) and never equal the correct
  answer; selection is best-effort (fewer than requested when the pool is small);
- evaluation normalizes both sides with the same field policy and compares equality.

## Normalization policy

Applied per content field in this order (see `normalization.ts`):

1. Non-string input is rejected (a contract error, not an empty string).
2. Unicode **NFC** canonical composition.
3. Trim + collapse internal whitespace runs to a single ASCII space.
4. Case handling — **per field, never global**:
   - `simplified` (Chinese): **never** case-normalized; diacritics preserved.
   - `pinyin`: case-insensitive (folded to lower-case).
   - `meaning` (Vietnamese): case-insensitive (folded to lower-case).
5. Diacritics / tones — per field:
   - `pinyin`: **TONE_STRICT** by default (tone marks are significant); a caller may opt into
     `TONE_INSENSITIVE`, which strips tone diacritics while keeping base letters (and the `ü`
     umlaut, which is not a tone mark).
   - `meaning`: diacritics are significant and preserved.

## Modes and field bindings

| Mode          | Question field | Answer field |
| ------------- | -------------- | ------------ |
| `ZH_TO_VI`    | `simplified`   | `meaning`    |
| `VI_TO_ZH`    | `meaning`      | `simplified` |
| `ZH_TO_PINYIN`| `simplified`   | `pinyin`     |
| `PINYIN_TO_ZH`| `pinyin`       | `simplified` |

## Safety

Every contract failure is a typed error with a stable code and a safe message. The
learner-facing projection (`toLearnerView`/`toLearnerBatch`) removes the server-side answer key
and the source-field name before delivery.
