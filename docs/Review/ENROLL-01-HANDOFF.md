# ENROLL-01 — Self-registration and course admission

Status: implementation, independent review/fixes, targeted tests and full regression PASS. Deployment receipts recorded separately per release; do not infer live authenticated acceptance from local tests.

Owner policy: signup logs in immediately as STUDENT; student applies to course, reviewer selects class; ADMIN any, TEACHER own course + own class. Approval required for all students, including existing accounts. No production credential read/reset, and no automatic grants to old accounts. Old evidence/results retained.

Implemented: Vietnamese signup, catalog/apply/cancel/reapply/history; review/reject/approve+class placement; terminal decision history; atomic compare-and-set approval and membership upsert; unique live request. Server gates course lesson/items and student exercise issuance/resume/first answers. Previously persisted results/recovery remain readable. Manual roster/invitation membership alone is not a course grant. Registration uses current scrypt/session cookies, fixed STUDENT role, origin/fetch-metadata checks, per-email+peer and global budgets. No external email delivery/verification, payments, notifications or account administration.

Validation: targeted API42/Web3 tests PASS. Full API778 + Web60 =838 tests PASS; npm run typecheck/lint PASS; repository-wide format checks report 56 warnings in files byte-identical to deployed TOOLS01; changed files are formatted and no unrelated style rewrite is included; API/Web build PASS. All 11 PostgreSQL integration suites:74 PASS,0 skipped. Real Chrome en-US GUI acceptance:13 scenarios PASS, including migration10→11 preserving existing identities, real signup/autologin/reject/cancel/reapply/approve, invalid/cross-origin/duplicate signup, concurrent duplicate applications and competing decisions, cross-teacher/class refusals, ADMIN cross-owner approval, legacy student denial until approval, authoring/giving assignments/study/results, unsaved input preservation and CSRF/object/revision checks. Prior driver failures/evidence retained; selectors now name intended course/unit/lesson/account in a multi-course/multi-student fixture.

Independent review core_review: two MEDIUM findings fixed (shared proxy signup throttling; stale status after reject/reapply/cancel); re-review found no source blocker. Legacy exercise denial and preserved result regression added. Deployment review caught a HIGH authorization rollback issue; recovery now restores the old pair only before migration begins, and fails closed by stopping API/Web after that boundary (old API has no admission gates). Re-review recorded with release evidence.

Migration/config: migration11 adds CourseApplicationStatus/course_applications only, partial live unique index, decision consistency check, FKs/indexes. Migrations1–10 unchanged. Backup tool explicitly supports10/11 (CLP_EXPECTED_MIGRATIONS=11 after upgrade), rejects other versions. Schema/scanner/test allowlists reflect approved table. No new app runtime secrets/dependencies or Dockerfile/Tailscale change.

Limits: Local Trial bounded catalog/queue/history; email ownership verification is outside scope. Teacher authorization uses existing course author/class owner; delegation/co-teaching/revocation needs separate scope. Production Teacher/Student authenticated tests remain PENDING_OWNER_MANUAL_TEST without Owner credentials. No commit/push/merge.

Scope/contracts: YES — explicitly Owner-approved new admission requirement replaces unrestricted student published-content access. Wire identifiers/sessions/mastery rules unchanged; governed by ENROLL-01 task contract and ADR-006.

Files changed for ENROLL-01 relative to deployed TOOLS01:

- apps/api/src/app.module.ts
- apps/api/src/modules/admissions/admissions.controller.ts
- apps/api/src/modules/admissions/admissions.module.ts
- apps/api/src/modules/admissions/admissions.service.ts
- apps/api/src/modules/admissions/course-access.service.ts
- apps/api/src/modules/content/content.module.ts
- apps/api/src/modules/content/domain/content-read-policy.ts
- apps/api/src/modules/content/http/content.controller.ts
- apps/api/src/modules/identity/application/registration.service.ts
- apps/api/src/modules/identity/http/auth.controller.ts
- apps/api/src/modules/identity/identity.module.ts
- apps/api/src/modules/student/application/student-ports.ts
- apps/api/src/modules/student/application/student-service.ts
- apps/api/src/modules/student/infrastructure/prisma-student-content.reader.ts
- apps/api/src/modules/student/student.module.ts
- apps/api/test/db/classroom-schema.spec.ts
- apps/api/test/db/classroom.int-spec.ts
- apps/api/test/db/demo-seed.int-spec.ts
- apps/api/test/db/prisma-identity-schema.spec.ts
- apps/api/test/db/session-migration.spec.ts
- apps/api/test/protected/admissions.spec.ts
- apps/api/test/protected/content-authorization.e2e-spec.ts
- apps/api/test/protected/student-service.spec.ts
- apps/web/src/admissions/CourseAdmissions.tsx
- apps/web/src/admissions/api.ts
- apps/web/src/classrooms/StudentWorkspace.tsx
- apps/web/src/screens/LoginScreen.tsx
- apps/web/src/teacher/TeacherWorkspace.tsx
- apps/web/test/admissions.spec.tsx
- apps/web/test/core-realstack.cjs
- deploy/oci01b2/database.cjs
- docs/Architecture/ADR/ADR-006-course-admissions.md
- docs/Planning/ENROLL-01-TASK-CONTRACT.md
- docs/Review/ENROLL-01-HANDOFF.md
- prisma/migrations/20261030073000_enroll01_course_admissions/migration.sql
- prisma/schema.prisma
- scripts/db/db-test-validate.cjs
- scripts/secret-scan.cjs
