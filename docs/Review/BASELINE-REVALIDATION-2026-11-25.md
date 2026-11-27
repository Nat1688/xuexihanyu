# CORE-01 / UI-02 — Source baseline revalidation

Date:25/11/2026, Asia/Ho_Chi_Minh. Scope:continue the status audit by checking the existing implementation and correcting current-state/handoff documentation. No feature/backend/schema/auth/evaluation/dependency or deployment change.

Implementation baseline:`codex/core-product-completion` at `b191d162c4f965d9abf9a3a89a62cf373e9188d7`; initial worktree/index clean. Current local main is8fc28d3. Governing contracts:AGENTS.md, CORE-01/UI-02 task contracts, ENROLL-01 and ADR-006. Source/runtime publication decisions stay with Owner; existing historical push authorizations are not exercised for these unreviewed docs.

## Fresh checks

Existing Windows Node24.18.0/npm12.0.2; no installation or database runtime:

| Command / check                                                                                                                                       | Result                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `npm test -w @clp/api -- --runInBand --silent --no-cache admissions.spec.ts core-authoring.spec.ts lesson-completion.spec.ts teacher-service.spec.ts` | 46/46 PASS                                               |
| `npm test -w @clp/api -- --runInBand --silent --no-cache`                                                                                             | 778/778 PASS;55suites                                    |
| `npm test -w @clp/web -- --no-cache`                                                                                                                  | 60/60 PASS;9suites                                       |
| `npm run lint`                                                                                                                                        | PASS                                                     |
| `npm run typecheck`                                                                                                                                   | PASS                                                     |
| `npm run build`                                                                                                                                       | PASS on filesystem-permitted rerun; API/Web/catalog      |
| `npm run secret-scan` in working checkout                                                                                                             | FAIL; scanner includes ignored local artifacts           |
| Same scanner on source-only export                                                                                                                    | PASS; see final source-scan receipt for scope/file count |
| `npm run format:check`                                                                                                                                | FAIL_BASELINE; stops at3existing seed scripts            |
| Complete read-only Prettier source inventory                                                                                                          | 56baseline files; no rewrite                             |

Initial build was blocked by sandbox parent-directory access in esbuild; the identical command/source passed with filesystem permission. Both logs are retained. Catalog validation reports PREVIEW_ONLY/publication prohibited. These Windows builds do not certify a new ARM64 image or deployment.

Logs/exact commands/exit codes:ignored `artifacts/baseline-revalidation-20261125/RESULTS.json` and individual logs. This evidence is local and not committed.

## Scanner finding and concrete follow-up boundary

The existing scanner's header says it scans tracked project files, but its implementation recursively walks disk with a fixed skip-directory set. `.core-demo` is not skipped, so historical exported copies lose their original root-relative fixture allow-list paths and trigger workflow/fixture findings. Local operator scripts also trigger generic hardcoded-assignment heuristics; this review does not open or disclose their values or assume they are harmless.

A clean source export passes the unchanged scanner. The root gate remains FAIL; no scan rule, fixture allow-list or file was changed/deleted to hide it. A bounded follow-up should select Git-tracked plus non-ignored untracked candidate source with NUL-safe path handling, retain high-signal checks and reject actual secret-bearing candidate files. Required regressions:tracked secret rejection, non-ignored new secret rejection, approved root-relative synthetic fixtures, ignored historical export exclusion and no global Git/config/data mutation. Ignored private operational material needs a distinct explicit review scope. This proposal is not implemented in this documentation follow-up.

## Inherited evidence and runtime status

Existing74PostgreSQL integration tests/13real-stack scenarios and6fixture UI-02 scenarios were inspected as prior evidence, not rerun. No database was accessed or service started. Mac release records from30/10show schema11/public HTTPS success; actual current Mac/homelab health was not queried. Real-account Teacher/Student acceptance remains pending. UI-02 deployment is unproven; current handoff records it as source only.

Do not use older9→10rehearsal scripts or pre-admission API rollback to operate the schema11 release. ADR-006 requires admission gates after the migration boundary.

## Documentation-only changes and rollback

- PROJECT_STATE.md:replace stale TW-01 status with current source, evidence, limitations and release gates.
- docs/Review/PROJECT_STATE-TW01-HISTORICAL.md:byte-identical copy of the old state, preserving historical evidence.
- docs/Operations/HOMELAB-HANDOFF.md:append current source-only UI-02/state-verification checks, with no executable deployment change.
- This report.

Rollback is limited to these documentation files; no source/runtime/data rollback is required. Old state SHA256:8BD1D4D29006B9D2313FEF00951E059CE436BFC9DE6B9D2A034BA9B24F5D29E7. The original implementation commit and all preservation refs/worktrees remain.

Status:documentation correction prepared for review; full release readiness is not certified. No stage/commit/push/Main merge or runtime action. Next execution needs actual homelab context and Owner rollout approval; no new checkpoint started automatically.
