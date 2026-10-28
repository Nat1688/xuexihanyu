# Mac mini First — OCI-01B2 packaging

Owner directive: prepare and verify packaging on Windows in the dedicated worktree;
Mac mini M1 is the runtime/acceptance host only. No cloud, pilot or deployment is
authorized here. No source editing on Mac. Main remains8fc28d3.

- **Start here:** [Mac Local Trial runbook](MAC-LOCAL-TRIAL.md).
- [Runtime secrets template](local-trial.env.template): blank secret fields only;
  copy outside source and retrieve actual values privately at runtime.
- [Backup/restore and portability](OPERATIONS.md).
- [Owner acceptance checklist](ACCEPTANCE.md).
- [Current evidence and remaining approval gates](REVIEW.md).
- [Disposable-only old workflow](DISPOSABLE.md); never adopt its volume as Local Trial.

Three identities are intentionally disjoint:

| Purpose                | Compose project   | Database/role     | Docker volume                  |
| ---------------------- | ----------------- | ----------------- | ------------------------------ |
| Disposable packaging   | clp-oci01b2       | clp_oci01b2       | clp-oci01b2_pg17-data          |
| Persistent Local Trial | clp-local-trial   | clp_local_trial   | clp-local-trial_pg17-data      |
| Fresh restore check    | clp-restore-check | clp_restore_check | clp-restore-check_restore-pg17 |

Only static/proxy ports bind loopback; no database host port in any profile.
Local Trial db/api/web restart unless-stopped; migration remains one-shot.
Images default LinuxARM64; LinuxAMD64 is an explicit rebuild using the same source,
native Prisma generation and unchanged lock. No Windows node_modules/dist copied.

Production-mode cookie/CSRF rules remain unchanged. HTTP is health/static smoke only;
authenticated use requires trusted HTTPS or separately approved private TLS termination.
Preview remains OFF, PREVIEW_ONLY. Synthetic account/demo provisioning is BLOCKED
pending guard approval; no account/seed script was added. No schema, migration,
business logic, Main/checkpoint or learning-track changes are included.

Review ZIP includes a frozen **mac-build-source/** tree generated on Windows. Copy
and extract that immutable tree on Mac, verify its manifest and build there; report
failures back to this Windows worktree. Do not patch/edit source on Mac or push images.
