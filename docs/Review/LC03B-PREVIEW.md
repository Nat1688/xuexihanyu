# LC-03B — Lesson 01 preview contract and operation

Baseline: eb5927861f0dc6caa6d469cb4e663e70971265bc. Option P only: reader + stateless formative P1/P3/P5. No schema, migration, dependency, existing mode semantics, legacy sessions, learning events or mastery changes.

## Preview gate

Default off: optional server config `LC03B_PREVIEW_ENABLED` must equal literal `true`. Gate additionally requires NODE_ENV=development, POSTGRES_HOST=127.0.0.1, POSTGRES_PORT=55438, POSTGRES_DB=clp_lc03b_test, API_PORT=3108, SPA_ORIGIN=http://127.0.0.1:5198. Startup verifies the actual Prisma connection reports the same database/host/port. Any mismatch disables this catalog; production/test environments always deny it. No public/VITE flag enables it.

These exact coordinates are the Owner-approved disposable preview environment, not a reusable production configuration. Broadening the target requires review. The Main or LP-01 environment must not be repointed. This feature does not provision a database or start services by itself.

No PUBLISHED code path exists. The schema accepts only PREVIEW_ONLY with both specialistSignoff=false and ownerPublication=false. Build (`npm run build -w @clp/api`) compiles the real server catalog and checks its pinned SHA-256/structure/references; runtime validates it again. There is no fixture fallback. A future publication implementation needs separate Owner approval and specialist signatures.

## API mapping

Both routes reuse AuthGuard then RoleGuard requiring STUDENT; teacher/admin without STUDENT are denied. Cookie authentication and CSRF use the existing identity mechanisms.

| Method | Route                                                   | Input / output                                                                                                                                                     |
| ------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/student/learning-prototypes/lesson-01`                | instructionLanguage=vi/en, optional revision; returns pinned revision, localized objectives/blocks, shared Mandarin concepts/dialogue and practice prompts/options |
| POST   | `/student/learning-prototypes/lesson-01/practice-check` | exact instructionLanguage, revision, taskId, answer; existing CSRF header/cookie; returns boolean correct and localized formative feedback                         |

Unknown fields/language or malformed answers return 400. Answer length <=200 Unicode code points; body <=8KiB at service boundary. Missing/disabled/retired revision or task returns 404. Authentication=401, role/CSRF=403. New errors follow `{error:{code,message}}`; no expected answer in errors. Responses no-store. No session/actor/mastery/completion fields are returned for practice.

P1 fixed options 学生/你好/再见; P3 expects 是; P5 expects dictionary nǐ hǎo. This document and catalog policies are server/reviewer material. Learner GET excludes expected values, private rule fields, key hashes and formal A/B/teacher keys. Worked examples intentionally contain correct target phrases. POST can reveal corrective examples after a practice attempt. No formal exam security claim.

Normalization reuses existing simplified/Pinyin helpers. Pinyin is tone-strict and case/NFC/whitespace normalized. Numeric spelling, surface ní hǎo and unmarked Pinyin are not dictionary-task answers. EN instructions never pass through VI_TO_ZH or reinterpret its meaning. MCQ-ORDER remains untouched.

## Revision / editorial record

New derivative revision `lc03b-preview-1` condenses LC-03A draft-1 into five teaching blocks per track, eleven vocabulary entries, seven dialogue lines and three web self-checks. Reworded concise prompts/notices/feedback are visible in catalog-data.ts. This is a new revision because text/delivery changed, not a claim that the previous sign-off covers it. Neither this derivative nor the source has a named specialist signature.

Manifest is `CONTENT_MANIFEST` in server `catalog.ts`; exact digest binds JSON serialization of rawCatalog. Changing content requires a new revision and manifest review. Registry can retain reviewed prior revisions; requests pin an exact policy. Only one real revision currently ships. Unknown/retired revisions fail safely; no fallback. UI reload resets unsaved local state and loads current content. No CP-05 recovery claim for stateless practice.

Teacher-only keys, A/B formal checks and rubric remain outside the runtime catalog/frontend. The LC-03A editorial artifacts are not imported into the application. UI locale remains the existing shell language; instructionLanguage changes teaching/feedback only. Track switch clears local answers/feedback and transfers no credit. In-flight navigation cannot let an old response replace a new view.

## Development verification and rollback

`apps/web/test/lc03b-realstack.cjs <external-evidence-directory>` requires runtime LC03B_DATABASE_URL matching the approved target and already-applied reviewed migrations. It boots actual Nest/Prisma, creates synthetic users with random runtime passwords, starts its own Vite and Chromium, and stops its own API/UI. Run only under the approved isolated provisioning workflow. No credentials/screenshots of login forms are persisted.

HTTP tests cover authentication/roles/CSRF and strict policies. Browser tests use real API responses; test-only service delays/unavailability exercise loading and race handling, not fabricated content. PostgreSQL row counts and instrumented learning delegates must report zero learning mutations. Wider CP-05/MCQ unit suites remain regression gates.

Disable the flag to withdraw preview; legacy routes remain. Roll back API/UI release together and preserve revision/review artifacts. No DB rollback or event deletion is needed. No CMS, formal A/B grading, listening/speaking assessment, teacher progress or completion is supplied.

## Publication conditions still missing

Mandarin and VI/EN specialist review of this exact revision; assessment/accessibility review; resolved editorial findings; Owner publication approval; separate production-safe publication/release design. PREVIEW authorization does not satisfy these conditions.
