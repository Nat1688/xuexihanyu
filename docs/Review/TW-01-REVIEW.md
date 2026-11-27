# TW-01 — Teacher Web MVP / independent review

## Task contract and boundary

Owner authorized TW-01 from `0964b33b6771166b972209effda95e0c80e44ab0`.
Branch: `codex/tw01-teacher-web-mvp`; isolated worktree. Do not commit, merge,
push or deploy before independent review. Main and Legacy are untouched.

Objective: usable Teacher navigation and existing-API classroom workflow.
Allowed modules: `apps/web` production UI/client/tests/config, this review report
and current-state documentation. Governing contracts: AGENTS.md, ADR-003/004/005,
CP-06 Teacher task contract and the actual Teacher/Content HTTP projections.
Architecture remains React/Vite -> NestJS application API -> repositories.
No direct persistence access, backend production edits, migration, dependencies,
Teacher role management, AI, content authoring or demo seed changes.

Acceptance: role-aware entry, owned class dashboard, roster and learner record,
published lesson assignment, safe error/loading/empty states, responsive layout,
CSRF mutations, automated interactions, existing backend authorization tests,
full regression/lint/typecheck/build/secret/diff gates and a full review package.

## Implemented screens

1. Overview: owned classes, bounded class/enrollment counts, refresh, create
   class with title/optional term. Counts are not cross-class unique learners.
2. Class: roster, enrollment dates and access to individual learner records.
3. Learner: assignments/due dates, 30-day evidence window, attempts/correct/
   accuracy, practice signals and recent activity. No grade or completion claim.
4. Assignment form: existing course -> unit -> published lesson selectors,
   optional browser-local due time converted to ISO UTC, single-student POST.
5. Existing login/session entry is reused. Teacher/ADMIN goes to Teacher;
   Student-only goes to Today. Dual-role users can switch; Student exercise
   resume is preserved. Role hiding is UX, not authorization.

GETs use credentialed requests with `cache: no-store`; this is a client setting,
not a replacement for server response cache headers. POSTs reuse the existing
clp_csrf cookie/X-CSRF-Token contract. No secrets or Teacher records are written
to browser storage. No answer-key endpoint is called. Public UUIDs are routing
values, not displayed identifiers. React escapes API text; raw API errors are
not displayed. Read failures replace stale data; unmounted reads/mutations do
not update another student's view. Mutations are not automatically retried;
double-clicks are locked while pending. A failed logout is not shown as success.

## Exact existing Teacher API inventory

All `/teacher` routes: AuthGuard + RoleGuard admit TEACHER/ADMIN. Actor comes
from session, never request body. Class operations authorize owner or bounded
ADMIN; class list is **owned only**, including ADMIN. Student reads/writes
require enrollment. Missing/foreign class/student yields safe 404. Notes are
author-only, not shared with ADMIN. POSTs verify the session-bound CSRF proof.

| Method / path (prefix `/teacher`)                          | Input                              | Response                      | TW-01 use                                          |
| ---------------------------------------------------------- | ---------------------------------- | ----------------------------- | -------------------------------------------------- |
| GET `/classes`                                             | none                               | `{classes: Class[]}`          | Overview                                           |
| POST `/classes`                                            | `{title, term?}`                   | Class, 201                    | Create class                                       |
| GET `/classes/:classId/roster`                             | public class UUID                  | `{students: Roster[]}`        | Roster                                             |
| POST `/classes/:classId/roster`                            | `{studentId}`                      | Roster, 201                   | Existing API; UI deferred                          |
| POST `/classes/:classId/assignments`                       | `{studentId, lessonId, dueAt?}`    | Assignment, 201               | Assign published lesson                            |
| GET `/classes/:classId/students/:studentId/assignments`    | public UUIDs                       | `{assignments: Assignment[]}` | Available; detail already contains list            |
| GET `/classes/:classId/students/:studentId/progress?days=` | optional days, default 30/max 366  | Progress                      | Available; detail already contains 30-day progress |
| GET `/classes/:classId/students/:studentId`                | public UUIDs                       | Detail                        | Learner record                                     |
| GET `/classes/:classId/students/:studentId/notes`          | public UUIDs                       | `{notes: Note[]}`             | Existing API; UI deferred                          |
| POST `/classes/:classId/students/:studentId/notes`         | `{title?, body}`; student from URL | Note, 201                     | Existing API; UI deferred                          |

HTTP projection DTOs (all dates ISO strings, public IDs only):

- Class: `classId,title,term|null,enrolled,createdAt` (title max 120, term max 40).
- Roster: `studentId,login,displayName|null,enrolledAt`.
- Assignment: `assignmentId,studentId,lessonId,lessonTitle,dueAt|null,createdAt`.
- Progress: `studentId,classId,evidence,weakItems`.
  Evidence: `window:{from,to,days},totalEvents,attempts,correct,incorrect,
accuracy|null,assignedLessons,itemsWithEvidence`.
  Weak item: `itemId,state,correct,incorrect,dueAt|null`.
- Detail: `studentId,login,displayName|null,assignments,progress,recentEvidence`.
  Event: `eventId,type,occurredAt,accepted:boolean|null,lessonId|null,itemId|null`.
- Note: `noteId,studentId,title|null,body,createdAt,updatedAt` (body 1–2000;
  optional title max 120). URL student takes precedence over body student.

Auxiliary APIs used:

- Identity: `/auth/me`, `/auth/login`, `/auth/logout` (existing client).
- GET `/content/courses`, `/content/courses/:publicId/units`,
  `/content/units/:publicId/lessons`: authenticated, visibility-filtered arrays
  of `publicId,slug,title,description|null,visibility,position`. Only lesson
  `visibility=PUBLISHED` is selectable; server revalidates publication at POST.
  TW-01 calls **no Content mutations or item/answer payload routes**.

Error envelope: `{error:{code,message,requestId?}}`. UI handles 400, 401, 403,
404, 409, 422, server failures and transport interruption with safe messages.
No ownership or publication decision is delegated to the browser.

## Development and reproducible verification

Use the existing configured API and session topology per ADR-003. For any
write-enabled demo, use only an Owner-approved disposable database. This task
does not start or seed a database, read .env credentials, or run migrations.

From this worktree, with existing dependencies installed:

```powershell
# Set to the approved local API origin, not a database URL.
$env:VITE_API_BASE_URL = Read-Host 'Approved local API origin'
npm run dev -w @clp/web -- --host 127.0.0.1
```

Use an existing TEACHER account via the login screen (never hard-coded frontend
credentials). Keep API CORS/cookie hostname configuration aligned with the SPA.
The real development app has no fake API or mock mode.

Commands for review:

```text
npm run test -w @clp/web
npm run test -w @clp/api -- --runInBand teacher-authorization.e2e-spec.ts
npm test
npm run lint
npm run typecheck
npm run build
npm run secret-scan
git diff --check
git diff --cached --check
```

Browser harness (uses an existing Playwright runtime; not a new app dependency):

```powershell
# If Playwright is not on normal resolution paths, point NODE_PATH to an
# already installed runtime that provides it; do not install automatically.
$env:TW01_BROWSER_CHANNEL = 'chrome' # existing Chrome, otherwise installed Chromium
node apps/web/test/teacher-browser.cjs <absolute-external-evidence-directory>
```

The harness starts its own loopback Vite process on 5187 and closes only that
process/context. All API requests are intercepted within the isolated test
browser, with synthetic non-user data; unexpected external requests are blocked.
It never calls a real backend or database. Screenshots carry an explicit
SYNTHETIC BROWSER TEST FIXTURE watermark. These prove UI behavior, **not** real
PostgreSQL integration. Existing real Nest guard/controller tests independently
cover server RBAC, CSRF, object ownership and projection safety.

## Verification results

Final verification on 2026-10-21, on this uncommitted worktree:

| Gate                                                       | Result                         |
| ---------------------------------------------------------- | ------------------------------ |
| Targeted frontend (initial run)                            | PASS: 18 tests / 2 suites      |
| Teacher HTTP authorization                                 | PASS: 10 tests / 1 suite       |
| Full API regression (`npm test`)                           | PASS: 654 tests / 47 suites    |
| Final frontend (`npm test`, includes CSRF-code regression) | PASS: 19 tests / 2 suites      |
| Chrome browser interaction harness                         | PASS: 15 scenarios             |
| `npm run lint`                                             | PASS: API + Web                |
| `npm run typecheck`                                        | PASS: API + Web                |
| `npm run build`                                            | PASS: API + production SPA     |
| `npm run secret-scan`                                      | PASS                           |
| `git diff --check`, `git diff --cached --check`            | PASS; real index remains empty |
| Prettier check, explicit changed-file list only            | PASS                           |
| Live PostgreSQL / real-API browser integration             | NOT RUN; not claimed           |

No dependency installation. Existing runtime Playwright + installed Chrome
were used (TW01_BROWSER_CHANNEL=chrome); bundled Chromium was unavailable.
Initial harness startup checks failed on ANSI output, and the initial
network-error fixture needed to account for React StrictMode's repeated reads.
Both harness issues were fixed, then the full final run passed. Visual review
caught the inherited Student shell width overriding Teacher desktop layout;
CSS specificity was corrected and final desktop/tablet/mobile shots rechecked.
Vite caches now stay in the worktree's ignored `.vite` directory, including
when node_modules is shared. No source in Main was edited.

Browser scenarios cover dashboard/roster/progress, desktop/tablet/mobile,
create class + double-click lock, lesson DTO + CSRF + published filter, empty
states, loading, network retry, 403 privacy, 401 login, Student-only/dual-role/
anonymous entry, stale read cancellation, mutation conflict and logout failure.

## Changed files / review contents

15 files; no backend production/test, lockfile or Prisma changes:

```text
PROJECT_STATE.md
apps/web/jest.config.cjs
apps/web/vite.config.ts
apps/web/src/App.tsx
apps/web/src/api/client.ts
apps/web/src/api/teacher.ts
apps/web/src/teacher/model.ts
apps/web/src/teacher/useResource.ts
apps/web/src/teacher/TeacherViews.tsx
apps/web/src/teacher/TeacherForms.tsx
apps/web/src/teacher/TeacherWorkspace.tsx
apps/web/src/teacher/teacher.css
apps/web/test/teacher.spec.tsx
apps/web/test/teacher-browser.cjs
docs/Review/TW-01-REVIEW.md
```

The external review package includes a full binary-capable patch against the
baseline (including every untracked source/test), exact source copies, a hashed
manifest and browser-results.json plus six watermarked screenshots: overview,
roster, learner progress, tablet, mobile and assignment form. No .env, dependency
directory, build output, database dump, runtime configuration or real credentials
belong in the package. The final response supplies its ZIP SHA-256 and location.

## Gaps and remaining risks (no backend changes authorized)

- No class-wide assignment list, completion state, bulk assignment, update or
  delete contract. UI shows assignments per learner, never fabricated status.
- No global account search. Enrollment API requires a public student UUID;
  enrollment UI is deferred, not replaced with unrestricted lookup.
- Notes API exists; notes UI is outside this prioritized TW-01 implementation.
- Progress response lacks rule/version requested by the CP-06 planning document.
  UI labels this gap explicitly. Weak items lack human-readable item labels;
  UI uses ordinal labels, not IDs or answer content. Backend amendment requires
  separate approval if Owner requires these before release.
- API class/roster/evidence limits are 50/200/20 (weak items 10), with no pagination
  contract. UI labels bounds; totals are only for returned classes.
- Teacher HTTP responses do not explicitly set no-store in the controller;
  client requests no-store, but server/proxy cache-header verification remains
  a backend/deployment concern. No response-header behavior was silently changed.
- Reload returns to overview; teacher selections/forms are intentionally not
  stored. No URL/deep-link router dependency was added.
- Create class has no idempotency token. If the network fails after commit,
  refresh before retrying; UI warns and never auto-retries. Assignment duplicate
  handling remains the server's existing 409 contract.
- Browser end-to-end evidence uses synthetic interception, not a live backend.
  No database-backed Teacher browser smoke was run in TW-01. CP-05/DS-01 accepted
  PostgreSQL evidence belongs to those checkpoints and is not relabeled here.
- Existing Windows CRLF format baseline is not normalized. Only changed files
  are formatted. No full-repository format PASS is claimed.

Rollback: no commits or external deployment; review/edit the isolated worktree.
Preserve Main, preservation branches, Legacy and private recovery artifacts.
Stop for Owner independent review; no next checkpoint is authorized by this report.
