# CP-01 Content Domain Task Contract

**Status:** Accepted by Owner — content foundation implementation may proceed only within this scope.

## Objective

Create teacher-managed curriculum hierarchy and reusable Chinese-aware learning-item contracts.

## Allowed schema

- `courses`, `units`, `lessons` with ordered hierarchy and author/visibility metadata.
- Reusable learning items with explicit kind: vocabulary, character, grammar, example/sentence, media reference.
- Chinese-aware fields: simplified, traditional, pinyin, meaning/translation, HSK metadata and structured references where relevant.
- Lesson-to-item association with ordering.

## Constraints

- Do not collapse Chinese content into generic term/definition only.
- All authoring mutations require TEACHER/ADMIN server-side authorization.
- Deterministic read retrieval only; no exercise generation/evaluation here.

## Forbidden

No CP-02 exercise instance/answer/evaluation, CP-03 learning event, CP-04 mastery/review, media storage/upload provider, import/export, AI, analytics, public marketplace, assignment/enrollment or student progress.

## Acceptance

- Hierarchy order/uniqueness/ownership validation tests.
- Chinese-specific fields and item kinds validated by contracts.
- Teacher/admin authorization matrix for content mutations; students read only according to published visibility.
- Migration/test/secret gates pass with no out-of-scope table.
