# UI-02 — Teacher dashboard clarity

Owner request 31/10/2026: fix the teacher UI shown in the screenshot, following the reviewed usability issues. Checkpoint: UI-only follow-up to deployed CORE-01/TOOLS-01/ENROLL-01.

Objective: readable teacher dashboard with an obvious course → lesson publication → class → admission → assignment path. In scope: teacher shell/sidebar spacing/type/icons, single brand, grouped primary actions, actionable class empty state, four aligned primary statistic cards plus remaining existing metrics, no zero-heavy dashboard before data exists, responsive desktop/tablet/mobile.

Architecture/authority: existing React components and API projections only. Navigation uses existing guarded workspace callbacks; preserve dirty/busy guards, multi-role switch, tools state and account access. Real zero/loading/error states remain distinct. No invented counts, automatic creates, API/schema/migrations/auth/evaluation changes, dependencies or unrelated redesign. No Mac rollout: user has moved toward homelab; publish source to existing GitHub branch for pull, no main merge or homelab mutation without target context.

Allowed: apps/web/src/teacher dashboard/workspace/views/styles and a small icon component; App header presentation; related browser tests and docs. Acceptance: all five guide steps open actual existing destinations; create-empty CTA focuses existing create form; zero stats hidden only for genuine all-zero API data; populated metrics retain all seven server values; overview error never rendered as zero; no overflow at390/768/1440; readable text; logout/role switch/dirty guards retained.

Validation: targeted Web tests, browser fixture acceptance for empty/populated/error views and navigation at desktop/mobile; independent review/fix/re-review; typecheck/lint/build and checkpoint regression. No new backend tests for unchanged API. Report source changes, verification, limits and migration/config impact. Prior Owner push authorization persists; commit/push only reviewed code/docs, no secrets or local evidence.
