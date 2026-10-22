# XueXiHanyu project state — TW-01 independent review

Current baseline: local Main `0964b33b6771166b972209effda95e0c80e44ab0`.
CP-05 and DS-01 are integrated locally; no push/deployment is implied.
TW-01 is uncommitted on `codex/tw01-teacher-web-mvp` in a separate worktree.
Main, preservation branch and Legacy Sandbox are outside this task's writes.

TW-01 adds a React Teacher workspace using the existing CP-06 Teacher and
CP-01 read-only Content APIs: owned classes, create class, roster, per-student
assignments/progress/evidence, and published lesson assignment. No backend,
schema, migration, dependency, demo seed or AI changes. Existing session/CSRF
client is reused; dual-role accounts may switch workspaces. Teacher data is
memory-only. See `docs/Review/TW-01-REVIEW.md` for mapping, tests and API gaps.

Teacher enrollment search, class-wide assignment lists/completion status,
mastery rule/version and weak-item labels are absent from the current API.
TW-01 does not invent those fields. Notes/enrollment APIs exist but their UI
is deferred; no backend expansion is authorized. Owner review is required
before any commit, merge, push or next checkpoint.

## Historical DS-01 review snapshot (unchanged below)

Baseline: local Main `0501f9cd97ba139cb5c7feb18d04000398003cc9`.
DS-01 branch: `codex/ds01-demo-seed-recovery`, separate worktree, uncommitted.
This current-state document does not rewrite historical checkpoint evidence.
The earlier Phase 2A state remains at preservation commit
`7572b9e491641848eb2f8feba00fb1221fdeba3d`.

## Accepted implementation baseline

CP-01 content, CP-02 exercises, CP-03 append-oriented evidence, CP-04 derived
mastery, CP-05 Student API/SPA and CP-06 Teacher API are implemented. Teacher Web
is not implemented. AI production work remains closed until separately approved.

CP-05 integrity fixes are locally integrated in Main through commits `8f3520a`
and `0501f9c`: one answer per exercise session, semantic event conflict handling,
CSRF-protected POST result recovery, read-only GET, browser session resume,
late-evidence refold and actor advisory-lock transaction for mastery. Prior
verified evidence: 635 API tests, 2 frontend tests, 44 PostgreSQL tests; lint,
typecheck, build and secret scan passed on the accepted baseline.

Residual CP-05 limitations: client-triggered recovery; conservative GET result
status; full actor evidence refold cost; migration preflight required before any
real-data deployment. No migration was applied to a user database during DS-01.

## DS-01 scope and recovery

Restore only six demo WIP files and three package scripts from preservation;
compare with CP-05 instead of merging the preservation branch. Main and Legacy
remain unchanged. Preserve takeover documentation and old incomplete memory
harness in their historical locations. Owner approved using real PostgreSQL
verification instead of importing the memory harness.

DS-01 changes are limited to demo scripts, fixtures, tests, declarations, package
commands and current demo/state documentation. Owner additionally approved a
minimal Student selection fix after real HTTP verification exposed an existing
404: the queue-selected item may not be first in lesson order, but CP-02 was
asked to generate only one item. The batch now covers the lesson, preserving
queue order and selecting the requested item. Two pure regression tests cover
due-item priority and advancing to the second item. No schema, migration,
application architecture, Teacher Web or AI changes. Seed uses explicit disposable target,
one transaction, scoped internal IDs, random public IDs, collision refusal and
runtime-only passwords. See `docs/Operations/LOCAL-DEMO-SEED.md` for operation.

## Review status

DS-01 implementation and verification completed on 2026-10-21; awaiting Owner
review before any commit or merge. Current working-tree evidence: 654 API tests,
2 frontend tests, 11 DS-01 PostgreSQL/HTTP tests, 44 existing PostgreSQL tests;
lint, typecheck, build, secret scan and Prisma validation passed. Changed-file
Prettier passed. Full repository formatting has a known Windows CRLF baseline
and was not normalized or certified by DS-01. See
`docs/Operations/DS-01-RECOVERY-REPORT.md` for commands, scope and limitations.
Preservation branch and private recovery artifacts must be retained.
