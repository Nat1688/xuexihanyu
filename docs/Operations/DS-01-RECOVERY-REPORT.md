# DS-01 — Demo Seed Recovery review report

Date: 2026-10-21 (Asia/Saigon). Status: implemented, verified, awaiting Owner
review; no commit, merge, push or deploy.

Base/Main: `0501f9cd97ba139cb5c7feb18d04000398003cc9`.
Branch: `codex/ds01-demo-seed-recovery`, isolated worktree.
WIP source: `7572b9e491641848eb2f8feba00fb1221fdeba3d`.
Main working tree remains clean. Preservation and Legacy were not modified.

## Recovery decisions

The six WIP files were restored individually, not merged wholesale. Package
scripts were added to the CP-05 package file rather than replacing it with the
old snapshot. The preservation AGENTS and PROJECT_STATE instructions were read.
Historical takeover/checkpoint documents remain unchanged.

The Legacy memory helper was inspected: no transaction/locking, JSON-cloned Date
values and non-Prisma missing-row semantics. Owner explicitly approved replacing
`demo:local:verify` with real PostgreSQL verification; Legacy keeps the original.

The old seed automatically chose clp_dev, reconciled accounts by login, matched
items by text and lacked a whole-seed transaction. DS-01 now requires an explicit
disposable target and confirmation, obtains an advisory lock inside the single
write transaction, refuses collisions and never rotates existing credentials or
rewrites learning items. All operations use the transaction client. Concurrent
seed calls serialize; exceptions roll back all writes. Public IDs remain random
UUIDv4; only internal IDs use deterministic fixture UUIDs.

Passwords are operator-supplied at runtime, hashed with existing scrypt helper,
never logged or committed. A different password on rerun does not change existing
accounts. Seeding creates curriculum/classes only, not learning history.

## Approved scope amendment

Real HTTP verification exposed an existing Student defect: queue selection can
choose a later lesson item while ExerciseService.generate(limit: 1) returns only
the first item, causing a false 404/no-content. Owner explicitly approved the
minimal fix: generate the lesson-sized batch and select the unchanged queue item.
Two regression tests cover due priority and advancing to the second item.
No domain ordering rule, HTTP contract, schema, migration or architecture changed.

The first test run also caught seed UUIDv5 public IDs violating the UUIDv4 API
contract. That seed implementation was corrected to use internal markers only.
Failed-run databases were renamed and preserved, never silently reset.

## Files for review

| File                                                        | Change                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| scripts/seed/db-seed-demo.cjs                               | Recovered/reworked target guard, ownership, credentials, atomic seed |
| scripts/seed/demo-fixtures.cjs                              | Recovered Chinese dataset; corrected identity/scope comments         |
| scripts/seed/demo-live-verify.cjs                           | Recovered entry point; real guarded PostgreSQL suite                 |
| apps/api/test/protected/demo-seed-guard.spec.ts             | Recovered guard/fixture tests and lint fixes                         |
| apps/api/test/types/demo-seed.d.ts                          | Correct complete module declarations                                 |
| docs/Operations/LOCAL-DEMO-SEED.md                          | Updated provisioning, credentials, usage, verification, recovery     |
| package.json                                                | Three demo commands; no dependency changes                           |
| apps/api/test/db/demo-seed.int-spec.ts                      | New real transaction/idempotency/scope/HTTP tests                    |
| apps/api/src/modules/student/application/student-service.ts | Owner-approved queue-item generation fix                             |
| apps/api/test/protected/student-service.spec.ts             | Two selection regressions                                            |
| PROJECT_STATE.md                                            | Current CP-05 baseline and DS-01 review state                        |
| docs/Operations/DS-01-RECOVERY-REPORT.md                    | This handoff                                                         |

## Verification evidence

| Command / gate                                                      | Result                                                                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| npm test -w @clp/api -- --runInBand student-service demo-seed-guard | PASS, 2 suites / 41 tests                                                                                                 |
| npm run demo:local:verify                                           | PASS, 1 suite / 11 PostgreSQL and real HTTP tests                                                                         |
| npm test                                                            | PASS, API 47 suites / 654 tests; web 1 suite / 2 tests                                                                    |
| npm run test:integration -w @clp/api -- --runInBand                 | PASS, 8 existing suites / 44 tests; DS-01 suite skipped here because it uses a separate target, verified separately above |
| npm run lint                                                        | PASS                                                                                                                      |
| npm run typecheck                                                   | PASS                                                                                                                      |
| npm run build                                                       | PASS, API and web                                                                                                         |
| npm run secret-scan                                                 | PASS, no findings                                                                                                         |
| npm run db:validate                                                 | PASS                                                                                                                      |
| node --check (three demo CJS files)                                 | PASS                                                                                                                      |
| npm run demo:local:dry-run with loopback port 1                     | PASS without DB connection or password                                                                                    |
| Prettier check on DS-01 changed files                               | PASS                                                                                                                      |
| git diff --check                                                    | PASS                                                                                                                      |

PostgreSQL version: 17.11. A new native disposable instance was provisioned under
the private local recovery directory, bound to 127.0.0.1:55433. It had no user
data. Only the nine existing migrations were deployed to newly created databases.
No schema/migration source changed. The demo database was clp_demo_ds01;
existing integration tests ran in a newly created clp_test in this same isolated
instance, not any pre-existing clp_test. No clp_dev/production connection occurred.
The DS-01 instance was stopped after verification; its data directory and both
failed-attempt databases remain available for review. No Vite server was started.

After pure seed verification: 7 users, 1 course, 2 units, 3 lessons, 13 items,
13 lesson links, 1 class, 2 enrollments, 6 assignments, zero evidence/mastery/
submissions. After the real Student answer: exactly 1 learning event, 1 mastery
projection and 1 submission. Rerunning seed preserved these counts.

Failure injection after identities, content and assignments left no partial
rows, credentials or roles. A failed rerun preserved the existing draft lesson.
Same-login/course collisions and role/content drift failed without overwrites.
An unrelated item with identical text under the demo author remained byte-for-
byte equivalent in its returned fields. Repeated/concurrent seed preserved IDs,
credential hashes, enrollment dates and assignment due dates.

HTTP evidence includes actual scrypt login, pending/disabled login refusal,
Student Today/Exercise/Answer, answer-key non-disclosure before submission,
evidence/mastery persistence, CSRF refusal, teacher roster/assignments/progress,
non-owner refusal and Student-to-Teacher role refusal.

## Remaining limitations and completion proposal

- Verification requires a fresh migrated database and leaves synthetic data for
  inspection. It intentionally does not reset a populated database. Its random
  password is not printed; create a separate fresh demo with an operator-supplied
  password for interactive use.
- URL validation/confirmation is a guardrail, not attestation of database
  provenance. Use a dedicated disposable instance and stop it after testing.
  Temporary loopback trust authentication is not a deployment configuration.
- Existing legacy/synthetic accounts are not auto-adopted. A collision requires
  review or a fresh instance, not deletion or forced overwrite.
- Fixture edits that change existing learning-item content are refused to protect
  history. Due dates are retained and can become old. No reset/password-rotation
  feature is included.
- The approved selection fix generates a full lesson batch; this is bounded by
  lesson size but costs more than generating one item. A dedicated single-item
  generation port would be a separate optimization, not required for this fix.
- Teacher remains API-only. No Teacher Web/AI/media implementation was added.
- Full-repository default Prettier is not newly certified; existing CRLF baseline
  remains. Changed files were formatted and checked without bulk normalization.

Owner should review the seed safety boundary and the explicitly approved Student
amendment, then authorize a local commit if accepted. No next checkpoint or
automatic integration is initiated.
