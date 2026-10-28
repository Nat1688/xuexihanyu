# Local Trial backup, restore and portability

PREPARATION ONLY. No backup/restore/Colima action was run by Codex in this checkpoint.
Mac host Node22+ required for database.cjs; it needs no npm packages. Its Docker
context is deliberately restricted to colima-clp-arm64. No cloud operations now.

## Identities / safeguards

Source: project clp-local-trial, DB/role clp_local_trial, PG17, named
clp-local-trial_pg17-data. Restore: clp-restore-check, DB/role clp_restore_check,
own restore-pg17 volume, internal network, no published ports. Never reattach Trial
volume or former disposable volume. `restore-check` cannot choose Trial as target.

Tool verifies actual database/role/version before operations, refuses nonempty
restore DB, uses pg_restore --single-transaction --exit-on-error --no-owner
--no-privileges. No --clean, CREATE/DROP DATABASE, reset, db push, seed or deletion.
On failure preserve target and evidence; no automatic retry into a populated DB.
Only restore trusted self-created authenticated backups, never third-party dumps.
Trial/restore bootstrap role is currently DB owner/superuser from official image;
production role separation remains future approval, not certified here.

## Backup procedure (maintenance window, source retained)

Owner creates private backup directory outside ANY source/Git tree, retrieves same
CLP_DB_PASSWORD/session secrets required by Compose and a dedicated32-byte hex
CLP_BACKUP_KEY from password manager. Generate the backup key only once with
`openssl rand -hex 32` for a new key version; save it privately, never regenerate on
resume or put in report. Key loss makes encrypted backups unrecoverable.

Stop only Trial writers (api/web), not DB. Confirm no other writers/clients. Tool
refuses backup if api/web/migrate still running; quiet source means the separately
captured counts match the pg_dump snapshot. Existing pilot/other projects untouched.

```sh
export CLP_OPERATION_CONFIRMATION=MAC_LOCAL_TRIAL_ONLY
dt stop web api
node deploy/oci01b2/database.cjs backup /absolute/private/backup-dir/trial-YYYYMMDD.clpbackup
node deploy/oci01b2/database.cjs inspect /absolute/private/backup-dir/trial-YYYYMMDD.clpbackup
# If TLS was in use, resume with dtt (same cert paths/env), otherwise dt:
dtt up -d --wait web
```

File created exclusive/no-overwrite mode0600. Encrypted AES256-GCM payload contains
custom-format logical pg_dump plus creation time, baseline and18 table counts.
Nonce/tag protect integrity; decryption/authentication happens BEFORE a restore
database connection. No plaintext dump file is written by helper. Maximum dump64MiB
(bounded in-memory local-trial helper; encrypted file max96MiB); larger DB requires
an approved streaming backup design, not raising limits blindly on3GiB RAM.

Output only ciphertext SHA/size or minimal counts; no passwords, rows or dump text.
Backups still sensitive: contain auth/session data inside encryption. Retention,
off-Mac encrypted copy, key escrow/access and deletion approval chosen by Owner;
proposed7daily/4weekly within disk budget, not an installed schedule. No automatic
backup scheduler, pruning or data deletion created. Avoid putting backups in review ZIP.

## Disposable restore-check (never Local Trial)

Before first use confirm clp-restore-check project and volume do not exist. If they
exist, HOLD for Owner review—don't delete/reset or use a populated target. The tool
leaves target intact after success/failure, so a second check needs a newly approved
fresh target/cleanup decision, not a silent destructive repeat.

```sh
export CLP_RESTORE_PASSWORD=$(openssl rand -hex 32)
dr() { docker --context colima-clp-arm64 compose --env-file /dev/null -p clp-restore-check -f deploy/oci01b2/compose.restore.yaml "$@"; }
dr config --quiet
dr up -d --wait db
node deploy/oci01b2/database.cjs restore-check /absolute/private/backup-dir/trial-YYYYMMDD.clpbackup
dr stop
```

Prerequisite CLP_BACKUP_KEY is the correct archived key; authentication failure
causes no SQL restore. Expect18 table counts equal source and9 migration rows;
confirm application-relevant synthetic records separately when approved. Row counts
are not exhaustive semantic/file integrity validation, and this is NOT a live app
switch-over rehearsal. Keep source running independently; never point its API at
restore DB automatically. No write was made to source by backup/restore workflow.

Corrupt/wrong-key and nonempty-target refusal checks are required. Don't corrupt
the only backup: test a copied ciphertext in a NEW private file. For nonempty
target repeat restore-check against the successful restore DB and expect refusal,
with identical counts before/after. No DROP/clean behavior.

## Restart / backup storage and future portability

Named volume persists across container restart/recreate and normal Colima stop/start,
but NOT deletion of Colima VM, volume rm/down -v, Docker storage reset or disk loss.
No such deletion commands are part of the runbook. Docker/Colima reinstall isn't a
backup strategy. Store verified encrypted logical backups off-Mac as approved.

Images contain only logical paths (/app, /run/tls), Docker DNS service db and no
Mac/Windows user directory or private-machine address. Runtime TLS/secret paths are
host config, not image layers. Same frozen source supports explicit LinuxAMD64
rebuild: CLP_PLATFORM=linux/amd64, build on approved AMD64 builder with native Prisma
debian-openssl-3.0.x; no schema/lock changes or Windows client copy. ARM and AMD64
build evidence must be separate. Nginx/Postgres image digests are platform-specific.

Database export is PostgreSQL custom logical format wrapped in documented AES-GCM,
not a physical ARM64 data directory. `database.cjs` seal/unseal source is provided,
so another approved Node runtime can authenticate/decrypt the portable payload and
pg_restore it into a fresh approved PG17 target with no ownership/ACL import. The
current CLI deliberately only restores to Mac's isolated check target; future VPS
import tooling/target/roles and secret policy need explicit review before execution.
Do not copy Colima VM disks or PG16/17 physical directories across architectures/
major versions as the migration plan. No VPS/Oracle deployment now.
