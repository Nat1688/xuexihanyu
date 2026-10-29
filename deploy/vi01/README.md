# VI-01 — Vietnamese-first interface / Owner review

Source baseline: R3a 6f0ba0d39c68a07137aef94c06e2a25c50e33d92.
Branch codex/vi01-vietnamese-first in isolated XueXiHanyu-VI01 worktree.
No stage, commit, Main merge, push or deployment. Existing Mac services/accounts/
database/secrets were not contacted or changed. M06 remains separate/uncommitted.

## Behavior / translation boundary

Vietnamese is the only release UI, regardless of browser/account/OS language.
HTML lang=vi, browser title, navigation, loading/errors, authentication screens,
Teacher classes/roster/records/forms/assignment notices, Student Today/exercise/
results/retries and preview labels are Vietnamese. ui-vi.ts is the small shared
catalog/config boundary for common labels, enums, errors, validation and vi-VN
date/number presentation; feature copy stays alongside its component. No runtime
i18n dependency, detection, locale storage, English fallback UI or English branch
is added. A future en catalog/feature-copy extraction remains a separate task.

Instruction language is independent of UI locale. Preview defaults to VI, even
with en-US browser settings. Its teaching-content selector is labeled in Vietnamese;
choosing English teaching content keeps the interface Vietnamese. EN lesson
content, track contracts, Chinese/Pinyin/examples and original server catalog
are preserved. Content blocks/feedback retain their own language tags. No UI
translation is applied to user-authored course/class names or server learning text.
The same exercise prompts/options/answer values, enum/role codes and CSRF/session
contracts travel over the wire. No mastery/completion behavior is added.

Native validation messages are set in Vietnamese without changing constraints.
Dates use vi-VN and the browser's existing timezone; counts/percentages use vi-VN.
Native browser date/time picker chrome may still follow OS conventions; replacing
that control is outside scope. Error messages hide raw backend/private strings.

## WIP reuse and preservation

The 16-file Vietnamese WIP was read, not moved/stashed/committed. Baseline-compatible
screen/Teacher translations, ui-vi helper and tests were selectively reused;
App translation hunks were applied onto current App so LC03C preview additions
and PR01 pending-mutation protection remain intact. Historical WIP report was not
copied as current evidence. Existing browser selectors were updated to Vietnamese;
their Chinese/English teaching fixtures and assertions were not weakened.

Main remains 8fc28d3, R3a branch remains 6f0ba0d. M06 and original VI/EN worktrees,
localization WIP fingerprints, preservation refs and recovery ZIPs are read-only
preservation checks. No pilot services/databases were used for VI-01 verification.

## Verification and visual evidence

Exact commands/exit codes and file hashes accompany the review package.
Frontend component/client tests cover Vietnamese labels, enum presentation,
localized errors, date/number formatting, native validation, en-US defaults,
Chinese preservation and existing request/CSRF/revision semantics.
Real Chrome runs use real Vite/React with SYNTHETIC API interception only, explicitly
labeled in screenshots/results. They are UI interaction/visual evidence, not live
Mac/DB/production E2E or new server authorization proof.

- Teacher harness: dashboard, classes, roster (waits for loaded student rows),
  progress, assignments, mutation locking, loading/empty/error/retry, 401/403,
  logout failure and role navigation. Desktop, tablet and exact390x844 captures.
- VI01 browser: login/validation, Student Today/exercise/results/logout, network
  retry, empty/unauthorized and preview VI default / EN content with Vietnamese
  UI, pinned revisions and self-check contract. Locale en-US throughout; paired
  desktop/390x844 screenshots, no real credentials/accounts.
- MCQ browser regression: same option order/reload, keyboard/value selection,
  error/retry and stable token; only UI selectors translated.

The first Teacher harness run lacked a synthetic LC03C discovery response. Its
fixture now returns available:false; production discovery/gate is unchanged.
Chrome's installed channel is reused; no browser/dependency download was performed.
Legacy real-stack PR01/LC03B scripts have translated selectors but were not rerun
against a database. API source/schema/catalog are unchanged and existing regression
can be rerun without any database provisioning. Preview is not enabled on Mac.

## ARM64 Web-only package — PREPARATION, not execution approval

Extract the reviewed frozen web-build-source into a NEW Mac directory and verify
the ZIP/source hashes. Do not edit source on Mac. The minimal context includes
real Web sources, root/Workspace manifests and unchanged R3a web Docker/Nginx
inputs; no API business source, DB schema, migrations, credentials or host deps.
The existing Dockerfile builds sequentially with native Node22 and requires its
context-audit stage. API package.json is a build-workspace manifest only.

After separate Owner build approval, with resource checks as in R3a runbook:

```sh
node deploy/vi01/verify-source.cjs
docker --context colima-clp-arm64 build --pull --platform linux/arm64 -f deploy/oci01b2/web.Dockerfile -t clp-vi01-web:review .
docker --context colima-clp-arm64 image inspect clp-vi01-web:review --format '{{.Id}} {{.Architecture}} {{.Config.User}}'
node deploy/vi01/verify-source.cjs
```

Expected linux/arm64, USER nginx. Actual VI01 ARM64 image build/runtime is NOT_RUN
on Windows. It must pass Mac acceptance/image checks before deployment approval.
No API/PostgreSQL image build or Compose up is part of the build command.

## Future deployment and rollback — execution HOLD

Use the EXACT existing Local Trial Compose file set and private environment,
including active TLS/Tailscale settings; never substitute guessed env/origin/
project values. Do not print rendered config or regenerate secrets. Inventory the
current Web container from labels and record its image ID before any rollout:

```sh
WEB_ID=$(docker --context colima-clp-arm64 ps -q --filter label=com.docker.compose.project=clp-local-trial --filter label=com.docker.compose.service=web)
# Verify exactly one container before continuing; stop on zero/multiple matches.
OLD_WEB_IMAGE=$(docker --context colima-clp-arm64 inspect --format '{{.Image}}' "$WEB_ID")
docker --context colima-clp-arm64 image tag "$OLD_WEB_IMAGE" clp-vi01-web:rollback
```

Owner defines trial_web using their existing private file paths and appends ONLY
this reviewed override last. Example placeholders must be replaced in operator
configuration, not committed source. Existing runtime Compose files need to remain
in their original location so their relative paths keep resolving correctly.

```sh
trial_web() { docker --context colima-clp-arm64 compose --env-file /EXISTING/PRIVATE/trial.env -p clp-local-trial -f /EXISTING/COMPOSE/compose.yaml -f /EXISTING/COMPOSE/compose.local-trial.yaml -f /REVIEWED/VI01/deploy/vi01/web-only.override.yaml "$@"; }
export VI01_WEB_IMAGE=clp-vi01-web:review
trial_web config --quiet
# ONLY after explicit deployment approval:
trial_web up -d --no-deps --no-build --pull never web
```

If the existing file set includes another TLS/runtime overlay, retain it before
the Web-only override. Verify exact resolved Web image and unchanged API/DB image
IDs/volume mounts without dumping secrets. Preserve those before/after receipts.
Check Web health, existing HTTPS origin, Vietnamese Teacher/Student UI, auth/logout
and preserved exercise/session behavior. Use existing test accounts privately;
do not provision, seed, enroll, reset, migrate or alter accounts for this rollout.

Rollback uses the captured OLD image, the SAME files/env and Web-only command:

```sh
export VI01_WEB_IMAGE=clp-vi01-web:rollback
trial_web config --quiet
trial_web up -d --no-deps --no-build --pull never web
```

Do not run down, down -v, volume removal, remove-orphans, API/migrate targets or
prune. This replaces only Web; it grants no account/data/network/preview changes.
Never overwrite the rollback image during the review/observation window. Browser
refresh fetches no-store SPA assets; no locale/account migration is required.

## Remaining risks / gate

Mac ARM64 build, live existing-account HTTPS validation and rollback rehearsal
remain pending. Source-authored EN teaching content can still intentionally appear
inside its selected variant; this is not English UI. Preview stays default-OFF
and PREVIEW_ONLY with publication approvals still outstanding. No new UI language
switch or English release is shipped. Stop for Owner independent review.
