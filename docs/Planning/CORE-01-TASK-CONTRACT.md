# CORE-01 — Core product completion

Checkpoint: Owner source/demo acceptance; no commit or deployment.
Authorization: Owner master directive supplied 30/10/2026.
Base: CL-01 22bf765, including VI-01; main was older.

Objective: usable Vietnamese teacher authoring -> publish -> assignment -> student reading/practice -> teacher evidence.
Scope: existing content hierarchy, Chinese learning items, draft editing, ordered lesson composition, preview/publish, existing class enrollment/assignment, responsive workspaces.
Out of scope: AI, new grading/mastery rules, uploads/media storage, deployment/network changes, live database writes, commits/push/merge.
Contracts: AGENTS.md, ADR-001/003/004/005, CP-01 through CP-06, CL-01. Owner directive authorizes additive content editing/read APIs and UI; existing contracts stay intact.
Architecture: modular monolith, interface -> application -> repository. Reuse existing schema; no migration. All writes retain role/ownership + CSRF. Removed lesson associations never delete learning items/events. New composition versions use new item identifiers so previous source/evidence is preserved.
Allowed modules: content application/HTTP/repository, web curriculum and teacher/student workspaces, their tests and acceptance docs.
Acceptance: create real course/unit/lesson; persist draft; edit/order/remove content; preview; publish; read published assigned lesson; use existing exercise/submission/recovery; teacher sees existing evidence; vi-VN and Asia/Ho_Chi_Minh; desktop/mobile 390x844.
Tests: targeted authoring service/HTTP and React tests; format/lint/typecheck/build; full unit regression; isolated real-stack browser flow and screenshots when local runtime is available. No PASS claims without execution.
Privacy/migration: no new schema, no real student fixtures; no production or Local Trial access.

Owner amendment (30/10/2026): lesson completion means every current exercisable item has at least one correct answer. Derived from existing all-time learner+lesson evidence, includes self-study, never changes mastery rules. Zero exercise items is incomplete. Changed items receive new IDs while unchanged identities/evidence are preserved. Additive teacher overview/class metadata and student result-history reads are in scope; no schema change.

Composition concurrency: read whole lesson under RepeatableRead; new save API requires a revision, rechecked inside the locked atomic write. Per-account local reading pointers are reauthorized against current assignments before restore.
