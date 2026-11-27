# IMPORT-01-FIX-01 — Vietnamese template and Unicode correction

Status: **DEPLOYED / VERIFIED**, 27/11/2026 (Asia/Ho_Chi_Minh). Source remains uncommitted; no commit/push/merge.

## Problem and resulting behavior

The original comma-separated template had UTF-8 text without a BOM. Opening it directly in the Owner's Excel produced mojibake. Technical English headers and enums also made the form hard to fill.

The public CSV now starts with UTF-8 BOM `EF BB BF` and uses these nine column names: **Tên bài học, Giới thiệu bài học, Loại nội dung, Chữ Hán / cấu trúc, Pinyin, Nghĩa tiếng Việt, Ví dụ sử dụng, Loại tài nguyên, Đường dẫn tài nguyên**. The existing two sample rows use **Từ vựng** and **Ngữ pháp**, with real Chinese, Pinyin and Vietnamese meanings/examples. Optional media cells remain blank; the template does not contain fake resource URLs.

The browser normalizes Vietnamese column/item/media labels to existing canonical fields/enums. Old English CSV headers/values and the original JSON format still work. Comma and semicolon delimiters are supported to accommodate Excel locale settings; quoting, embedded newlines, duplicate aliases, limits and safe-URL validation remain enforced. Display labels are localized in preview.

The existing import panel includes four preparation/save steps and a field-by-field guide explaining required/optional cells with concrete examples. It tells users to fill lesson metadata on the first data row, add one item per subsequent row, leave media columns blank for text-only lessons, and save as CSV UTF-8. Scoped Noto Sans/Noto Sans SC/system font fallbacks, spacing and responsive guide cards make the web instructions readable. A versioned download URL avoids reusing the old cached template.

CSV contains text and cannot store Excel font/column formatting. The correction addresses the encoding failure; it does not claim to save font or width settings inside CSV. Reloading the new template avoids editing already-garbled sample text. No XLSX/HTML import was added.

## Files changed for this followup

- `apps/web/src/curriculum/lesson-import.ts`: localized field guide/alias mapping, CSV-only enum normalization, semicolon detection and localized metadata errors.
- `apps/web/src/curriculum/LessonImport.tsx`: Vietnamese download label, filling instructions/examples, localized preview.
- `apps/web/src/curriculum/curriculum.css`: typography and responsive guide styles scoped to the import panel.
- `apps/web/public/templates/bai-hoc-mau.csv`: BOM, Vietnamese headers and values.
- `apps/web/test/lesson-import.spec.ts`: four localization/compatibility/security regression cases.
- `apps/web/test/lesson-import-browser.cjs`: downloaded CSV byte check, localized preview/guide and expanded responsive-guide coverage.
- `docs/Planning/IMPORT-01-FIX-01-TASK-CONTRACT.md` and this report.

Pre-existing root WIP and other worktrees were preserved. Build/deployment artifacts are under ignored `artifacts/import01-fix01-*`; the previous IMPORT-01 evidence was retained.

## Verification commands and results

- `npm run test -w @clp/web -- --runTestsByPath test/lesson-import.spec.ts test/curriculum.spec.tsx`: **39/39 PASS**,2suites; independently rerun by reviewer.
- `node node_modules/jest/bin/jest --config artifacts/import01-fix01-release/apps/web/jest.config.cjs --runInBand`: **131/131 PASS**,15suites, current production-source Web plus this fix.
- `npm run test -w @clp/api -- --runInBand` from current-source `artifacts/ui-v5-worktree`: **831/831 PASS**,59suites; API source unchanged.
- `npm run lint -w @clp/web`, `npm run typecheck -w @clp/web`: PASS. Staged current-source Web TypeScript/ESLint: PASS.
- Staged Web `VITE_API_BASE_URL=/api` production build: PASS.
- Scoped Prettier and `git diff --check` on edited tracked source: PASS. No global format/secret-scan PASS claim.
- Native Excel COM: opened only the new template in a separately created invisible read-only Excel instance. Readback:9columns; A1=`Tên bài học`,C2=`Từ vựng`,D2=`你好`,E2=`nǐ hǎo`,F2=`Xin chào`. Closed without saving and released the owned instance; no existing user workbook was selected or changed. This verifies native decoding/readback, not a native Excel visual screenshot.
- `node apps/web/test/lesson-import-browser.cjs` with bundled Playwright and staged production dist: **7/7 PASS**. Added actual downloaded CSV BOM/labels check, nine-field guide, localized preview and expanded390px/1440px guide layouts; existing preview/cancel/error/append/replace/save/reopen/export checks remain. Screenshots visually inspected.
- Same harness with `IMPORT01_ORIGIN=https://xuexihanyu.online`: **7/7 PASS**, using real HTTPS static assets and explicitly intercepted synthetic APIs. No real authenticated lesson/account writes.
- Independent source/test review: **APPROVED**, no actionable findings. Reviewed rollout script retains image-ID checks, pinned rollback and Web-only configuration equality. Staging receipt: **112assets PASS**.
- `node artifacts/import01-fix01-deployment/verify-live.cjs`: **112/112 HTTPS SHA-256 assets match**, readiness HTTP200/database up, anonymous session endpoint HTTP401 JSON, zero production writes.

## Deployment and preservation

Target: existing `nam@100.100.154.92`, `vaio-homelab`, Linux x86_64, Compose `clp-homelab`, https://xuexihanyu.online. Based on the previously verified current production-source staging copy; only this followup's source/template files were overlaid.

Previous running Web exact image: `sha256:4e505690241d28826c43dd9c5ecf122ce924a1e6dbe1ede1d0b17d717e13d725`. New image inherits that image to retain current Nginx/proxies and old hashed assets. Independent localhost-only temporary-container staging passed before rollout.

Release directory: `/home/nam/apps/xuexihanyu-releases/import01-fix01-web-20261127T082628Z`.
New Web tag: `xuexihanyu-web:import01-fix01-web-20261127T082628Z`.
Actual new image ID: `sha256:2cc76bed110430200e9653212cbc20e6b703f8faf7a3929a301a9e72aec45f0e`.

Rollout changes only the Web image via the existing Compose chain plus the release override, using `up -d --no-deps --no-build --pull never web`. It verifies current/candidate IDs, base-layer ancestry, full Compose equality except Web image, health and every asset. Rollback override in the release pins the actual previous image through a unique local tag; prior images/releases retained. The script automatically restores that image on failed postflight.

API/DB container IDs, image IDs, configuration and mounts remained unchanged. No database query, migration, schema/seed change, real account/lesson write, provider/dependency addition or permission/session change. Configuration change is only the Web image override.

## Limitations and scope

Users should download the new template instead of continuing from the corrupted sample, then save edited files as CSV UTF-8. This followup does not recover lost drafts, renew login sessions or support XLSX/HTML import. Real-account authenticated production UAT remains manual; live browser write tests were synthetic.

Scope/contracts changed: **NO** relative to the Owner-approved IMPORT-01-FIX-01 task. Existing JSON/API/authorization/revision/history contracts remain intact.
