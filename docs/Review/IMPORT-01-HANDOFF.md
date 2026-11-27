# IMPORT-01 — Lesson file import

Status: **DEPLOYED / HTTPS verified**, 27/11/2026 (Asia/Ho_Chi_Minh). Source changes remain uncommitted; no checkpoint commit, push or merge was performed.

## Behavior

In Teacher → Khóa học & bài học → course → chapter → lesson editor, open **Nhập bài học từ file JSON / CSV**. Download either template, prepare a UTF-8 file, select it, review the parsed items, choose append or replace, apply, then use the existing **Lưu bản nháp** action. Applying an import does not save or publish automatically.

Templates are available at `/templates/bai-hoc-mau.json` and `/templates/bai-hoc-mau.csv`. JSON supports the lesson title/description, all five existing item kinds, optional traditional characters/HSK and example/media references. CSV uses the current visible form fields. Blank CSV title/description cells preserve metadata; nonblank values must be consistent across rows. Append preserves current title/description/items; replace uses supplied metadata and replaces items. Lesson identity, position, slug, visibility and revision come from the editor/server, never the file. The existing authenticated CSRF-protected save endpoint remains authoritative.

Inputs are capped at64KiB,1–100items; the resulting lesson cannot exceed100items. Core text fields are capped at200characters. CSV supports BOM, CRLF, escaped quotes, commas and quoted newlines. Bad files leave editor content unchanged. Media requires HTTPS URLs without embedded credentials. Preview displays URLs as text without loading remote media. React renders imported content as text. Unknown fields/identities are rejected.

**Tải bài hợp lệ (.json)** downloads an importable copy of completed current content. The same importer validates it before download; empty/incomplete/oversized/unsupported legacy content produces an actionable message instead of an unusable restoration file. Keep the original offline file while drafting.

## Files changed

- `apps/web/src/curriculum/Lesson.tsx`: integrates the import panel into the existing editor.
- `apps/web/src/curriculum/LessonImport.tsx`: templates, upload selection, validation feedback, preview, append/replace, valid JSON download.
- `apps/web/src/curriculum/lesson-import.ts`: local parser, validation, application and export helpers.
- `apps/web/public/templates/bai-hoc-mau.json` and `bai-hoc-mau.csv`: synthetic lesson templates.
- `apps/web/test/lesson-import.spec.ts`: parser, format, safety, limit and preservation regressions.
- `apps/web/test/lesson-import-browser.cjs`: production-bundle browser acceptance, optional live-static/synthetic-API mode.
- `docs/Planning/IMPORT-01-TASK-CONTRACT.md` and this report.

Pre-existing WIP in PROJECT_STATE.md, HOMELAB-HANDOFF.md and baseline-revalidation/history files was preserved. Existing UI-V5 source/worktree was not edited. Ignored `artifacts/import01-*` directories contain the staged current-source Web build, test results/screenshots, deployment script, manifests and receipts; these are not intended for Git.

## Verification

- Targeted: `npm run test -w @clp/web -- --runTestsByPath test/lesson-import.spec.ts test/curriculum.spec.tsx`: **35/35**,2suites PASS, independently rerun by reviewer.
- Root Web: `npm run test -w @clp/web`: **92/92**,10suites PASS.
- Current UI-V5 source plus IMPORT-01 staged Web: `node node_modules/jest/bin/jest --config artifacts/import01-release/apps/web/jest.config.cjs --runInBand`: **127/127**,15suites PASS. First staging-only attempt failed because template/deployment fixture files had not been copied; after staging those existing fixtures, the unchanged assertions passed.
- Root API: `npm run test -w @clp/api -- --runInBand`: **778/778**,55suites PASS.
- Current-source API regression, same command from `artifacts/ui-v5-worktree`: **831/831**,59suites PASS. No API source was changed.
- Root `npm run lint` and `npm run typecheck`: PASS. Staged current-source Web TypeScript and ESLint: PASS.
- Production build: `VITE_API_BASE_URL=/api node ../../../../node_modules/vite/bin/vite.js build` from staged Web: PASS. Initial sandbox attempt hit the known esbuild directory permission restriction; the same build outside sandbox passed.
- `node apps/web/test/lesson-import-browser.cjs` with bundled Playwright, staged production dist: **6/6 PASS**. Covers JSON preview/cancel, invalid input preservation, CSV append, JSON replace/draft-save/reopen with revision/CSRF, valid export/reimport,390px and1440px layouts. Initial browser run caught an inaccessible exact label on the mode selector; an explicit aria-label fixed it, then all6scenarios passed.
- Same harness against `IMPORT01_ORIGIN=https://xuexihanyu.online`: **6/6 PASS** using actual HTTPS static assets and intercepted synthetic API responses. No real user login/account/lesson writes; this is not authenticated production UAT.
- Independent source review: MEDIUM invalid export-restoration mismatch and LOW non-string media-type acceptance were fixed and regression-tested. Re-review **APPROVED**. Independent deployment-script review required image-ID pinning; implemented and **APPROVED** before rollout.
- Changed source/test Prettier and `git diff --check`: PASS. Existing repository-wide format/secret-scan limitations from the baseline remain; no global PASS claim.
- `node artifacts/import01-deployment/verify-live.cjs`: **112/112 HTTPS assets match SHA-256**, readiness HTTP200/database up, anonymous `/api/auth/me` HTTP401 JSON.

## Runtime preservation and rollout

Actual target: `vaio-homelab`, Linux x86_64, Compose project `clp-homelab`, public origin https://xuexihanyu.online. Running Web was newer than root checkout: `xuexihanyu-web:dict-categories-proxy-20261127T064434Z`. Its actual image ID was `sha256:c31484dbf3f351c1df6406d9b99180ccf1da6feebb1b3a96d6535efaf4891a48`; the Compose image label contained a different digest, so staging initially stopped before changes. Direct image inspection established the correct ID; no guard was bypassed.

Rebuilt the current UI-V5/login-fix source before integrating IMPORT-01: **all110baseline assets matched the previous deployed manifest exactly**. Copied only IMPORT-01 components/templates into an isolated copy of that source, retaining dictionary, flashcards, cultural theme, login fix and other existing functions. The new image inherits the exact running Web image, preserving Nginx/proxy configuration and old hashed assets for already-open clients.

Final stage: `/home/nam/apps/xuexihanyu-releases/import01-web-20261127T081240Z`. A separate localhost-only container passed112asset hashes and readiness, then was removed. Candidate image ID recorded at staging and asserted again at rollout; old image tag/ID and image-layer ancestry verified. Compose configuration equality permits only the Web image change. Rollout uses `up -d --no-deps --no-build --pull never web`, with automatic rollback on failed health/assets checks.

Deployed image: `xuexihanyu-web:import01-web-20261127T081240Z`, actual ID `sha256:4e505690241d28826c43dd9c5ecf122ce924a1e6dbe1ede1d0b17d717e13d725`.

Rollback override: `/home/nam/apps/xuexihanyu-releases/import01-web-20261127T081240Z/rollback.override.yaml`, pinned via a unique local tag to the exact prior running image. Apply as the final override after the current recorded Compose file chain. Prior images/releases retained.

API and DB container IDs, image IDs, configuration hashes and mount hashes remained identical before/after. No SQL, migration, seed, schema inspection, account/password changes or data restoration was performed. No secrets were copied into the artifact. The deployment changes only the Web image override; no application configuration/schema/dependency change.

## Limitations and contracts

HTML and multi-lesson batch import are not included. Existing limits and validation still apply when saving. Import does not implement autosave, session renewal or recovery of previously lost drafts; historical missing drafts remain unverified. Valid JSON download cannot capture incomplete draft content. Production authenticated UAT with the Owner's real account remains manual; automated live browser acceptance used synthetic API interception deliberately.

Scope/contracts changed: **NO** relative to IMPORT-01. This is an Owner-authorized extension to authoring, using existing API/authorization/revision/evidence contracts.
