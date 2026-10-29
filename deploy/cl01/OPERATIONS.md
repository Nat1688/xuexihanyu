# CL-01 deployment assessment — NOT AUTHORIZED TO DEPLOY

This review depends on the approved R3a checkpoint plus the reviewed27-file
VI-01 source overlay. Original M06, VI-01, learning tracks and Main are preserved.
This is not a Web-only update: it needs new API/Web images and additive migration10.

## Before any Mac update

1. Obtain separate Owner approval for commit, image builds, migration and rollout.
2. Record exact current images/Compose config and verify disk capacity. Preserve
   the existing database volume, accounts, secrets and services. Do not reseed.
3. Quiesce writers using the approved operational procedure. With the existing
   nine-migration version of backup tooling, create an encrypted backup outside
   source and verify a restore into a separately approved empty disposable DB.
4. Build API/Web sequentially on Linux ARM64 using the existing hardened
   Dockerfiles/context audit. No Windows node_modules enters the image. Confirm
   Preview remains OFF and PREVIEW_ONLY; keep existing private HTTPS routing.
5. Only on the separately approved Local Trial target: deploy migration10 using
   the reviewed migration job. Never run migrate reset/dev or drop the volume.
6. Roll out the matching API/Web pair. Check health, Teacher ownership, invitation
   rotation/revoke/join, existing-account enrollment, roster, assignment and CP-05
   answer/recovery. Verify counts/fingerprint with the new10-migration tooling.

M06 provisioning remains unchanged and intentionally refuses a10-migration
database. It must not be rerun or bypassed after CL-01. This task creates no
production accounts and does not modify previously provisioned credentials.

## Rollback

Keep migration10 and invitation data intact, restore the previous API/Web image
pair/config, and leave the volume mounted. The previous application ignores the
new table. Do not run an old migration job against the newer schema, and do not
use old nine-migration backup tooling to validate a10-migration backup. Existing
enrollments created by CL-01 remain ordinary CP-06 enrollments; code rollback
does not erase them or learning evidence. A database restore is a separate
Owner-approved incident procedure into a new empty target, not an automatic down
migration. Keep the backup tool version matching each encrypted backup.

## Reproduce approved Windows tests

Use an existing PostgreSQL17.11 installation and an existing Playwright/Chrome
runtime. No package/dependency install is performed by this task.

```powershell
npm run db:generate
npm run test -w @clp/api -- --runInBand --testPathPatterns="classroom|student-service"
npm run test -w @clp/web -- --runInBand
npm run build
$env:CL01_DISPOSABLE_APPROVAL='APPROVED_55440_3112_5199'
$env:CL01_RUN_ID='08' # choose an unused two-digit run directory; never overwrite
# NODE_PATH must point to the operator's existing Playwright installation.
node deploy/cl01/realstack.cjs
```

The harness refuses an existing run directory, occupied ports or a .env file in
its worktree. It verifies PostgreSQL major/database/user/data-directory and an
empty schema before migrations. All account passwords are random in memory and
hashed by the existing ScryptPasswordHasher. Fixtures are explicitly synthetic
integration data, not a DS-01/M06 runtime provisioning mechanism. It never bypasses
those guards. Each attempt retains its stopped database and sanitized reports;
only its own API/Vite/browser/cluster processes are stopped. Never use this harness
to resume or operate the Mac database.

This is Windows native PostgreSQL/Chrome evidence, not ARM64 Docker or Mac HTTPS
deployment certification. Chrome's Secure-cookie loopback exception is used in
NODE_ENV=test; HTTPS/Secure-cookie transport must be rechecked on the approved
Mac origin before a future release. No network exposure or gate change is made.
