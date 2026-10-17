# CP-05 Student MVP Task Contract

**Status:** Accepted by Owner — Student MVP implementation may proceed only within this scope.

## Objective

Deliver the smallest useful authenticated student path:
`LOGIN → TODAY → CONTINUE → EXERCISE → RESULT → NEXT`.

## Allowed

- Student-only authenticated API/read model for Today/Continue using published lessons/content and CP-04 due mastery projections.
- Deterministic exercise presentation from CP-02, answer submission evaluated server-side, authoritative CP-03 event append and CP-04 projection refresh/recommendation.
- Immediate result with correct/incorrect plus safe deterministic feedback code; no hidden answer key before submit.
- Responsive accessible web screens for login, today/continue, exercise, result and next.
- Basic empty states when no published/due content exists.

## Security & integrity

- Student sees only own schedule/event-derived state and published content.
- Server owns selection, evaluation, event append and mastery update; client never chooses correctness/mastery.
- Submission idempotency/replay protection required; no duplicate event/mastery transition for same exercise attempt token.

## Forbidden

No teacher UI/classes/assignments, no analytics dashboard, no AI, no notification, no public content browsing, no media upload/storage, no social features, no CP-06 authorization relations.

## Acceptance

- E2E covers login → today → exercise → submit → result → next.
- Draft/unpublished content and other-user data blocked server-side.
- Duplicate submission does not double append events or mastery updates.
- Keyboard/mobile baseline and basic accessibility checks.
- Host migration/test/secret/CI gates pass.
