# TOOLS-01 — Learning tools integration

Status: implementation, independent review and automated regression complete; deployment evidence recorded per release outside frozen source.

Behavior: Công cụ học tập is visible from login, Teacher and Student. Pinyin Studio includes the pinned upstream 406-syllable table/search/four tones in an isolated srcdoc frame. Only embedding metadata and pagehide/unload playback cleanup adapt upstream code. AN2 loads on selection, supports its worksheet form and new-tab preview/print flow, with permanent external fallback. No app data is sent automatically. Opening/closing retains unsaved authoring and exercise input. Vietnamese UI is the app default even for en-US browsers.

Changed modules: apps/web/src/learning-tools/*; App.tsx; teacher/TeacherWorkspace.tsx; classrooms/StudentWorkspace.tsx; test/learning-tools.spec.tsx; test/learning-tools-browser.cjs; test/core-realstack.cjs. Governing scope: docs/Planning/TOOLS-01-TASK-CONTRACT.md.

Validation: npm run typecheck PASS; npm run lint PASS; npm test PASS (API 761/761, Web 57/57); npm run build -w @clp/web PASS. Isolated PostgreSQL 17 real-stack browser acceptance PASS (9 scenarios), including dirty teacher lesson and student answer preservation, authoring/publication/assignment/study/results, authorization and CSRF denial. Independent read-only review core_review: no blocker; documentation comment corrected. Browser utility acceptance uses real external audio/AN2 and records each result and screenshots separately.

Migration/config: NONE; API, 10 migrations and Dockerfiles unchanged from deployed FIX01. Web-only ARM64 image rollout uses a fresh authenticated encrypted backup before replacing Web; original API container, database container/volume/ledger/counts must match. Keep old image for rollback. No database rollback/reset, account modifications, commit/push/merge.

Limits: public utility browser acceptance does not sign in to live Teacher/Student accounts; those remain PENDING_OWNER_MANUAL_TEST. MP3 availability and browser Chinese TTS depend on external upstream/installed voices. See PINYIN-STUDIO-NOTICE.md for retained audio attribution and unconfirmed upstream recording license. AN2 is external and its own generation opens a preview tab for printing; provider/browser restrictions may require the explicit external link.

Scope/contracts changed: NO beyond approved TOOLS-01 additive utility.
