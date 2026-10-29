# VI-01 verification / review handoff

Task status: IMPLEMENTED, awaiting Owner independent review. Not deployed.
Git parent6f0ba0d39c68a07137aef94c06e2a25c50e33d92; feature
codex/vi01-vietnamese-first. Exact changed paths/bytes/hashes are in FILES.json;
full binary diff includes untracked sources without staging.

| Gate actually executed on Windows                 | Result                          |
| ------------------------------------------------- | ------------------------------- |
| Frontend component/client regression              | PASS42 tests /4 suites          |
| Full API regression                               | PASS722 tests /49 suites        |
| Lint, typecheck                                   | PASS                            |
| Production build + catalog validation             | PASS; catalog PREVIEW_ONLY      |
| Changed-file Prettier, CJS syntax                 | PASS                            |
| Secret/artifact scan, Git diff/index checks       | PASS                            |
| Chrome Teacher interaction scenarios              | PASS16                          |
| Chrome VI01 Student/Preview scenarios             | PASS6                           |
| MCQ reload/order/keyboard/retry checks            | PASS6                           |
| Actual Mac ARM64 image build / runtime / rollback | NOT_RUN                         |
| Existing Mac account HTTPS verification           | NOT_RUN; no login or DB contact |
| PR01/LC03B PostgreSQL/browser suites              | NOT_RUN; selector updates only  |

Full command/exit-code evidence: quality-results.json. Browser results are separate
JSON records alongside screenshots. Browser automation uses installed Chrome via
Playwright, locale en-US, real Vite/React, synthetic intercepted API only. No mock
is shipped as production behavior and no synthetic fixture is imported by src.
No packages, browser downloads or lockfile changes were made.

## Visual inspection

22 screenshots are included, each labeled VI-01 synthetic UI test data. Desktop
Teacher1440x1000 and Student1440x900; mobile390x844, plus Teacher tablet820x1100.
Full-page images may be taller than viewport. Page-wide overflow assertions passed;
roster tables retain their existing internal horizontal scroll at narrow widths.

- Teacher: dashboard desktop/mobile, loaded roster desktop/mobile, student record
  desktop/tablet/mobile, assignment form. Roster waits for actual fixture rows.
- Student: login desktop/mobile, Today desktop/mobile, exercise desktop/mobile,
  result desktop/mobile, error, empty, denied, preview desktop/mobile and EN
  teaching content with Vietnamese UI. The screenshot lesson is explicitly a
  synthetic UI fixture, not the signed-off curriculum or a publication.
- Desktop dashboard, mobile Student Today, mobile Teacher record and mobile VI
  preview images were inspected directly for readable Vietnamese layout.

Class/lesson names such as Mandarin foundations and Greetings & introductions in
Teacher screenshots are intentionally unchanged server-content fixtures, not UI
fallbacks. Likewise EN teaching feedback remains English when EN content is
explicitly chosen. UI labels/notices remain Vietnamese. Internal role/mode values,
Chinese and Pinyin values are not rewritten.

## Scope / residual limits

No backend, auth/CSRF/RBAC policy, Prisma schema/migration, publication gate,
dependency or API DTO changes. User-authored content is not translated. Existing
session/recovery storage and stable submission token behavior remain unchanged.
The localization helper controls presentation only; server authorization remains
authoritative. Native OS date-picker chrome may still use OS conventions.

M06 source hashes and original ZIP remain unchanged. Original16-file VI WIP and
EN worktree are preserved; no English UI branch was created. Main and R3a packaging
worktree stay clean. Recovery/preservation refs/artifacts and Mac persistent data
are untouched. Exact preservation receipts accompany handoff.

ARM64 Web-only build/rollout is prepared in README and web-only.override.yaml.
The override changes only Web image. Live Mac build, account flows and rollback
need separate approval/execution. No commit, push, merge or deploy at this gate.
