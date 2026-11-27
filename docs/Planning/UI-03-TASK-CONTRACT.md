# UI-03 — Ink interface

Owner selected visual concept03: ink navy, cool white, restrained typography and spacious layout. Base b191d162c4f965d9abf9a3a89a62cf373e9188d7. Worktree codex/ui03-ink-interface; preserve the original checkout and all protected worktrees.

Scope: shared visual tokens, login presentation, Teacher theme, Student sidebar/content shell. Reuse existing navigation/actions and real API data. All current course admission, class joining, assignment, exercise, result recovery and logout flows remain available. Never populate sample lesson cards, metrics or achievements from the illustration.

Out of scope: API/business rules, schema/migrations, dependencies, credentials, preview publication, changed authorization or persistence. No commit/push/Main merge. Web-only homelab update under Owner request, after tests and staged image checks; retain previous Web for rollback and leave API/database unchanged.

Acceptance: Vietnamese-first, conceptual palette/typography03, no horizontal overflow at390/768/1440px; keyboard focus/44px actions and busy/error states remain usable. Frontend regression, existing Teacher interaction harness, additional Student/login browser interaction coverage, lint/typecheck/build/changed-file format/secret and diff checks. Full API suite before handoff as repository policy; no database integration against live data. Browser fixtures explicitly synthetic and not live authorization evidence.

Rollback: previous Web image and exact existing Compose settings; no migration or database rollback. Freeze source diff and static-asset manifest before upload. Owner functional UAT must be repeated for the changed UI.
