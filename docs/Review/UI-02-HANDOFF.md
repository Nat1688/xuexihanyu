# UI-02 — Teacher dashboard clarity

Status: implementation/review/regression complete; source published on codex/core-product-completion for homelab pull. No live Mac/homelab deployment or database mutation in this task.

Behavior: one application brand in teacher view; dual-role workspace switch and tools header retained. Grouped Soạn bài học/Tạo lớp actions. Five real navigation shortcuts explain course → publication → class → admission → assignment. Empty dashboard avoids seven zero cards; existing class empty state contains a create action that opens/focuses the existing form, including repeated clicks without losing text. Populated overview shows four aligned cards and retains the other three API metrics beneath. Loading/error states are distinct from actual zero values. Sidebar has consistent decorative SVGs/active indication, larger text, mobile grid and compact account/actions. Class cards are less tall.

Files changed: apps/web/src/App.tsx; apps/web/src/teacher/TeacherWorkspace.tsx, TeacherDashboard.tsx, TeacherNavIcon.tsx, TeacherViews.tsx, teacher.css; apps/web/test/teacher-dashboard-browser.cjs; docs/Planning/UI-02-TASK-CONTRACT.md; this handoff and README link.

Validation commands/results:
- npm run typecheck -w @clp/web: PASS.
- npm run lint -w @clp/web: PASS.
- npm test -w @clp/web:60/60 PASS.
- npm test -w @clp/api -- --runInBand --silent:778/778 PASS,55 suites. Initial default parallel run had5s setup-hook timeouts in2 API suites; serialized rerun passed without test/timeout/assertion changes.
- npm run build -w @clp/web:PASS.
- NODE_PATH=<installed Playwright location> node apps/web/test/teacher-dashboard-browser.cjs:6 fixture-only Chrome scenarios PASS at1440/768/390px,en-US. Tests empty/populated/loading/error states, metric alignment/all7 values, five navigation targets, repeated create shortcut focus/input preservation/exactly one POST, role-switch retention and no horizontal overflow. Screenshots inspected locally; fixture data is explicitly synthetic, not evidence of live statistics.
- Existing core-realstack.cjs with CORE01_DISPOSABLE=YES and private evidence directory:13 real Chrome/PostgreSQL17 scenarios PASS, including authoring/publish/admission/class assignment/student study/results and busy/dirty/authorization regressions. Only fresh isolated test databases used; no production credentials read/reset.

Independent reviewer core_review: no blocker; LOW repeated-create focus issue corrected and re-reviewed. onCancel preserves the original class-list refresh after a possibly uncertain save. Final source uses original guarded navigation and busy fieldset.

Migration/config/dependencies: NONE. API, admission authority, data, event/mastery rules and all11 migrations unchanged. Scope/contracts changed: NO beyond approved UI-02 presentation scope. Source-only commit/push under earlier Owner authorization; no main merge, secrets, runtime files, screenshots or local test DB artifacts included.

To see this on homelab: pull this branch, rebuild/redeploy the Web image using homelab's existing deployment configuration. The API/database do not require an update for UI-02. Runtime/target details are not available to this task, so no remote service was changed.
