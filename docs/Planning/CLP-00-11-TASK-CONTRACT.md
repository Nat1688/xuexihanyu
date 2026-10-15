# Task Contract — CLP-00-11 Bootstrap & Seed

**Status:** Accepted by Owner — implementation may proceed only within this bootstrap/seed scope.

## Scope

- Deterministic synthetic seed command for `clp_dev`/`clp_test` only.
- Seed users have explicit `example.invalid` login namespace, known synthetic roles and password hashes generated at runtime.
- Idempotent: rerun updates/ensures only named synthetic fixtures, never overwrites non-synthetic user data.
- Separate production ADMIN bootstrap command requiring explicit `CLP_BOOTSTRAP_ADMIN_LOGIN` and secret input from ignored local env; refuses if any ADMIN role membership exists.

## Security

- No hard-coded production password or real seed credential in source/README/log.
- Refuse any non-local/non-clp_dev/non-clp_test seed target.
- Bootstrap cannot run automatically at startup and never replaces an existing admin.

## Acceptance

- Synthetic seed idempotency and no-overwrite tests.
- Bootstrap refusal when admin exists/missing secret/unsafe target.
- Password hashes only; secret scan and full quality/migration gates pass.
- No public registration/reset/email/role admin UI/domain content seed.
