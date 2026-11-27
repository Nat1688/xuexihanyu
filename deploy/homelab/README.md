# Homelab release runbook (xuexihanyu.online)

Target: `nam@<homelab-tailscale-ip>` (`vaio-homelab`, Linux amd64, reachable over Tailscale), Docker Compose project
`clp-homelab`, services `web` (nginx, `127.0.0.1:8083`), `api` (NestJS) and `db` (PostgreSQL 17). Public HTTPS
terminates in front of `127.0.0.1:8083`. Releases live under `/home/nam/apps/xuexihanyu-releases/<name>/`.

The only supported source for a release is a **commit that has been pushed to GitHub**. `ship.sh` sends
`git archive <sha>` (LF line endings), so ignored files, worktrees, `node_modules`, `dist` and `.env` can never
enter a release. Images are built on the homelab from that source with `deploy/oci01b2/*.Dockerfile`; no image
is layered on a previous production image.

## Files

- `compose.override.yaml` — byte-identical copy of the server file
  `/home/nam/apps/xuexihanyu-homelab/deploy/homelab/compose.override.yaml` (second file of the live compose
  chain; defines project `clp-homelab`, port 8083, profile `homelab`). The live chain still points at the
  server copy; keep both identical.
- `release.py`, `ship.sh`, `verify-public.cjs` — see below.

## Hard rules

- `release.py` never runs migrations, never touches the `db` service, env files, volumes or secrets, and never
  deletes images. If `preflight` reports `MIGRATION_REQUIRED`, stop: a schema change needs explicit Owner
  approval, a verified backup and a separate, reviewed migration procedure (the `migrate` target of
  `api.Dockerfile`). Do not improvise one.
- Each phase refuses to continue if the running containers changed since `preflight`.
- Rollback restores the previous **images**; it never restores the database.
- Never run `docker compose` against `clp-homelab` without the full `-f` chain that the containers' labels
  record (`release.py` reads it from `com.docker.compose.project.config_files`). Running the base file alone
  would silently recreate containers from older images.

## Requirements

Workstation: git, bash (Git Bash on Windows), OpenSSH with the deploy key `~/.ssh/id_ed25519_xuexihanyu`
(override with `XUEXI_SSH_KEY`), Node.js 22+ for `verify-public.cjs`, Tailscale up.
Homelab: Docker with BuildKit + Compose v2, python3, network access to Docker Hub for base images
`node:22-bookworm-slim` and `nginx:stable-bookworm` (cached copies are used when present).

## Procedure

```sh
# 0. on the workstation, in a clean checkout of the branch you are releasing
git status                                    # must be clean
git push origin HEAD                          # ship.sh refuses unpushed commits
NAME=rel-$(date -u +%Y%m%dt%H%M%Sz)           # lowercase letters, digits, dots, dashes
export XUEXI_SSH_TARGET=nam@<homelab-tailscale-ip>   # address supplied privately by the Owner
deploy/homelab/ship.sh "$NAME"
SSH="ssh -i ~/.ssh/id_ed25519_xuexihanyu -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes nam@<homelab-tailscale-ip>"
R=/home/nam/apps/xuexihanyu-releases/$NAME
REL="python3 $R/src/deploy/homelab/release.py"

# 1. baseline: pin the image IDs you expect to be running (from the handoff or `docker inspect`)
$SSH "$REL preflight $R --expect-web sha256:... --expect-api sha256:..."
# 2. build both images from source (5-15 min)
$SSH "$REL build $R"
# 3. throwaway candidates on 127.0.0.1:18084/18085, verified, then removed
$SSH "$REL stage $R"
# 4. switch (default api then web; use --services web for a Web-only release)
$SSH "$REL rollout $R"
# 5. checks
$SSH "$REL verify $R"
scp -i ~/.ssh/id_ed25519_xuexihanyu nam@<homelab-tailscale-ip>:$R/build.json /tmp/build.json
node deploy/homelab/verify-public.cjs https://xuexihanyu.online /tmp/build.json
```

Receipts written in the release dir: `preflight.json`, `build.json` (image IDs, base image IDs, Web asset
SHA-256 manifest), `stage.json`, `rollout.json`, `rollout.override.yaml`, `rollback.override.yaml`,
`build-api.log`, `build-web.log`.

## What each check covers

| Phase | Checks |
| --- | --- |
| preflight | web/api healthy; optional pinned image IDs; web still non-root + read-only; applied migrations (read-only `SELECT` from `_prisma_migrations`) equal `prisma/migrations` exactly; live readiness via 127.0.0.1:8083 |
| build | amd64; api runs as `node`, web as `nginx`; no `.env*` file in API image; Web asset manifest |
| stage | candidate API boots with the live env (env file in `/dev/shm`, removed immediately), `/health/ready` = db up, anonymous `/auth/me` = 401; candidate Web serves every asset with matching hash, proxies readiness, anonymous `/api/auth/me` and `/api/dictionary/admin/categories` = 401 JSON (no redirect) |
| rollout | compose config must differ only in `services.api.image` / `services.web.image`; pinned rollback tags `xuexihanyu-{api,web}:rollback-<name>`; health + asset + boundary checks; db container unchanged; automatic rollback on any failure |
| verify / verify-public | live images are this release; same checks through 127.0.0.1:8083 and public HTTPS |

The candidate API in `stage` connects to the production database exactly like the running API does; it
only receives anonymous GET requests. The API process does not migrate on start (`runtime.cjs api`).

## Rollback

```sh
$SSH "$REL rollback $R"        # previous api+web images via rollback.override.yaml
```

Afterwards any manual compose command must end with `-f $R/rollback.override.yaml`. Older releases keep their
own `rollback.override.yaml`; image tags are never deleted by this tool.

Rollback limits: data written by the new version stays in the database. A release that needed a migration
cannot be rolled back by images alone (the old API may not understand the newer schema); that is why
`release.py` refuses migration-bearing releases.

## Line endings and asset hashes

`ship.sh` ships LF sources. The 27/11/2026 production Web was built on Windows from CRLF checkouts, so a
from-source build differs from it only in whitespace inside a few generated files (see the reconciliation
handoff for the exact list). Fonts, images, templates and application behaviour are identical.
