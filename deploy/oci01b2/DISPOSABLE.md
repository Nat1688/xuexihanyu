# Disposable-only reference — superseded as primary guide by MAC-LOCAL-TRIAL.md

This guide is for the old clp-oci01b2 disposable project only. Do not use its project, volume, origin or confirmation for persistent Local Trial. Cloud sections are deferred reference, not authorization.

# OCI-01B2 — Linux ARM64 packaging / Mac Local Trial

Owner-approved baseline8fc28d3a45539c2de5ddb14b94c3a4f9127e0194.
Worktree C:/Users/admin/Documents/XueXiHanyu-OCI-01B2, branch
feature/oci-01b2-arm64-packaging. No Main/checkpoint changes. No Oracle provisioning,
image push, public access, real learner data or learner pilot authorized.

## Task and architecture

Multi-stage API and migration images generate Prisma6.19.3 on LinuxARM64; frontend
build uses fixed VITE_API_BASE_URL=/api and ships only static assets with Nginx.
No Windows node_modules/dist copied. Docker build rejects unsupported architectures/Node versions and
checks the generated linux-arm64-openssl-3.0.x engine exists. Packaging-only API
tsconfig keeps dist/src/main.js while excluding tests from context/output.
apps/api/package.json main/start corrected to that actual path; no dependency or
lockfile changes. Existing root Compose16-alpine remains unchanged.

```text
Mac HTTPS localhost:18443 (external trusted cert, optional TLS override)
  → web:8443 → /api/ strips prefix → api:3000 → db:5432
Mac HTTP 127.0.0.1:18080 → web:8080 (HTML/health smoke only)
```

Only web ports bind host loopback. API/DB have no host port; DB network is internal.
Persistent named pg17-data is isolated by project clp-oci01b2. Migration target
clp_oci01b2/role clp_oci01b2 on db:5432, PG17 is verified before migrate deploy.
Explicit synthetic confirmation required. API waits for migration success; web
waits for API database=up. No automatic seed/account creation, DB reset or cleanup.

API always runs NODE_ENV=production with Secure cookies, SameSite=Lax, host-only,
session HttpOnly and existing CSRF cookie/header contract. No cookie rewriting,
trust-proxy or business/auth changes. HTTP is NOT approved for authenticated trial;
use HTTPS and trust its cert. localhost browser exceptions are not relied on.
Preview flag hard OFF; original gate/code/catalog remain untouched/PREVIEW_ONLY.

## Mac prerequisites and conflict preflight (commands not executed here)

Use the Owner's existing Colima profile. Do not start/change another profile or
prune images/volumes to make space. Node22 on Mac host is needed for optional
automation scripts; curl/openssl can do basic smoke without host Node. No dependency
installation or root CA installation is automatic in these instructions.

From a clean dedicated snapshot/worktree containing these review changes:

Use the frozen Windows-produced mac-build-source snapshot from the Mac First review ZIP. Extract into a NEW directory; never apply patches or edit application source on Mac.

```sh
docker --context colima-clp-arm64 info --format '{{.Architecture}}'
docker --context colima-clp-arm64 compose version
docker --context colima-clp-arm64 ps --format '{{.Names}}'
docker --context colima-clp-arm64 volume ls --format '{{.Name}}'
docker --context colima-clp-arm64 system df
lsof -nP -iTCP:18080 -iTCP:18443 -sTCP:LISTEN
df -h .
```

Require Linux aarch64/arm64 and modern Compose v2 with health/completion conditions.
If clp-oci01b2 containers/volume already exist, STOP for first-run review. Do not
delete or overwrite them. For resume use the same approved volume and DB password,
not new generated credentials. Mac baseline Colima2CPU/3GiB/20GiB: build sequentially,
monitor disk (host free34GiB is not VM disk capacity), don't auto-prune/resize.

## Runtime secrets — first run only

Use an interactive bash session, not traced CI/set -x. No plaintext .env in repo.
Owner stores DB password in an approved private password manager BEFORE ending the
session; persistent DB needs it on resume. No default account/password is shipped.
Don't paste values in chat, screenshots, logs, compose config output or shell history.

```sh
export CLP_DB_PASSWORD=$(openssl rand -hex 32)
export CLP_SESSION_SECRET=$(openssl rand -hex 32)
export CLP_CSRF_SECRET=$(openssl rand -hex 32)
export CLP_TARGET_CONFIRMATION=OCI01B2_SYNTHETIC_ONLY
export CLP_ORIGIN=https://localhost:18443
dc() { docker --context colima-clp-arm64 compose --env-file /dev/null -p clp-oci01b2 -f deploy/oci01b2/compose.yaml "$@"; }
dc config --quiet
```

Runtime env reaches containers only, never Dockerfile ARG/ENV or Vite. API wrapper
constructs DATABASE_URL from encoded runtime credentials and rejects external URL
overrides. Environment secrets are still visible to privileged Docker/host users:
this is a Local Trial tradeoff, not production secret-vault certification.

## Build and context/image audit

```sh
docker --context colima-clp-arm64 build --platform linux/arm64 --target context-audit -f deploy/oci01b2/api.Dockerfile -t clp-oci01b2-context-audit:review .
COMPOSE_PARALLEL_LIMIT=1 dc build --pull
# If shell function is not inherited by your shell's assignment syntax:
# export COMPOSE_PARALLEL_LIMIT=1; dc build --pull
node deploy/oci01b2/audit-images.cjs
```

No --push. Context whitelist excludes .git/.env/keys/dumps/host artifacts/tests.
Context-audit inspects the actual filtered COPY payload, not a guessed Gitignore
interpretation. Image audit checks ARM64, known runtime-secret canaries absent from
env/history/payload and Prisma module-load; it creates only short-lived network-none
audit containers with --rm, never starts API/DB. Do not archive runtime container
inspect/config env. Keep sanitized image IDs, versions and PASS outputs as evidence.

Base tags Node22-bookworm-slim/nginx stable are moving tags, PG17.11 fixed patch;
record actual digests. Digest pinning/OS security patch review is required before
any later staging release. Owner's previously proven Node22.23.4 is baseline
platform evidence, not proof that a new moving-tag build uses exactly that patch.

## Start and read-only smoke

Only after fresh-target preflight and Owner-approved local execution:

```sh
dc up -d --wait web
dc ps -a
curl --fail --silent http://127.0.0.1:18080/api/health/live
curl --fail --silent http://127.0.0.1:18080/api/health/ready
curl --fail --silent http://127.0.0.1:18080/ >/dev/null
node deploy/oci01b2/smoke.cjs http://127.0.0.1:18080
dc exec -T api node -e 'const {buildEnvironment}=require("/app/packaging/runtime.cjs");process.env.DATABASE_URL=buildEnvironment(process.env,"api").DATABASE_URL;const {PrismaClient}=require("@prisma/client");const p=new PrismaClient();(async()=>{try{console.log(JSON.stringify({users:await p.user.count()}))}finally{await p.$disconnect()}})().catch(()=>{console.error("COUNT_CHECK_FAILED");process.exitCode=1})'
```

Expect9 deployed migrations, API live200, ready200/database up, frontend HTML plus
valid JS/CSS, unauthenticated auth/me401, unknown /api route404 JSON not SPA HTML.
No account/answer/learning event created by smoke. Empty fresh DB should have0 users.
Readiness alone is not schema/auth/CSRF proof; check migration job exit and user query.
No commands use existing pilot/clp_dev databases. No seed is required for packaging.

## HTTPS Local Trial (credentials/cert only at runtime)

Owner supplies certificate/key outside repository with SAN localhost and127.0.0.1,
and trusts the issuer in the test browser. Don't disable TLS verification or install
an unapproved root CA. A self-signed cert can be tested by curl --cacert without
changing OS trust. Example to generate a NEW disposable cert in a private directory:

```sh
umask 077
TLS_DIR=$(mktemp -d)
openssl req -x509 -newkey rsa:2048 -nodes -days 7 -subj /CN=localhost -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' -keyout "$TLS_DIR/key.pem" -out "$TLS_DIR/cert.pem"
export CLP_TLS_CERT_FILE="$TLS_DIR/cert.pem"
export CLP_TLS_KEY_FILE="$TLS_DIR/key.pem"
# nginx UID must be able to read the runtime bind mount. For this disposable Mac
# test only: files readable inside a private mode0700 parent (no repo copy).
chmod 644 "$CLP_TLS_KEY_FILE" "$CLP_TLS_CERT_FILE"
dct() { docker --context colima-clp-arm64 compose --env-file /dev/null -p clp-oci01b2 -f deploy/oci01b2/compose.yaml -f deploy/oci01b2/compose.tls.yaml "$@"; }
dct config --quiet
dct up -d --wait web
curl --cacert "$CLP_TLS_CERT_FILE" --fail --silent https://localhost:18443/api/health/ready
NODE_EXTRA_CA_CERTS="$CLP_TLS_CERT_FILE" node deploy/oci01b2/smoke.cjs https://localhost:18443
```

OpenSSL with -addext required; if macOS bundled version lacks it, use an already
approved compatible OpenSSL/cert source, not automatic install or verification bypass.
Keep TLS_DIR for resume, never auto-delete it while the service needs the mount.

Browser URL https://localhost:18443. No users are created by packaging. To test
authenticated trial, Owner must supply an already approved SYNTHETIC STUDENT
account in this new DB or separately approve provisioning. Do not use LP01 credentials
or assume existing Mac proof created accounts. Optional cookie/CSRF smoke (no seed):

The optional auth smoke requires a synthetic @example.invalid login and the same
OCI01B2_SYNTHETIC_ONLY confirmation. It rejects real-address logins by construction.

```sh
read -r -p 'Approved synthetic login: ' CLP_TEST_LOGIN
read -r -s -p 'Synthetic password (not logged): ' CLP_TEST_PASSWORD
export CLP_TEST_LOGIN CLP_TEST_PASSWORD
NODE_EXTRA_CA_CERTS="$CLP_TLS_CERT_FILE" node deploy/oci01b2/smoke-auth.cjs
```

This creates/revokes only an auth session for the supplied test account and verifies
Secure/HttpOnly/Lax/path/host-only cookies, CSRF denial/success and preview discovery
false/direct404. It is not browser UX E2E, learner evidence or pilot authorization.
Successful authenticated trial remains unproven until this evidence is supplied.

## Stop/resume without data loss

Use the same project/files/env and exact saved DB password. `dc stop` / `dct stop`
stop only this stack, preserving named volume. Resume via same `up -d --wait web`;
reviewed migrate deploy reruns idempotently without seed. Never down -v, reset,
db push, volume rm or system prune. Missing password/cert or unexpected existing
resources: STOP, don't regenerate/reset over existing data. No auto-cleanup here.

Wrapper forwards signals, init:true is set, but application has no new shutdown
hooks: graceful in-flight transaction drain is NOT certified; lifecycle changes
require separate Owner approval. Existing CP05 retry/recovery contract unchanged.

## OCI preparation only

compose.oci.yaml uses a separate project and requires CLP_OCI_ORIGIN HTTPS; it raises
resource limits for a future2OCPU/12GB target. It is NOT deployment approval. Keep
host binding loopback (set CLP_HTTP_PORT=18081 for a separate local config test),
terminate private HTTPS externally, preserve /api path and set matching exact
SPA_ORIGIN. No Tailscale/Oracle service is started by these files. Preview still
OFF; cloud gate, secrets/roles/backup/volume provisioning and publication all need
separate review. Do not run OCI overlay on the3GiB Mac profile expecting those limits.
