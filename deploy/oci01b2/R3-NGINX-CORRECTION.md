# OCI-01B2 R3 — Nginx read-only filesystem correction

R3a test-only correction after Owner HOLD: readiness polling and final assertion
now read dependencies.database, matching the unchanged API response
`{ "status": "ok", "dependencies": { "database": "up" } }`.
Two Windows regressions execute the actual harness expressions: nested up passes;
flat/missing/down/not-configured responses cannot pass. Nginx runtime fix and all
Docker/security behavior remain byte-identical to reviewed R3. Packaging/export
metadata is revised; original R3 frozen package/ZIP is preserved.
R3a affected tests, syntax, formatting, secret scan and diff checks are rerun in
quality-results.json. Full API/frontend/lint/typecheck/build results are inherited
from reviewed R3, not rerun for this test-only correction. Mac R3a remains NOT_RUN.

Parent checkpoint: 446428f0285cd6fb5058637a5bd84a9da542b6bf.
Main/application baseline: 8fc28d3a45539c2de5ddb14b94c3a4f9127e0194.
Uncommitted, unstaged correction; stop for Owner review. No automatic Mac deployment.

## Root cause / minimal runtime diff

Owner reports R2 M01–M03 and M04-A PASS. M04-B: PG17 healthy, migration exit0,
API healthy, web exit1/restarting with mkdir /var/cache/nginx/fastcgi_temp:
read-only filesystem. The volume already exists and must be preserved.

Nginx initializes temporary directories for compiled HTTP upstream modules even
when this application only uses HTTP proxying. PID/client-body/proxy paths were
already under /tmp; FastCGI/uWSGI/SCGI retained image defaults under readonly
/var/cache/nginx. Configure all three explicitly in http context:

```nginx
fastcgi_temp_path /tmp/fastcgi_temp;
uwsgi_temp_path /tmp/uwsgi_temp;
scgi_temp_path /tmp/scgi_temp;
```

These directives override build defaults described in the
[Nginx configuration documentation](https://nginx.org/en/docs/configure.html).
No extra volume/tmpfs, root user, privileged mode, permission workaround or writable
root filesystem is introduced. Compose, USER nginx, cap_drop ALL,
no-new-privileges, loopback ports and database isolation stay byte-identical to R2.
Prisma schema/migrations, API/frontend business source, Preview Gate and secrets
are unchanged. Packaging helper changes only support R3 verification/export.

## Regression evidence and limits

Windows static/unit regression checks all five temp directives and original
Compose/image security settings. Exact commands/exit codes are in exported
quality-results.json. Packaging, targeted/full API/frontend, lint, typecheck,
build/catalog, Prettier, syntax, secret scan and diff checks run on Windows.
These results do NOT prove Nginx runtime startup. Windows has no Docker engine.

nginx-readonly.int.cjs is a REAL Docker integration test, not a mock server:

- Requires explicit confirmation, fixed Colima context, ARM64 and a pre-existing
  healthy clp-local-trial API. Refuses missing/unhealthy API; never creates API/DB.
- Uses a newly built, separate clp-oci01b2-web:r3-review image, pinned by inspected
  image ID for the test. Checks configured USER nginx and native ARM64 metadata.
- Creates one uniquely named --rm probe on ONLY the API's Compose frontend network,
  no host ports, binds or data volumes. Read-only rootfs, nonroot nginx, cap-drop
  ALL, no-new-privileges, /tmp tmpfs, 128MiB/0.1CPU; no restart loop.
- Inspects actual container hardening; verifies nonzero UID, NoNewPrivs, exact
  image Nginx config, all five writable /tmp directories, /proxy-health HTTP200
  and real /api/health/ready HTTP200/database up through Nginx.
- Stops only its own newly created container ID in finally; --rm removes that
  probe only. No compose up/down, migration, seed, volume operation or existing
  container stop/restart. Never prints credentials, full inspect env or raw logs.

R3 real Nginx/Docker integration test: NOT_RUN. R3 ARM64 rebuild/context audit:
NOT_RUN. R2 Owner PASS is inherited platform evidence only; M04-B remains FAIL
until new execution proves otherwise. No claim of repaired running Local Trial.

## Mac independent verification — after Owner approves R3

Verify NEW R3 ZIP SHA; extract into a NEW directory, enter mac-build-source.
Do not edit/overlay R2 or save logs/secrets under frozen source. Confirm resources
and correct clp-arm64 profile as in MAC-LOCAL-TRIAL.md; don't prune or resize.
Keep all persistent volumes and existing services intact.

Run each command separately; STOP on failure:

```sh
node deploy/oci01b2/verify-source.cjs
docker --context colima-clp-arm64 info --format '{{.Architecture}}'
docker --context colima-clp-arm64 system df
colima ssh --profile clp-arm64 -- df -h /
df -h .
docker --context colima-clp-arm64 build --pull --no-cache --platform linux/arm64 -f deploy/oci01b2/web.Dockerfile -t clp-oci01b2-web:r3-review .
CLP_R3_TEST_CONFIRMATION=NGINX_EPHEMERAL_ONLY node --test deploy/oci01b2/nginx-readonly.int.cjs
node deploy/oci01b2/verify-source.cjs
```

Build requires the unchanged fail-closed context audit transitively. Only web is
rebuilt; API/PG/migration images need no rebuild. No secret environment needed for
this build/test and no credentials are passed to the probe. API readiness is a
read-only health query; no learning mutation or database provisioning occurs.
The existing R2 web may continue restarting; this test does not stop/replace it.
If resource pressure prevents testing, HOLD for Owner instead of changing services.

Expected: one real integration test PASS, proxy200/APIready200/database up and
image/config hashes in sanitized output. Preserve evidence outside source. If the
test process is forcibly terminated before finally, inventory the unique
clp-r3-nginx-test-* probe; cleanup requires identifying that test container only,
never broad stop/rm or volume removal. A cleanup failure is a test failure.

Do not run compose up to replace Local Trial automatically. Owner decides that
step after reviewing test evidence. No down -v, reset, volume deletion/recreation,
seed, account provisioning, gate enablement, public access, push or Main merge.
M07–M09 stay BLOCKED. TLS/browser/module/persistence/backup acceptance remain
separate; a health smoke does not prove those workflows.
