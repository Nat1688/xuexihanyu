# OCI-01B2 R2 — build-context correction

Correction parent: a09ea0c4bf742fa8e0390a818a4e4843519dc817.
Application/Main baseline: 8fc28d3a45539c2de5ddb14b94c3a4f9127e0194.
Uncommitted correction for Owner review. No Main change, push or deployment.

## Root cause and evidence

Owner executed R1 frozen-source verification successfully (228 files), then
BuildKit context-audit failed on deploy/oci01b2/ACCEPTANCE.md. R1 M02 is FAIL;
neither its image build nor audit has an accepted PASS result. R2 M01–M03 are NOT_RUN.

The old .dockerignore began with ** but negated directories such as !deploy/ and
!deploy/oci01b2/. Docker patterns also match parent directories; an included
parent re-includes descendants. Subsequent file exceptions do not narrow that
directory inclusion. The same weakness affected apps and prisma directories.
The audit rejected documentation correctly; it has NOT been relaxed or changed.
[Docker matching rules](https://docs.docker.com/build/concepts/context/) and
[parent-match implementation](https://github.com/moby/patternmatcher/blob/main/patternmatcher.go).

## Minimal correction

- Remove directory exceptions. Re-include only manifests/config, TS/TSX/CSS source,
  reviewed migration SQL/lock, schema and the exact packaging build inputs.
  Later exclusions still remove secret/artifact/test paths. No generic migrations
  directory exception or SQL re-inclusion after secret exclusions remains.
- API and web Dockerfiles each have context-audit -> successful marker -> read-only
  BuildKit bind mount into their dependency/build stage. API runtime and migration
  targets depend transitively on that stage; web runtime copies from its audited
  build stage. Direct final-target builds and Compose therefore require audit.
  No full context or marker is copied into final runtime images. Cache may reuse
  an audit for identical context; context changes invalidate its COPY/RUN input.
- Regression tests reproduce the R1 directory leak, exercise allowed/forbidden
  paths, project all repository build inputs through the unchanged audit, and
  verify mandatory Dockerfile stage dependencies. The test matcher supports only
  the restricted patterns in this .dockerignore; it is NOT Docker/BuildKit proof.
- Export/verification helpers now accept the existing checkpoint as parent and
  create a separate R2 package, cumulative patch and incremental correction patch.
  Old reviewed ZIP/source stay intact. Business source/schema/migrations/Preview
  Gate, Compose/proxy/auth configuration and dependency lockfile are unchanged.

## Windows verification

Exact commands/results are in exported quality-results.json. Required gates:
packaging (including context regression), targeted API, full API, frontend, lint,
typecheck, build/catalog, syntax, Prettier, secret scan and diff checks.
All must exit zero before the exporter permits packaging. This is Windows Node24
evidence only. Docker context filtering, ARM64 image build and image audit for R2
remain NOT_RUN. No previous audit outcome is reused as a PASS.

## Mac execution — M01–M03 only, after R2 Owner approval

Verify the NEW ZIP SHA-256 supplied in handoff. Extract into a NEW directory, enter
mac-build-source. Do not overlay R1 or edit source on Mac. Write sanitized evidence
outside frozen source; verify before and after. Do not run npm install on the host.

```sh
node deploy/oci01b2/verify-source.cjs
docker --context colima-clp-arm64 info --format '{{.Architecture}}'
docker --context colima-clp-arm64 compose version
colima status --profile clp-arm64
colima ssh --profile clp-arm64 -- df -h /
df -h .
docker --context colima-clp-arm64 system df
```

Require ARM64/aarch64 and correct profile; HOLD below proposed 8GiB VM free/10GiB
host free. No prune, resize, VM restart or other workload interruption authorized.
Use an interactive shell without tracing/transcripts. Audit canaries below are
fresh random test values, not trial credentials, and must never be printed/saved.

```sh
export CLP_PLATFORM=linux/arm64
export CLP_DB_PASSWORD=$(openssl rand -hex 32)
export CLP_SESSION_SECRET=$(openssl rand -hex 32)
export CLP_CSRF_SECRET=$(openssl rand -hex 32)
```

Run each command separately and STOP immediately on nonzero exit. Context audit
must finish before continuing; final builds also require it independently.
--no-cache forces a new audit execution for this acceptance, rather than accepting
an old cached audit. Resource use is sequential on the 2CPU/3GiB profile.

```sh
docker --context colima-clp-arm64 build --pull --no-cache --platform linux/arm64 --target context-audit -f deploy/oci01b2/api.Dockerfile -t clp-oci01b2-context-audit:review .
docker --context colima-clp-arm64 build --pull --no-cache --platform linux/arm64 --target runtime -f deploy/oci01b2/api.Dockerfile -t clp-oci01b2-api:review .
docker --context colima-clp-arm64 build --pull --platform linux/arm64 --target migrate -f deploy/oci01b2/api.Dockerfile -t clp-oci01b2-migrate:review .
docker --context colima-clp-arm64 build --pull --no-cache --platform linux/arm64 -f deploy/oci01b2/web.Dockerfile -t clp-oci01b2-web:review .
node deploy/oci01b2/audit-images.cjs
node deploy/oci01b2/verify-source.cjs
unset CLP_DB_PASSWORD CLP_SESSION_SECRET CLP_CSRF_SECRET
```

Record new context-audit file count, commands/exit codes, image IDs/native platform
and audit results. A failure stops execution: report sanitized evidence to the
Windows feature worktree. Never patch on Mac or continue into runtime commands.
Audit uses transient network-none probe containers only; no API/DB service starts.

M04 onward remain unauthorized. No compose up, migrations, seed, persistent Trial
database, accounts, LAN/Tailscale/public access, preview enablement or cloud action.
M07–M09 remain BLOCKED pending valid synthetic provisioning and separate approval.
Moving base tags, unmeasured resource footprint and native runtime acceptance are
still residual risks. No new architecture, dependencies or product contract change.
