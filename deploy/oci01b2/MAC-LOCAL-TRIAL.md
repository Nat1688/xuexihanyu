# Mac mini M1 Local Trial — preparation/runbook

Commands below are for a LATER Owner-approved execution phase. This checkpoint
only prepares them; no Mac deployment, LAN exposure, account creation or pilot now.
Use the frozen mac-build-source tree exported on Windows, verify its manifest/SHA,
extract into a NEW directory. No Git patching, editing application source or fixes
on Mac. Runtime configuration/certs/backups go outside source. Report faults to
the Windows feature worktree. Main8fc28d3 and prior checkpoint stay unchanged.

Verify ZIP SHA from Owner handoff, enter the extracted **mac-build-source/** root,
then run `node deploy/oci01b2/verify-source.cjs` before and after acceptance. No npm
install/build on Mac host source; build only inside Docker. Don't include certificate,
backup, logs or evidence files in the frozen source tree; write them privately elsewhere.

## 1. Operator prerequisites and first-run preflight

Existing Colima profile clp-arm64, Docker Compose v2, Node22+ on Mac host for the
verification/encrypted-backup helpers, curl and compatible OpenSSL. No dependency
installation, profile resize, reboot or root CA installation happens automatically.
Owner baseline proof used Colima2CPU/3GiB/20GiB; host34GiB free is not VM free space.

```sh
docker --context colima-clp-arm64 info --format '{{.Architecture}}'
docker --context colima-clp-arm64 compose version
docker --context colima-clp-arm64 ps -a --format '{{.Names}}'
docker --context colima-clp-arm64 volume ls --format '{{.Name}}'
docker --context colima-clp-arm64 system df
colima status --profile clp-arm64
df -h .
lsof -nP -iTCP:18082 -iTCP:18445 -sTCP:LISTEN
pmset -g
```

Require ARM64/aarch64 on Mac. Review VM disk usage inside the existing profile
(read-only `colima ssh --profile clp-arm64 -- df -h /`). Proposed stop thresholds:
<8GiB free VM disk before builds or <10GiB host disk free: HOLD and Owner chooses
storage plan. These are safety planning values, not measured image footprint.
No automatic prune/delete/resize. Check Docker stats and Mac memory pressure.
Avoid parallel builds and simultaneous heavy workloads with3GiB VM RAM.

If clp-local-trial project/volume already exists, STOP first-run preparation for
review. Do not adopt clp-oci01b2, baseline disposable PG, LP01 or clp_dev volumes.
For resume use the existing Trial identity and SAME stored DB secrets, not newly
generated values. Save approved source/image digest and configuration version.

## 2. Runtime environment (interactive bash, not set -x)

Copy local-trial.env.template to an Owner-private mode0700 directory outside any
source checkout, leaving secrets blank. Source non-secret settings first; retrieve
secrets from an approved password manager at runtime. FIRST RUN ONLY may generate:

```sh
export CLP_PLATFORM=linux/arm64
export CLP_HTTP_PORT=18082
export CLP_HTTPS_PORT=18445
export CLP_ORIGIN=https://localhost:18445
export CLP_TARGET_CONFIRMATION=MAC_LOCAL_TRIAL_SYNTHETIC_ONLY
export CLP_DB_PASSWORD=$(openssl rand -hex 32)
export CLP_SESSION_SECRET=$(openssl rand -hex 32)
export CLP_CSRF_SECRET=$(openssl rand -hex 32)
export CLP_BACKUP_KEY=$(openssl rand -hex 32)
```

Owner saves the values privately before ending the shell. No plaintext passwords
in source, exported review files, terminal transcripts or chat. Never regenerate
DB/backup key on resume. Lose a key/password: STOP, don't reset data. Environment
secrets are visible to privileged host/Docker users; this is not a production vault.
Restarts of existing containers retain configured env in Docker metadata. Recreate
or compose up requires retrieving the same values again.

```sh
dt() { docker --context colima-clp-arm64 compose --env-file /dev/null -p clp-local-trial -f deploy/oci01b2/compose.yaml -f deploy/oci01b2/compose.local-trial.yaml "$@"; }
dt config --quiet
```

Do not print rendered compose config or container env. Project fixes names/networks/
volume separately from disposable. Fixed target checks reject cross-profile DBs,
external DATABASE_URL and preview enablement. `compose.oci.yaml` is not part of dt.

## 3. Sequential build and audit (after execution approval)

```sh
docker --context colima-clp-arm64 build --platform linux/arm64 --target context-audit -f deploy/oci01b2/api.Dockerfile -t clp-oci01b2-context-audit:review .
export COMPOSE_PARALLEL_LIMIT=1
dt build --pull
node deploy/oci01b2/audit-images.cjs
```

Actual Docker context scan, known runtime-secret canary/image checks and ARM
engine load must PASS; do not substitute Windows build results. Record actual
Node/Prisma/Nginx versions, image IDs/digests and source manifest. Nginx upstream
resolve requires1.27.3+ (use current1.28+ stable image); moving tags/OS packages are
a remaining reproducibility risk. No --push. Native Prisma generated in target
image (ARM OpenSSL3, or Debian OpenSSL3 for future AMD64), never host dependencies.

## 4. HTTP health/static smoke — no authenticated use over HTTP

```sh
dt up -d --wait web
dt ps -a
node deploy/oci01b2/smoke.cjs http://127.0.0.1:18082
export CLP_OPERATION_CONFIRMATION=MAC_LOCAL_TRIAL_ONLY
node deploy/oci01b2/database.cjs fingerprint
```

Expect migration job exit0/all9 deployed; live200; ready200/database up; HTML/JS/CSS;
/api unknown path404 not SPA HTML; no API/PG published ports. Fingerprint records
18 table counts and migration ledger SHA, not people or secrets. Empty initial
users is expected: no seed/account creation is included.

## 5. HTTPS and browser login (trusted cert required)

Owner supplies a certificate/key outside source, SAN localhost and127.0.0.1 and
trusts issuer in the browser. Do not disable TLS checks. Optional new self-signed
test cert generation is shown in DISPOSABLE.md; it doesn't install trust. Key must
be readable by Nginx UID through a read-only mount while parent stays private.
Use full absolute runtime paths; don't bake/move key into source or image.

```sh
export CLP_TLS_CERT_FILE=/absolute/private/path/cert.pem
export CLP_TLS_KEY_FILE=/absolute/private/path/key.pem
dtt() { docker --context colima-clp-arm64 compose --env-file /dev/null -p clp-local-trial -f deploy/oci01b2/compose.yaml -f deploy/oci01b2/compose.local-trial.yaml -f deploy/oci01b2/compose.tls.yaml "$@"; }
dtt config --quiet
dtt up -d --wait web
NODE_EXTRA_CA_CERTS="$CLP_TLS_CERT_FILE" node deploy/oci01b2/smoke.cjs https://localhost:18445
```

Browser: https://localhost:18445. No auth-cookie workaround: production Secure,
host-only/Lax cookies, session HttpOnly, readable CSRF cookie echoed in header;
same-origin /api strip-prefix. No CORS wildcard, new auth mechanism or cookie rewrite.

**BLOCKER:** no synthetic STUDENT/TEACHER accounts or class enrollment/content data
are provisioned. Existing DS01 guard is disposable-loopback/development-specific;
it must NOT be bypassed for persistent Trial. Owner must separately approve a
compatible guard/provisioning scope before interactive login/module acceptance.
Do not insert accounts with ad-hoc SQL or reuse pilot credentials/data.

With an independently approved synthetic @example.invalid STUDENT account:

```sh
read -r -p 'Approved synthetic login: ' CLP_TEST_LOGIN
read -r -s -p 'Synthetic password: ' CLP_TEST_PASSWORD
export CLP_TEST_LOGIN CLP_TEST_PASSWORD
NODE_EXTRA_CA_CERTS="$CLP_TLS_CERT_FILE" node deploy/oci01b2/smoke-auth.cjs
```

Real browser Teacher/Student acceptance checklist is in ACCEPTANCE.md; CLI HTTP
smoke is NOT browser evidence. Gate OFF => no Lesson01 preview; don't enable it.

## 6. Restart, persistence and reboot

Before restart, stop user actions/close browsers and capture fingerprint outside
source, then restart only Trial API/web/db or Colima in an approved maintenance
window. Colima restart affects EVERY workload in that profile: inventory other
workloads and get permission first. Don't run restart just to complete a checklist.

```sh
node deploy/oci01b2/database.cjs fingerprint
# Approved Trial-only container restart:
dt restart db api web
dt up -d --wait web
node deploy/oci01b2/database.cjs fingerprint
node deploy/oci01b2/smoke.cjs http://127.0.0.1:18082
```

Compare ledger fingerprint and counts exactly while writers are quiescent. Nine
nonzero migration rows plus checksums/timestamps demonstrate retained DB state
without inventing student data. Later synthetic test records also need persistence
verification after their separately approved creation. No volumes recreated.

Trial restart unless-stopped handles exited containers after Docker returns, not
an unhealthy-but-running process, nor Colima startup/macOS login. Manually stopped
containers stay stopped. Compose dependencies are not re-evaluated by Docker
restart manager; temporary failures may occur, and `up --wait` plus health check
must reconcile. Nginx resolves API via Docker DNS after IP changes.
[Docker restart policy](https://docs.docker.com/engine/containers/start-containers-automatically/).

No auto-start service installed here. Owner chooses login-time startup for the
specific clp-arm64 profile, not generic `brew services start colima` that may use
the default profile. Candidate user LaunchAgent uses installed absolute colima
binary, `start --profile clp-arm64 --foreground`, then separate health reconciliation;
must be reviewed/tested on the actual Mac. FileVault/user login may be required;
unattended power-on readiness is not certified. [Colima autostart](https://colima.run/docs/faq/).

Sleep interrupts runtime/network availability. Owner reviews macOS Energy settings,
AC power, network wake, ventilation and planned update/reboot windows; don't apply
pmset/system settings automatically. Optional supervised temporary sleep inhibition
needs operator choice; do not promise24/7 availability from a sleeping desktop.
[Apple sleep/wake settings](https://support.apple.com/guide/mac-help/set-sleep-and-wake-settings-mchle41a6ccd/mac).

## 7. Windows/iPad access — approval separate from local loopback trial

Preferred future private access: Tailscale client on Mac and Windows/iPad, named
tailnet users/grants restricted to the application, HTTPS Serve on Mac to loopback
http://127.0.0.1:18082. No Funnel, router port-forward, public LB or PG exposure.
After a separately approved access setup, set exact CLP_ORIGIN to the resulting
HTTPS origin and reconcile API/migrate config. Frontend /api remains relative.
Don't set development mode or relax CSRF/CORS. Review tailnet plan/user eligibility,
certificate/DNS metadata and device membership; tailnet identity doesn't grant app
roles. This document does NOT start Serve, join accounts or expose services.
[Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve).

Direct LAN alternative remains security-review pending: approved private host IP/
DNS, trusted HTTPS cert matching it, firewall/source allowlist, Colima forwarding
and scan from both allowed and denied devices. No0.0.0.0/:: bind supplied. Plain
http://Mac-LAN-IP is not an authenticated trial workaround. New LAN override or
remote auth-smoke target requires separate access approval; current smoke tools
intentionally accept loopback only. Mac/iPad/Windows browser proof remains pending.
