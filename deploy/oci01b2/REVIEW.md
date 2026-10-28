# OCI-01B2 — Mac mini First review handoff

R1 historical report below. Superseded for build acceptance by
[R2 context correction](R2-CONTEXT-CORRECTION.md): Owner reported R1 context audit
FAIL; R2 Mac audit/build acceptance is NOT_RUN. Do not interpret R1 preparation
checks as image-build success. Original frozen ZIP remains unchanged.

Status: packaging and runbooks prepared; Owner review required. New Docker image,
Compose, persistence, restore and browser acceptance remain NOT_RUN on Mac.
No stage, commit, Main merge, push, cloud provisioning or Mac deployment performed.

## Scope and workspace

Feature worktree: C:/Users/admin/Documents/XueXiHanyu-OCI-01B2.
Branch: feature/oci-01b2-arm64-packaging.
HEAD: 8fc28d3a45539c2de5ddb14b94c3a4f9127e0194.
Main stays at the same baseline, clean. Owner confirms remote checkpoint
checkpoint/2026-10-28-arm64-pass; remote verification is Owner evidence, not an
agent fetch/push. No earlier packaging artifact is overwritten.

Latest Owner directive makes Mac mini M1 Local Trial first; OCI is deferred.
Only packaging, startup metadata, operational helpers/tests and documentation
change. Business source, Prisma schema, all nine migrations, lockfile, legacy
Compose, Preview Gate/catalog and learning-track worktrees remain unchanged.
The frozen Mac source export is authored here; Mac extracts/verifies/builds only.

## File mapping

Exact repository paths, bytes and SHA-256 are in review FILES.json. Full binary
patch includes untracked sources without staging. Groups:

- .dockerignore: closed build-context allowlist, no host dependencies or secrets.
- .gitignore: only task-local evidence exclusion.
- apps/api/package.json: main/start corrected to dist/src/main.js, no dependencies.
- API/frontend Dockerfiles and packaging tsconfig: native Linux builds, Node22,
  Prisma6.19.3, pruned runtime and separate one-shot migration image.
- Base/disposable, Local Trial, restore-check and optional TLS Compose definitions;
  deferred OCI resource overlay is not used by Local Trial.
- Nginx single-origin /api routing, runtime TLS mounts and Docker DNS re-resolution.
- Runtime profile/DB guards, health/static/optional synthetic-auth smoke helpers.
- Context/image audit, frozen-source verification, local gate and review exporters.
- Encrypted database backup/restore helper and pure boundary/crypto tests.
- Blank-secret environment template, README, MAC-LOCAL-TRIAL.md, OPERATIONS.md,
  ACCEPTANCE.md, DISPOSABLE.md and this handoff.

## Isolation and security

Local Trial: project clp-local-trial, DB/role clp_local_trial, volume
clp-local-trial_pg17-data. Old disposable clp-oci01b2 has another project/DB/volume.
Restore check: clp-restore-check, DB/role clp_restore_check, independent empty volume.
No PostgreSQL/API host ports; web defaults to loopback18082/18445 only.
Trial db/api/web use unless-stopped; migration remains one-shot. Health failures
do not automatically restart running containers. Colima/login startup is not installed.

Credentials are mandatory runtime environment values, absent from source/images
by design. Actual built-image scan is still pending. Production Secure cookies
require trusted HTTPS for login. Same-origin /api preserves cookie/CSRF contract;
no cookie rewriting, wildcard CORS or auth change. LAN/Tailscale access requires
separate approval and acceptance; no public bind or deployment is performed here.

Preview stays false, default-OFF and PREVIEW_ONLY; wrapper rejects enablement.
No learner accounts, evidence, migration, seed or database connection was created
by this task. Account creation needs separate guard-compatible synthetic scope.

Backup helper encrypts custom pg_dump in AES-256-GCM, authenticated before restore,
outside Git/source, exclusive new file only. Restore refuses nonempty target,
uses one transaction and never --clean/reset/DROP. Key custody and off-Mac backup
are operator responsibilities. Actual dump/restore has NOT_RUN status; crypto unit
tests are not PostgreSQL recovery proof. 64MiB dump limit and table-count comparison
are explicit limits, not a production backup certification.

## Executed evidence — Windows Node24/x64

Final exact commands/exit codes are exported as quality-results.json. Packaging
unit/Compose/crypto tests:29 PASS. Targeted API:69 tests/3 suites PASS. Full API:
722 tests/49 suites PASS. Frontend:22 tests/3 suites PASS. Syntax, lint, typecheck,
production build/catalog, changed-file Prettier, secret/artifact scan and diff
checks must all be zero before export. Packaging-only Nest build was also checked:
dist/src/main.js exists and dist/test is absent. Existing dependencies reused;
no npm install, lockfile update or mass formatting.

Secret scan initially flagged a runtime shell password expansion as a hardcoded
assignment. The helper now uses a POSIX assignment from the existing environment;
scanner/allowlists were not weakened and no real credential was found.

These are Windows checks, NOT new ARM64 image acceptance. Windows has no Docker
builder; existing x86 WSL Podman has no ARM binfmt and was not changed or used.

## Inherited evidence — Owner-provided native baseline

Mac M1/Colima clp-arm64: Linuxaarch64, Node22.23.4, PostgreSQL17.11aarch64,
PrismaCLI/Client6.19.3 native linux-arm64-openssl-3.0.x, npm ci721packages,
real-schema generation, Nest/catalog/Vite builds, all9 migrations, Prisma query,
production API live200 and ready200/database up. Preview OFF/PREVIEW_ONLY.
Runner2CPU/3GiB/20GiB, host34GiB free. This predates the new Dockerfiles and does
not prove the images, Compose, encrypted restore or real-browser workflows.

## Pending acceptance and separate approvals

1. Owner approves packaging before Mac execution. Follow ACCEPTANCE.md M01–M19;
   record image digests/versions, ARM engine loading, health/static assets,
   empty DB migrations, image/context scan, restart persistence and restore checks.
2. Synthetic Teacher/Student account/content provisioning is BLOCKED pending a
   guard-compatible scope. DS01 development/disposable guard must not be bypassed
   for persistent Local Trial. No ad-hoc SQL or pilot credentials. Browser login,
   teacher/student module acceptance are not claimed complete.
3. Trusted local TLS and later private-device access require operator configuration
   and approval. No HTTP login workaround. Tailscale Serve is a proposal, not a
   configured service. Direct LAN exposure remains security-review pending.
4. Colima restart/reboot can affect other workloads; require inventory/maintenance
   approval. No sleep/power/LaunchAgent changes installed. Disk thresholds are
   proposed safety values; image size/RAM footprint remain unmeasured.
5. Moving base-image/apt tags require digest capture and vulnerability review.
   Nginx dynamic resolve requires1.27.3+. Native Prisma pruning, readonly filesystem,
   cert permissions and port forwarding need actual Mac tests.
6. Runtime env remains visible to privileged host/Docker users. PG bootstrap role
   is owner/superuser; production role separation/secret vault are separate scope.
   No certified graceful transaction drain; signal forwarding is not that guarantee.
7. AMD64 rebuild paths are supplied but untested. Current backup CLI targets only
   Mac disposable restore-check; future VPS import/deployment needs separate review.
8. No specialist sign-off, publication approval or learner pilot. Legacy product
   limits remain: global Today queue, no assignment inbox/enrollment UI/completion.

## Preservation

Main and feature HEAD baseline verified; feature index stays empty. Protected
business sources/schema/migrations/lockfile/legacy Compose have no diff.
VI16-file fingerprint is expected to remain
a776a134ef721ca96a14839cf011564c996ee711963cbfa0b35b0af820b77061.
EN/pilot worktrees and preservation ref7572b9e491641848eb2f8feba00fb1221fdeba3d
are read-only checks only. Recovery ZIPs and old packaging ZIP remain preserved.
No pilot process/service/database operations were performed. Stop for Owner review.
