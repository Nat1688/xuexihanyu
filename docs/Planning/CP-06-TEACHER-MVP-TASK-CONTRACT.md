# CP-06 Teacher MVP Task Contract

**Status:** Accepted by Owner — Teacher MVP implementation may proceed only within this scope.

## Scope

- Classes owned by a TEACHER/ADMIN; explicit student enrollment.
- Teacher-owned assignments referencing existing published course/unit/lesson content (no content duplication).
- Teacher class list, roster and student detail views limited to enrolled students.
- Evidence-backed progress summaries from CP-03 events + CP-04 mastery projections; weak items show rule/version/window/evidence counts.
- Private teacher notes with explicit teacher/class/student ownership and bounded text.

## Authorization & privacy

- Server-side object-level checks on every class/enrollment/assignment/progress/note read/write.
- TEACHER cannot access another teacher's class/student evidence; STUDENT cannot query teacher views.
- ADMIN has bounded operational visibility according to existing role policy.
- Progress is informational, not grading/proctoring; API/UI must label evidence window/rule version.

## Forbidden

No AI summary/recommendation, no high-stakes grade, no global student search, no notification, no public class/content marketplace, no exercise/event/mastery mutation, no Teacher role mutation UI.

## Acceptance

- Cross-teacher/cross-class negative authorization tests.
- Enrollment/assignment uniqueness and ownership validation.
- Progress/weak-item evidence traces to source windows/rule version.
- Teacher notes privacy/length tests.
- Host migration/test/secret/CI gates pass.
