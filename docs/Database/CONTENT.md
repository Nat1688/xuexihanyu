# Content Domain (CP-01)

**Task:** CP-01 — Content domain (teacher-managed curriculum hierarchy + reusable Chinese-aware
learning items). **Status:** Accepted by Owner.

This document describes the **content persistence and domain boundary only**. It implements the
approved CP-01 slice and **nothing else**: the ordered hierarchy `courses → units → lessons`, a
reusable learning-item library with an explicit Chinese-aware `kind`, and a lesson↔item
association. Exercise generation/evaluation (CP-02), learning events (CP-03), mastery/review
(CP-04), media storage/upload, import/export, AI, analytics, public marketplace and
assignment/enrollment/student-progress are **not** present here.

## Scope

Implemented:

- Prisma models + one append-only migration for exactly five tables: `courses`, `units`,
  `lessons`, `learning_items`, `lesson_learning_items`.
- Domain contracts in `apps/api/src/modules/content/domain/`:
  - `visibility.ts` — `ContentVisibility` (`DRAFT`/`PUBLISHED`).
  - `learning-item-kind.ts` — `LearningItemKind`.
  - `ordering.ts` — position/slug/title/description validation + ownership predicate.
  - `hierarchy.ts` — shared authored node shape (course/unit/lesson).
  - `learning-item.ts` — the Chinese-field, per-kind required-field contract.
  - `content-read-policy.ts` — the server-side read visibility policy.
  - `content-authorization.ts` — the server-side mutation authorization policy.
  - `content-errors.ts` — typed, safe domain errors.
- Application port `ContentRepository` + `ContentService` use-cases.
- Infrastructure `PrismaContentRepository`.
- HTTP `ContentController` (routes guarded by `AuthGuard` + `RoleGuard`) + a narrow content
  exception filter/mapper (ADR-005).
- Unit tests (pure), an HTTP authorization e2e (isolated slice) and a live integration suite
  against `clp_test`.

Explicitly **not** implemented (forbidden by the contract): exercises/answers/evaluation, learning
events, mastery/review, media storage/upload provider, import/export, AI, analytics, public
marketplace, assignment/enrollment or student progress.

## Persistence model

| Prisma model           | Table                   | Key columns |
| ---------------------- | ----------------------- | ----------- |
| `Course`               | `courses`               | `id` (uuid PK), `public_id` (uuid, UNIQUE), `slug` (UNIQUE), `title`, `description`, `visibility`, `author_id` (uuid FK → users, ON DELETE RESTRICT), `position` (indexed), timestamps |
| `Unit`                 | `units`                 | `id` (uuid PK), `public_id` (uuid, UNIQUE), `course_id` (uuid FK → courses, ON DELETE CASCADE), `slug`, `title`, `description`, `visibility`, `position`, timestamps; UNIQUE `(course_id, slug)`, `(course_id, position)` |
| `Lesson`               | `lessons`               | `id` (uuid PK), `public_id` (uuid, UNIQUE), `unit_id` (uuid FK → units, ON DELETE CASCADE), `slug`, `title`, `description`, `visibility`, `position`, timestamps; UNIQUE `(unit_id, slug)`, `(unit_id, position)` |
| `LearningItem`         | `learning_items`        | `id` (uuid PK), `public_id` (uuid, UNIQUE), `kind`, `simplified`, `traditional`, `pinyin`, `meaning`, `hsk_level`, `reference` (JSONB), `author_id` (uuid FK → users, ON DELETE RESTRICT), timestamps; index on `kind` |
| `LessonLearningItem`   | `lesson_learning_items` | composite PK `(lesson_id, learning_item_id)`, `position` (UNIQUE per lesson), `created_at`; FKs → lessons / learning_items (ON DELETE CASCADE) |

Enums:

- `ContentVisibility` = `DRAFT` | `PUBLISHED`
- `LearningItemKind` = `VOCABULARY` | `CHARACTER` | `GRAMMAR` | `EXAMPLE` | `MEDIA_REFERENCE`

## Chinese-item contract by kind

A Chinese learning item is **never** collapsed into a generic term/definition; the `kind` selects
which Chinese-specific fields are required:

| kind              | simplified | traditional | pinyin | meaning | reference |
| ----------------- | ---------- | ----------- | ------ | ------- | --------- |
| `VOCABULARY`      | required   | optional    | req.   | req.    | optional  |
| `CHARACTER`       | required   | optional    | req.   | req.    | optional  |
| `GRAMMAR`         | required   | optional    | opt.   | req.    | optional  |
| `EXAMPLE`         | required   | optional    | opt.   | req.    | optional  |
| `MEDIA_REFERENCE` | optional   | optional    | opt.   | opt.    | REQUIRED  |

`hsk_level`, when present, is an integer in `1..9`. A `MEDIA_REFERENCE` item stores **no media** —
only a structured `reference` payload pointing elsewhere.

## Authorization & read policy

- **Authoring mutations require TEACHER/ADMIN, enforced server-side.** Routes carry
  `@RequireRoles('TEACHER','ADMIN')` behind `AuthGuard` + `RoleGuard`; the authoritative
  per-object decision is made in `ContentService` (a TEACHER may mutate only their OWN content; an
  ADMIN any). Refusals are a uniform 403 (no information leak).
- **Students read only PUBLISHED content.** `content-read-policy.ts` filters every student-facing
  read server-side; DRAFT content is never surfaced to students. UI hiding is never authorization.

## Authorization matrix (content mutations)

| Caller    | create | mutate own | mutate other |
| --------- | ------ | ---------- | ------------ |
| ADMIN     | yes    | yes        | yes          |
| TEACHER   | yes    | yes        | no (403)     |
| STUDENT   | no     | no         | no           |
| anonymous | no     | no         | no           |

## Migration

`prisma/migrations/20261016030000_content_domain/` — additive DDL (2 enums, 5 tables, indexes,
FKs). Generated deterministically with `prisma migrate diff … --script` (no shadow database) and
never edited once applied.
