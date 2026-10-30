# CORE-01-FIX-01 — Unblock lesson authoring before assignment

Checkpoint: CORE-01 live-trial correction, Owner request 30/10/2026: cannot assign work.
Evidence: live teacher has one class and one enrolled student, but database has zero draft/published lessons and no assignments; no recent API errors. Current UI leaves teachers at course/unit lists after creation and assignment empty states provide no route to authoring.
Objective: make the existing course -> unit -> lesson -> publish -> assign flow actionable from an empty catalog.
In scope: explicit hierarchy/next-step labels, automatic navigation to a newly created course/unit, dashboard shortcut to authoring, assignment empty-state authoring link, return to class selection after publishing. Preserve existing hierarchy/API/authorization/assignment behavior.
Out of scope: seeded production lessons/accounts, credential discovery/reset, schema/migrations, new exercise rules, broad redesign.
Allowed modules: web curriculum and teacher forms/workspace, related tests and task/evidence docs.
Acceptance: empty catalog can be authored through GUI without hidden extra navigation; assignment empty states explain publication prerequisite and navigate to authoring; teacher can publish then assign to existing enrolled student in an isolated real-stack regression; no auto-generated live data.
Tests: targeted web tests, typecheck/lint/build, existing full unit regression and isolated browser E2E. Independent review before updating Web on Mac. Existing data and API remain unchanged; new encrypted backup before rollout; authenticated live acceptance remains Owner manual unless Owner provides a browser session.
Security/data migration: none. No commit/push/merge. Scope/contracts unchanged; existing APIs and hierarchy reused.

Owner clarification: assignment action was hard to find, not a reported API error. Add an explicit Giao bài entry and class picker using existing class list; put the existing form before the roster. No visual redesign or business rule changes.
