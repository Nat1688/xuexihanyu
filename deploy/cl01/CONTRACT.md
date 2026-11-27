# CL-01 — Student class enrollment

Status: IMPLEMENTATION, awaiting independent review. Base R3a `6f0ba0d` plus
the 27-file VI-01 reviewed source overlay (receipt in local evidence).

Owner approved one additive `class_invitations` table, 192-bit random codes,
SHA-256 storage, one current invitation per class, 24-hour expiry and transactional
rotation/revocation/join. No existing accounts, sessions or evidence are modified.

Teacher mutations require the existing session, TEACHER/ADMIN role, CSRF proof
and class ownership (ADMIN override retained). Exact-login enrollment accepts an
existing ACTIVE STUDENT only; no directory or public account lookup is added.
Student reads require STUDENT authentication and current enrollment. Assigned
lessons must be PUBLISHED under the existing leaf visibility contract. Class
assignments remain separate from global self-study; answering one exercise does
not imply assignment completion.

Invitation join and rotation lock the same class row and recheck the invitation
after locking. Revocation prevents future joins, without removing enrollments.
Codes are returned once on rotation; metadata reads never return the code/hash.
Invalid, expired, replaced and revoked codes have the same safe response.
The database enrollment unique constraint remains authoritative for duplicates.

Per authenticated actor, join permits 5 attempts/minute; invitation changes and
exact-login enrollment permit 20 attempts/minute. The bounded existing limiter
is per process, resets on restart and is not a distributed abuse-control claim.
All personal responses use `Cache-Control: no-store`.

Out of scope: assignment completion, enrollment removal, registration, account
creation, CMS, hierarchy visibility redesign, learning engine/evidence changes,
Mac persistent database writes and deployment. No commit/stage/push/merge.

Verification: invitation lifecycle, concurrent duplicate joins/rotation, role,
ownership and CSRF denial without writes, correct persisted linkage, published
assignment access and CP-05 evidence flow, Vietnamese desktop/mobile UI, full
API/frontend regression, lint/typecheck/build/secret/diff checks. PostgreSQL
integration target was separately approved: PostgreSQL 17 at
`127.0.0.1:55440/clp_cl01_test`, API3112/UI5199, loopback only. Credentials
are generated in memory; each test attempt creates a new retained cluster under
the approved `XueXiHanyu-Recovery/cl01-postgres17` directory.

## Migration and rollback

Migration 10 only creates the invitation table, unique indexes and class FK.
There is no backfill or destructive statement. Backup/fingerprint tooling must
recognize 10 migrations/19 application tables. M06 remains frozen at 9 and must
refuse provisioning after this upgrade. Before any persistent upgrade, obtain
separate approval and a verified backup with the matching pre-upgrade tooling.
Code rollback leaves the additive table intact; never drop it to roll back UI.
Restore only to a separately approved empty disposable target, using the tooling
version matching the backup. No automatic database downgrade or volume cleanup.

## Additive HTTP contract

| Method | Path                                                                 | Authorization / response                                                                             |
| ------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET    | `/teacher/classes/:classId/invitation`                               | Owner/ADMIN; `{state, expiresAt}` only                                                               |
| POST   | `/teacher/classes/:classId/invitation`                               | Owner/ADMIN + CSRF; `{code, expiresAt}`, replaces old code                                           |
| POST   | `/teacher/classes/:classId/invitation/revoke`                        | Owner/ADMIN + CSRF; `{ok:true}`                                                                      |
| POST   | `/teacher/classes/:classId/enrollments`                              | Owner/ADMIN + CSRF; exact `{login}`; existing ACTIVE STUDENT                                         |
| GET    | `/student/classes`                                                   | STUDENT; own `{classes:[{classId,title,term,enrolledAt}]}`                                           |
| POST   | `/student/classes/join`                                              | STUDENT + CSRF; `{code}` → `{ok:true}`                                                               |
| GET    | `/student/assignments`                                               | STUDENT; own published assignments under current enrollment                                          |
| GET    | `/student/classes/:classId/assignments`                              | Same, scoped to enrolled class; otherwise404                                                         |
| GET    | `/student/progress`                                                  | Own answer counts over30days in currently assigned published lessons                                 |
| POST   | `/student/classes/:classId/assignments/:assignmentId/exercises/next` | STUDENT + CSRF + current assignment/enrollment + published lesson; existing safe exercise projection |

Identifiers are public UUIDs. Request-body actor, parent, status and role fields
have no effect. Shared auth failures retain existing401/403 contracts. CL-01
errors use the existing `{error:{code,message}}` envelope: inaccessible class404,
invalid/expired/revoked/replaced code422, duplicate enrollment409, rate limit429
with Retry-After60. GETs never generate/recover evidence or invitations.

Assigned exercises reuse CP-05 session snapshots, submission idempotency and
explicit POST result recovery; learning engine semantics are unchanged. Result
Next remains the existing global self-study queue and is explicitly labeled.
Progress is evidence in an assigned-lesson scope, including self-study of the
same lesson; it is not assignment-specific completion, grading or mastery.
Removing publication hides the assignment from new starts; historical exercise
snapshots and evidence remain governed by CP-05, not retroactively rewritten.
