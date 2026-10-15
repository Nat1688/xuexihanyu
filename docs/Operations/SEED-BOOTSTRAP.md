# Seed & ADMIN Bootstrap (CLP-00-11)

Two **operator-invoked, guarded** commands populate identity rows. Neither runs
automatically at application startup, and neither creates any learning-domain
content (no profile, class, enrollment, content or exercise data).

- **Synthetic seed** — deterministic local-development fixtures.
- **ADMIN bootstrap** — create the single initial production ADMIN.

> Nothing here contains a real credential. The seed's passwords are derived
> deterministically at runtime and live only in a local `clp_dev`/`clp_test`
> database; the bootstrap secret is read from your git-ignored local `.env`.

## Safety rules (enforced in code)

The shared guard `scripts/seed/seed-guard.cjs` is the single source of truth:

1. **Seed target** is allowed ONLY for a recognised **local** host whose database
   is exactly `clp_dev` or `clp_test`. Any other database (e.g. `clp_prod`) or any
   non-local host is refused.
2. **Synthetic namespace** — every seeded login ends in the reserved
   `@example.invalid` domain (RFC 2606/6761, non-deliverable), so seeded
   identities can never collide with a real address.
3. **Bootstrap target** must be a recognised **local** host; the login must come
   from `CLP_BOOTSTRAP_ADMIN_LOGIN`; the secret from the git-ignored local env.
4. **Bootstrap refuses** when ANY `ADMIN` role membership already exists — it
   never replaces or resets an existing admin.
5. No password is ever hard-coded, echoed to stdout, or committed. Only hashes
   are written (scrypt, in the exact encoding the API verifies).

## Synthetic seed

```bash
npm run seed:dry-run            # preview against clp_dev (no writes)
npm run seed:dev                # seed clp_dev
npm run seed:test               # seed clp_test
# direct: node scripts/seed/db-seed-synthetic.cjs [--env dev|test] [--dry-run]
```

The frozen fixture set (roles/states only; no domain content):

| Login (namespace `@example.invalid`) | Roles     | State      |
| ------------------------------------ | --------- | ---------- |
| `admin`                              | `ADMIN`   | `ACTIVE`   |
| `teacher.one`                        | `TEACHER` | `ACTIVE`   |
| `teacher.two`                        | `TEACHER` | `ACTIVE`   |
| `student.one`                        | `STUDENT` | `ACTIVE`   |
| `student.two`                        | `STUDENT` | `ACTIVE`   |
| `student.pending`                    | `STUDENT` | `PENDING`  |
| `student.disabled`                   | `STUDENT` | `DISABLED` |

Properties:

- **Deterministic** — the same fixture always yields the same login/roles/state.
  Passwords are derived at runtime from a fixed, non-secret salt (see
  `scripts/seed/synthetic-fixtures.cjs`); no plaintext password is committed.
- **Idempotent** — a rerun *ensures* the named fixtures (create-if-missing, then
  reconcile roles/state/credential). It never duplicates rows.
- **No overwrite** — it only ever touches the named synthetic fixtures. A
  pre-existing non-synthetic user is left untouched.
- **Hashes only** — credentials are hashed in-process with scrypt using the same
  encoded format the API's `ScryptPasswordHasher` verifies.

## ADMIN bootstrap

```bash
# In your local, git-ignored .env (or the shell):
#   CLP_BOOTSTRAP_ADMIN_LOGIN=you@your-domain.example
#   CLP_BOOTSTRAP_ADMIN_PASSWORD=<at least 8 characters>

npm run bootstrap:admin:dry-run # preflight only (no writes)
npm run bootstrap:admin         # create the initial ADMIN (dev DB)
# direct: node scripts/seed/db-bootstrap-admin.cjs [--env dev|test] [--dry-run]
```

Behaviour:

- Creates the named user with the `ADMIN` role and `ACTIVE` state and a scrypt
  credential, if no ADMIN exists.
- If the named user already exists (but no ADMIN does), it promotes/ensures that
  user to an ACTIVE ADMIN and (re)sets its credential.
- **Refuses** (exit 1, no writes) when: any ADMIN membership already exists; the
  login is missing/blank; the secret is missing or shorter than 8 characters; or
  the target host is non-local.

## Verification

- Unit tests (no DB): `apps/api/test/protected/seed-guard.spec.ts`.
- Live-DB tests (skip when `clp_test` is unavailable):
  `apps/api/test/db/synthetic-seed.int-spec.ts` (idempotency + no-overwrite) and
  `apps/api/test/db/bootstrap-admin.int-spec.ts` (refusals).
- Run the live suites with `npm run test:integration`.
