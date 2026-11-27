# CL-01 — Implementation and verification report

Status: READY FOR INDEPENDENT REVIEW, not committed/deployed.
Branch `codex/cl01-class-enrollment`, parent R3a
`6f0ba0d39c68a07137aef94c06e2a25c50e33d92`.
Includes the approved27-file VI-01 dependency overlay. FILES.json and the separate
VI-01 dependency receipt distinguish that overlay from CL-01 changes.

## Implemented

- Student workspace: Lớp của tôi, Tham gia lớp, Bài được giao, Tiến độ; independent
  self-study has a separate entry and explanatory labels.
- Teacher invitation generation/regeneration, one-time code display,24-hour
  expiry, revocation, exact-login enrollment of an existing ACTIVE STUDENT and
  refreshed real roster. Navigation is disabled during enrollment mutation.
- Student invitation join and own enrolled classes/published assignments. New
  exercise issuance checks current membership and assignment before using the
  existing CP-05 persisted exercise/answer/result/recovery path.
- Progress is real committed answer evidence in currently assigned published
  lessons over30days, including self-study of those same lessons. No fabricated
  completion, grade or mastery is created by enrollment/progress GETs.
- Additive migration10: only class_invitations.192-bit random code, SHA-256
  digest, one current row/class, expiry/revocation. No plaintext invitation is
  stored in PostgreSQL or browser storage. Join/revoke/rotate share a class row
  lock and one transaction/connection. Join rechecks the digest/revocation/expiry
  after locking, using the database clock to account for lock waits.
- Existing authentication, role guards, CSRF mechanism, Teacher ownership/ADMIN
  policy and safe public-ID projections are reused. All new personal responses
  are no-store. Invalid invitation states return a uniform safe422.
- Minimal roster CSS correction: a positioned scrolling wrapper keeps absolute
  screen-reader labels within the roster, avoiding document overflow on mobile.

## Executed evidence

| Gate                                                 | Result                                      |
| ---------------------------------------------------- | ------------------------------------------- |
| Targeted API `classroom\|student-service`            | PASS53/53                                   |
| Full API regression                                  | PASS753/753,52suites                        |
| Frontend tests                                       | PASS46/46,5suites                           |
| PostgreSQL17.11 + real HTTP controller regression    | PASS8/8, no skipped tests                   |
| Real Chrome + real Nest/Vite/PostgreSQL              | PASS, final run-10                          |
| Desktop1440×1000 / mobile390×844                     | PASS Teacher/Student;8screenshots           |
| Lint, typecheck                                      | PASS both workspaces                        |
| Production API/Web build + catalog validation        | PASS; PREVIEW_ONLY                          |
| Backup/context/runtime packaging unit tests          | PASS70/70                                   |
| Secret/artifact scan                                 | PASS                                        |
| Changed-file formatting, syntax and Git diff checks  | See final quality receipt in review package |
| Mac ARM64 build, persistent migration, HTTPS rollout | NOT_RUN / requires separate Owner approval  |

Commands executed from the CL-01 worktree:

```powershell
node node_modules/prisma/build/index.js generate
npm run test -w @clp/api -- --runInBand --testPathPatterns="classroom|student-service"
npm run test -w @clp/api -- --runInBand
npm run test -w @clp/web -- --runInBand
npm run lint
npm run typecheck
npm run build
npm run secret-scan
node --test deploy/oci01b2/database.test.cjs deploy/oci01b2/context.test.cjs deploy/oci01b2/packaging.test.cjs
# Existing Playwright runtime supplied through NODE_PATH; no install performed.
$env:CL01_DISPOSABLE_APPROVAL='APPROVED_55440_3112_5199'
$env:CL01_RUN_ID='10'
node deploy/cl01/realstack.cjs
node deploy/cl01/verify-preservation.cjs
git diff --check
git diff --cached --check
```

### PostgreSQL/HTTP regression

The database suite uses real PostgreSQL and HTTP controllers/guards, with an
explicitly synthetic authentication adapter. It checks missing/invalid CSRF,
role inversion, foreign ownership and unchanged row counts after denial;
invitation replacement/expiry/revocation; same-code concurrent joins yielding
one membership and one409; ADMIN exact-login enrollment/duplicates; controlled
lock interleaving with revocation; rollback after an injected post-insert error;
rejection of disabled/non-STUDENT accounts; current-enrollment and published-only
assignment reads with no internal IDs. GET progress leaves learning rows intact.

The separate real-browser test uses the actual identity service, random runtime
passwords hashed with ScryptPasswordHasher, actual cookies, API, frontend and
database, without provider overrides or intercepted/mock API responses. It
verifies create/reload class, invitation/join/duplicate, loaded roster, published
assignment through Teacher UI, Student exercise/answer, PostgreSQL linkage and
projection, reload with the persisted session ID and POST recovery, Teacher
progress, real-cookie CSRF/RBAC denial, Teacher exact-login enrollment, mobile
width assertions, Vietnamese despite en-US locale and logout/reload.

Final synthetic counts: users9, enrollments4, invitations2, submissions1,
learning events1, mastery projections1. These include isolated database-suite
fixtures and three browser accounts; they are not pilot/user data.

Target:127.0.0.1:55440/clp_cl01_test, API3112/UI5199, loopback only. Identity,
PostgreSQL major, exact data directory and empty schema were checked before
applying all10migrations. Final run-10 and all earlier attempts are retained,
stopped, under the approved private recovery directory. No persistent Mac,
LP-01, clp_dev or production database was used. API/UI/test cluster are stopped.

### Failures observed and corrected

Earlier attempts are retained as failed evidence, not relabeled PASS: duplicate
lesson positions in a new fixture; a harness test-count mismatch; a non-unique
Teacher success-text selector; Playwright request-client Secure-cookie handling
on HTTP loopback; and actual roster document overflow on mobile. The final
browser run uses browser fetch for cookie-bound security checks and the CSS
regression assertion remains enforced. The Docker context test additionally
needed the approved10-migration expectation and LF/CRLF normalization in its
Dockerfile string assertion. Dockerfile content/security boundaries are unchanged.

## Security / remaining limits

- Invitation codes are bearer access to join a class: share privately. Revocation
  stops future joins and intentionally does not remove already enrolled students.
- The reused bounded rate limiter is per API process and lost on restart. A
  multi-instance or public rollout requires a separate abuse-control decision.
- Assignment evidence is lesson-scoped and may include self-study of the same
  lesson. No assignment-completion state, inbox notifications, enrollment removal
  or bulk assignment is implemented. Existing Teacher limits remain50classes/
  200roster entries. Existing leaf visibility semantics are preserved; hierarchical
  visibility inheritance remains a separate product-contract decision.
- The legacy public-ID roster endpoint is unchanged; the new exact-login path
  explicitly filters ACTIVE STUDENT eligibility. No global student directory or
  account creation is introduced.
- HTTPS/ARM64/Mac upgrade/backup-restore execution were not run in this checkpoint.
  Chrome uses its Secure-cookie exception for loopback HTTP in NODE_ENV=test;
  this is not a substitute for Mac HTTPS acceptance. No cookie policy was weakened.
- M06 remains byte-identical and its nine-migration guard must refuse after
  CL-01. Existing backup tooling must be kept for pre-upgrade backups; new tooling
  requires schemaVersion10 and19counted tables before restore, including the
  migration ledger. No automatic DB downgrade, seed or runtime provisioning.

Main/R3a/English worktrees remain clean at their approved HEADs. Original M06 and
VI-01 files match their review manifests byte-for-byte and original ZIP hashes.
The16-file VI WIP is retained, with individual fingerprints in preservation
evidence. Preservation branch/recovery artifacts remain intact. No stage,
commit, push, merge, deployment or publication was performed.
