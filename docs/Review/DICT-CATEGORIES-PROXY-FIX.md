# DICT-PROXY-01 — Restore admin category loading

27/11/2026. Owner reported a missing specialty selector. Status: WEB_PROXY_FIX_PASS.

Read-only database verification: 23,293 entries; 32,591 senses; 28 categories (28 active); 35,929 entry/category links. Data was not lost. Existing entries remain INTERNAL and UNCLASSIFIED; no publication/classification operation performed.

Root cause: Nginx slash-prefix location /api/dictionary/admin/categories/ implicitly redirects the canonical /api/dictionary/admin/categories request to http://xuexihanyu.online:8080/api/dictionary/admin/categories/. Confirmed public HTTPS response before fix: HTTP 301 with that Location. This breaks category retrieval on HTTPS. The route was inherited unchanged by the redesign image.

Minimal repair: add an exact location for the canonical endpoint, same upstream, header handling, no-store, no proxy cache or error interception. Publication subpaths unchanged. No authentication/RBAC change. Isolated branch codex/dictionary-categories-proxy-fix from dc44e9d. No commit/push/merge.

Tests: 27/27 node packaging/proxy tests PASS, secret scan and git diff check PASS. Real Nginx staged non-root/read-only/cap-drop/no-new-privileges PASS; all 110 existing static asset hashes unchanged. Staged and live canonical endpoint and four related auth/read paths return JSON 401 to unauthenticated requests without redirect. Public HTTPS independently PASS. These are authorization-preserving anonymous checks, not an authenticated admin-browser UAT.

Only Web recreated with no-deps/no-build. API and DB container/config/mounts unchanged; no database write, reimport, migration or seed. New Web image: sha256:c31484dbf3f351c1df6406d9b99180ccf1da6feebb1b3a96d6535efaf4891a48
Release: /home/nam/apps/xuexihanyu-releases/dict-categories-proxy-20261127T064434Z
Rollback override: /home/nam/apps/xuexihanyu-releases/dict-categories-proxy-20261127T064434Z/rollback.override.yaml

Next: Owner refreshes the authenticated Dictionary Management view to confirm specialty options. The HTML exercise-builder request remains pending scope selection; no new feature implemented.
