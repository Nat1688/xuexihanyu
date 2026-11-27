# REL-01 — Production source reconciliation and deployment handoff

Date: 27/11/2026 (Asia/Saigon). Prepared for an independent deploying agent (Claude).
Status: **SOURCE RECONCILED / VERIFIED — NOT DEPLOYED.** No production container, image, database,
migration, env file or DNS was changed. Nothing was merged into `main`; no force-push.

## 1. Canonical source

| Item | Value |
| --- | --- |
| Repository | https://github.com/Nat1688/xuexihanyu |
| Canonical branch | `release/production-baseline-20261127` |
| Production-equivalent source commit | `617800d14249534a2a91753187ad1c75d3d45c8c` (code + packaging) |
| Test-maintenance commit | `f5dfea93269ae889921bc7f79349c3cf57f15290` (schema-gate tests aligned with migration12; no runtime change) |
| Branch head | the commit containing this file (docs + server compose override copy, on top of `f5dfea9`) |
| Parent | `dc44e9d` (`fix/sec-01-credential-handling`, already on GitHub) |

GitHub is now the single source of truth. Do **not** build from the Windows root checkout
(`codex/core-product-completion`, `b191d16` + uncommitted import files): it lacks Dictionary, Flashcards,
UI-V5 and fonts. Do not build from `artifacts/*` worktrees or release folders.

## 2. What is running (audited read-only 27/11/2026 16:27 +07)

| Service | Image ref | Image ID | Built from |
| --- | --- | --- | --- |
| web | `xuexihanyu-web:import01-fix01-web-20261127T082628Z` | `sha256:2cc76bed110430200e9653212cbc20e6b703f8faf7a3929a301a9e72aec45f0e` | DICT07-P web build + 5 static overlay layers (UI-V5, login fix, categories proxy, IMPORT-01, IMPORT-01-FIX-01) |
| api | `xuexihanyu-api:dictpub-20261126T132010Z` | `sha256:a7e4f662c23de24225e1a4550d6ad786b813b3643deb5a97ecc1720dd85d8bb3` | DICT07-P frozen source (524 files) + homelab runtime profile line |
| db | `postgres:17.11-bookworm` | `sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5` | volume `clp-homelab_pg17-data` |

Host `vaio-homelab` (x86_64, Docker 29.9.2, Compose 5.6.1). Compose project `clp-homelab`; env file
`/home/nam/.config/xuexihanyu/homelab.env` (values never read or copied). Compose chain (from container
labels): `xuexihanyu-homelab/deploy/oci01b2/compose.yaml`, `xuexihanyu-homelab/deploy/homelab/compose.override.yaml`,
then nine `xuexihanyu-releases/*/rollout.override.yaml` files ending with `import01-fix01-web-20261127T082628Z`.
Web listens on `127.0.0.1:8083`; readiness was HTTP 200 / database up.

Database: 12 applied migrations, none rolled back, identical to `prisma/migrations` on the branch
(`0_init` … `20261126040000_dictionary_foundation`).

## 3. Equivalence evidence

| Component | Method | Result |
| --- | --- | --- |
| API source | branch vs DICT07-P `SOURCE-MANIFEST.json` (524 files) | all API/prisma/package/Dockerfile inputs equal (line endings normalised); the 7 differing files are later Web/proxy/doc/test changes |
| API runtime | `tsc` with `deploy/oci01b2/tsconfig.api-build.json` on the branch vs SHA-256 of every file under `/app/apps/api/dist` and `/app/packaging` in the running container | 335/338 identical; the other 3 differ only by CRLF vs LF (two multi-line SQL template literals and `healthcheck.cjs`); recompiled with the CRLF originals all 338/338 match |
| Runtime profile | `deploy/oci01b2/runtime.cjs` | byte-identical to the server adapter (`28463449…`) |
| Web source | branch vs `artifacts/import01-fix01-release/apps/web` | 215/215 files equal (line endings normalised); branch also has `test/lesson-import-browser.cjs` |
| Web assets | production `BUILD-MANIFEST.json` (112 files) vs running container | 112/112 present and identical; container also keeps 6 superseded bundles from older layers + nginx `50x.html` |
| Web rebuild | `npm run build` (production mode, `VITE_API_BASE_URL=/api`) from a fresh clone | **112/112 byte-identical** to production from a Windows (CRLF) checkout; from an LF checkout (what `ship.sh`/Docker uses) 111/112, only `index.html` differs by line endings |
| nginx config | branch vs `/etc/nginx` in container | `clp-locations.conf` identical; `nginx.conf`, `default.conf` identical except CRLF |
| Compose override | branch `deploy/homelab/compose.override.yaml` vs server copy | byte-identical (`7bd6e522…`); it was previously untracked, server-only |
| Base compose / api.Dockerfile | branch vs server | identical |

## 4. Changes made on the branch (relative to `dc44e9d`)

Application source (already in production, previously uncommitted): UI-V5 cultural redesign + login
packaging fix, DICT-PROXY-01 nginx location, IMPORT-01 / IMPORT-01-FIX-01 lesson import and Vietnamese
CSV/JSON templates, related tests and task/handoff documents.

Build/deploy fixes (no application behaviour change):

- `deploy/oci01b2/runtime.cjs`: committed the `homelab` profile (`clp_homelab` / `CLP_HOMELAB_ONLY`) that was
  only patched in on the server.
- `.dockerignore` + `deploy/oci01b2/audit-context.cjs`: the closed build-context allow-list excluded
  `apps/web/src/**/*.woff2|*.webp` and `apps/web/public/templates/*`. A from-source Web image therefore
  could not be built for UI-V5/IMPORT-01, which is why those releases were layered onto older images.
  Now allowed; covered by new cases in `deploy/oci01b2/context.test.cjs`.
- `.gitattributes`: `apps/web/public/templates/* -text` keeps the BOM/LF template bytes identical on Windows.
- `deploy/homelab/`: `compose.override.yaml` (server copy), `release.py`, `ship.sh`, `verify-public.cjs`,
  `README.md` (runbook).

## 5. Build instructions

Requirements: Node.js 22.x (CI uses 24; production images use `node:22-bookworm-slim`), npm, PostgreSQL 17
only for integration tests.

```sh
git clone --branch release/production-baseline-20261127 https://github.com/Nat1688/xuexihanyu.git
cd xuexihanyu
npm ci --ignore-scripts && npx prisma generate
npm run lint && npm run typecheck
npm test                                   # API + Web unit suites
node --test "deploy/oci01b2/*.test.cjs"    # packaging/context/proxy tests
VITE_API_BASE_URL=/api npm run build       # never build with NODE_ENV=test (dev React bundle)
```

Production images are built on the homelab by `deploy/homelab/release.py build` from
`deploy/oci01b2/api.Dockerfile` (target `runtime`) and `deploy/oci01b2/web.Dockerfile`.

## 6. Deployment

Follow `deploy/homelab/README.md`. Summary:

```sh
deploy/homelab/ship.sh <name>                          # git archive of the pushed HEAD
ssh … "python3 <rel>/src/deploy/homelab/release.py preflight <rel> \
   --expect-web sha256:2cc76bed110430200e9653212cbc20e6b703f8faf7a3929a301a9e72aec45f0e \
   --expect-api sha256:a7e4f662c23de24225e1a4550d6ad786b813b3643deb5a97ecc1720dd85d8bb3"
ssh … "python3 … build <rel>"; ssh … "python3 … stage <rel>"
ssh … "python3 … rollout <rel>"; ssh … "python3 … verify <rel>"
node deploy/homelab/verify-public.cjs https://xuexihanyu.online build.json
```

Environment on the host (`homelab.env`, keys only): `CLP_DB_PASSWORD`, `CLP_SESSION_SECRET`,
`CLP_CSRF_SECRET`, `CLP_ORIGIN`, `CLP_TARGET_CONFIRMATION`; the override supplies `CLP_RUNTIME_PROFILE=homelab`,
`POSTGRES_DB/USER=clp_homelab`. Secrets stay on the host; never print or copy them.

First deployment from this branch is expected to be functionally a no-op. Reasonable first run:
`--services web` only, then API in a later window.

## 7. Rollback

- Release made with `release.py`: `python3 release.py rollback <rel>` (pinned tags
  `xuexihanyu-{api,web}:rollback-<name>`, image-only, no database change). Automatic on failed rollout.
- Current production (before any new release): web rollback override already exists at
  `/home/nam/apps/xuexihanyu-releases/import01-fix01-web-20261127T082628Z/rollback.override.yaml`
  (→ `sha256:4e505690…`). API rollback for DICT07-P:
  `/home/nam/apps/xuexihanyu-releases/dictpub-20261126T132010Z/rollback.override.yaml`.
  Always append the override to the full chain from the container labels and use
  `up -d --no-deps --no-build --pull never <service>`.
- Never roll the API back below schema 12 / admissions enforcement (see ADR-006); never restore a database
  dump over the live database as a "rollback".

## 8. Test evidence (fresh clone from Git, Windows, Node 24.18.0 / npm 12.0.2, git 2.55)

| Check | Command | Result |
| --- | --- | --- |
| Install | `npm ci --ignore-scripts` + `npx prisma generate` | PASS |
| Lint | `npm run lint` (API + Web, `--max-warnings 0`) | PASS (on `617800d` and `f5dfea9`) |
| Typecheck | `npm run typecheck` | PASS (both commits) |
| API unit | `npm run test -w @clp/api` | **831/831**, 59 suites (both commits) |
| Web unit | `npm run test -w @clp/web` | **131/131**, 15 suites |
| Packaging/context/proxy | `node --test "deploy/oci01b2/*.test.cjs"` | **82/82** |
| Build | `VITE_API_BASE_URL=/api npm run build` (API + Web) | PASS; Web 112/112 identical to production |
| Migrations | `prisma migrate deploy` on new PostgreSQL 17.11 clusters | 12/12 applied |
| Schema gate | `node scripts/db/db-test-validate.cjs` | PASS (`f5dfea9`; failed on `617800d` because its table list predated migration12) |
| Integration | `npm run test:integration` with all disposable targets (`TEST_DATABASE_URL`, `CL01_*`, `MCQ_*`, `DEMO_*`) | **74/74, 11/11 suites, 0 skipped** (`f5dfea9`) |
| Secret scan | `node scripts/secret-scan.cjs` on the clean clone + pattern scan of every committed path | PASS |
| Format | `npm run format:check` | FAIL — 15 pre-existing files (baseline, see limitations) |
| API runtime equivalence | `tsc` build vs running container | 338/338 (with original CRLF), see §3 |

Verification pitfalls found and corrected during this run (do not repeat): building with `NODE_ENV=test`
produces a development React bundle; `npm run test:integration -- --runInBand` is rejected by npm 12; on
Windows `pg_ctl start` must not run under redirected output (it blocks the caller).

Logs: `artifacts/recon-20261127/verify-20261127T162942/` on the Owner workstation (ignored, not committed).

## 9. Known limitations and unresolved discrepancies

1. **Line endings.** Production artifacts were built from CRLF sources (Windows checkouts copied to the
   server). The branch stores LF (as all 531 previously tracked files). Consequence: a rebuild is
   byte-identical except where CR bytes reach output: API `preview.module.js`,
   `prisma-mastery-derivation.lock.js`, `healthcheck.cjs` (SQL/whitespace only) and Web `index.html` (CRLF vs LF; JS/CSS/fonts/images/templates identical).
   No behaviour difference. Not "fixed" by committing CRLF, to keep one convention.
2. **Superseded Web bundles.** The running Web image still serves 6 old hashed bundles from earlier
   layers so that a tab opened before 27/11 keeps working until reload. A from-source image does not include
   them; such a tab needs a reload after the next Web rollout.
3. **Unreleased work not on this branch** (preserved, not lost): importer v2 / would-be migration 13 in
   `artifacts/dict-import-worktree` (`codex/dict-import-compatibility`, uncommitted) — deliberately excluded
   from production by DICT07-P. Earlier snapshots in `dict01/dict07/fc01/fc02/ui03/ui06` worktrees are
   superseded by the branch. All are archived in `artifacts/recon-20261127/backup/` with SHA256SUMS.
4. **Formatting.** `npm run format:check` fails on 15 pre-existing files (baseline debt, unchanged files).
   GitHub Actions `quality.yml` runs this step, so CI will report failure at that step until a separately
   approved formatting task.
5. **Server-side state still outside Git:** `homelab.env` (secrets, by design); the old checkout
   `/home/nam/apps/xuexihanyu-homelab` (`21c226b` + 2 local changes) which the compose chain still references
   for its two base files. Its two files are now byte-identical copies of branch files; do not delete it while
   the running containers reference it.
6. **Integration DB.** Integration tests ran on a new throwaway PostgreSQL 17 cluster, not on production
   data. Owner authenticated Teacher/Student UAT remains manual.
7. Base images (`node:22-bookworm-slim`, `nginx:stable-bookworm`) are tags, not digests; `build.json`
   records the IDs used.

## 10. Backups made before reconciliation

`artifacts/recon-20261127/backup/` on the Owner workstation: `all-refs.bundle` (every local branch),
uncommitted-change archives of the root checkout and nine `artifacts/*` worktrees, the IMPORT-01 release and
deployment folders, `SHA256SUMS`. No file, worktree, artifact, image or container was deleted.
