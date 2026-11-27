# SEC-01 — Credential Handling Hardening

Date: 27/11/2026, Asia/Saigon. Verification mode: standard. Outcome: application-driven password attribute reflection remediated and automated boundaries verified. Native Chrome saved-password acceptance remains MANUAL / NOT_RUN. Production deployment: HOLD pending explicit Owner approval. No homelab connection, account/password/session mutation or production deployment was performed during SEC-01.

## Root cause and classification

`LoginScreen` shared login/registration fields used React state for password and confirmation, `value={password}` / `value={confirmation}`, and input handlers. React's controlled-input synchronization could write the current secret into the rendered HTML value attribute. A fresh real Chrome context against the exact deployed baseline reproduced reflection after manual input. Owner reported native Password Manager autofill as the trigger on a saved-credential profile; that native-manager behavior was not automatically reproduced here. Synthetic autofill with native input/change events and without events was tested separately.

Classification: targeted credential-minimization hardening, informational/low impact in the observed local-browser context; not a confirmed critical vulnerability, server-side disclosure or remote exfiltration. No claim of protecting a password from the browser's owner, DevTools, a privileged extension or an existing XSS. The live input `.value` and HTTPS request body necessarily contain the password during use. Removing a redundant HTML attribute/React-state copy is not encryption and does not make JS strings securely zeroizable.

## Baseline, branch and local commits

Branch: `fix/sec-01-credential-handling`, isolated worktree `artifacts/sec01-worktree`.

Deployment-compatible baseline: local snapshot `cdd3b3f8b8e84c49d741ce64c5e5116045aae118`, parent `b191d162c4f965d9abf9a3a89a62cf373e9188d7`. This snapshot freezes the already-deployed524-file DICT07-P/UI source, byte-checked against its reviewed manifest, separately from the SEC-01 patch. It is not an additional deployment or a Main merge. Original Main stays `8fc28d3a45539c2de5ddb14b94c3a4f9127e0194`; original four handoff WIP files remain untouched. Importer-v2/migration13 is excluded.

Implementation commit: `9048bd01d65922ed336a2beb646eaeb27a2e49cf`. The finalized report records the implementation SHA after the code checkpoint; documentation is committed separately to avoid a self-referential commit hash. No push is authorized or performed.

## Implementation and before/after

Only production source change: `apps/web/src/screens/LoginScreen.tsx`.

- Login and registration password fields are native uncontrolled inputs, without value/defaultValue props and without password/confirmation React state. No saved credentials initialize them.
- Username is also read from the native form, so password-manager autofill that does not fire a React change event can still submit. The submit button is disabled while busy; empty login/password receive an explicit Vietnamese validation message instead of relying on stale state to enable the button. Existing server validation remains authoritative.
- FormData is read only on submit. Password/confirmation entries are removed from that temporary object; local string references are released after request dispatch and again in finally. The in-flight fetch necessarily holds the serialized credential body until completion. No global store/cache is introduced.
- Password DOM values are cleared after success/failure and when switching login/registration modes. Username remains available for retry. Fields are read-only while submitting, a synchronous ref prevents duplicate submissions, and loading/error/accessibility behavior is preserved.
- Login keeps `type=password`, name=password, autocomplete=current-password. Both registration fields use new-password; confirmation now has the correct confirmPassword name. Username keeps autocomplete=username. No autofill/password-manager blocking or custom client cryptography.
- Password bytes are not trimmed; username trim and JSON request payloads are preserved. Existing API client, backend, cookie policies, CSRF, RBAC, migrations, schema, dependencies and Nginx/Docker runtime source are unchanged.

Before: ordinary typing or React-observed autofill could copy the password into a value attribute. After: typing, simulated autofill and validation/busy rerenders leave that attribute absent. The DOM property remains readable during entry as expected.

## Credential exposure audit

| Surface                           | Evidence and result                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial HTML                      | Static render and real Chrome: empty password, no value attribute. No app-prefilled credentials.                                                                                                                                                                                                                                                                                                              |
| Typing/autofill                   | Baseline reflection reproduced; patched Chrome UI13checks pass, including property-only autofill and input/change-event autofill. These are simulated autofill tests, not native Chrome Manager tests.                                                                                                                                                                                                        |
| POST requests                     | Existing `/auth/login` and `/auth/register`, JSON body only; no credential URL/query parameter. Exact password including whitespace/Unicode preserved. Client uses include/no-store.                                                                                                                                                                                                                          |
| Responses                         | Controller returns allow-listed publicId/login/roles only. Real success/failure/register/me/logout responses contain no plaintext password or hash fields. Logout204 has no response body by HTTP contract.                                                                                                                                                                                                   |
| Registration internal return      | RegistrationService returns login/password internally only to AuthController.login for immediate login. This object is not the HTTP response. No backend change was needed.                                                                                                                                                                                                                                   |
| Persistence                       | Existing scrypt N32768/r8/p1/keylen32, random16-byte salt, constant-time comparison. Salted hashes differ for the same password and verify correctly. Plaintext is not a DB column. Existing hashes/accounts remain compatible.                                                                                                                                                                               |
| Browser storage                   | Fresh-context UI and real-stack tests: password absent from localStorage/sessionStorage, app cookies and IndexedDB; no credential IndexedDB database created. Existing exercise sessionStorage stores only session IDs, not credentials.                                                                                                                                                                      |
| Cookies                           | Opaque session token remains Secure/HttpOnly/SameSite=Lax under NODE_ENV=test/production; readable CSRF cookie is the existing double-submit proof, not a password. Real HTTPS cookie/session/logout tests pass. No claim that an authenticated browser has no session credentials.                                                                                                                           |
| Console/logs/errors               | Auth source has no password console/telemetry writes; API client does not log bodies. StructuredLogger/redaction tests cover password, confirmPassword, credential objects and keyed error strings. Captured real-stack logs and browser console contain neither the synthetic password nor stored hash. This is bounded evidence, not a guarantee for arbitrary future logging or an exhaustive system scan. |
| Telemetry                         | No analytics/error-reporting sink in the inspected credential form/client/auth path. No sendBeacon/storage callback added.                                                                                                                                                                                                                                                                                    |
| XSS                               | Credential form uses React text rendering and no dangerouslySetInnerHTML. Existing session HttpOnly policy and nosniff preserved. No CSP is configured in the inspected Nginx source; report-only future hardening, not changed in SEC-01. An XSS could still read a live password input.                                                                                                                     |
| Password change/reset/admin forms | Not implemented in the current frontend/auth route surface. N/A, not invented or represented as tested. Existing operator CLI provisioning is unchanged.                                                                                                                                                                                                                                                      |

No server-side password disclosure was found in the inspected normal flows. No real saved credential profile, `.env`, production log, password or token was read. Browser-generated/extension-managed DOM behavior remains outside the application's ability to make DevTools inaccessible.

## Files changed

1. apps/web/src/screens/LoginScreen.tsx — sole runtime change.
2. apps/web/test/credential-handling.spec.tsx — initial HTML and transport contract.
3. apps/web/test/credential-browser.cjs — before/after Chrome UI regression with explicitly mocked auth responses for isolated UI edge cases.
4. apps/api/test/protected/credential-handling.spec.ts — existing hash/error/log boundaries.
5. deploy/dictionary/disposable.cjs — optional SEC-01 acceptance hook and private temporary output root; original dictionary assertions retained.
6. deploy/security/credential-acceptance.cjs — real form/API/PG/storage/log/session checks.
7. deploy/security/https-fixture.cjs — test-only HTTPS loopback transport using existing OpenSSL, fresh temporary certificate, no application/runtime TLS changes.
8. docs/Planning/SEC-01-TASK.md — approved scope, baseline, contracts and acceptance.
9. docs/security/SEC-01-CREDENTIAL-HANDLING.md — this report and runbooks.

## Automated verification

| Command / scenario                                                                                                 | Result                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm test -w @clp/web -- credential-handling.spec.tsx                                                               | 2/2 PASS                                                                                                                                                                     |
| npm test -w @clp/api -- --runInBand credential-handling.spec.ts identity-auth.e2e-spec.ts                          | 11/11,2suites PASS                                                                                                                                                           |
| SEC01_BASELINE=1 node apps/web/test/credential-browser.cjs                                                         | Baseline reflection REPRODUCED in Chrome, synthetic-only, masked screenshot                                                                                                  |
| SEC01_BASELINE=0 node apps/web/test/credential-browser.cjs                                                         | 13/13 UI scenarios PASS, including validation, failure/success, simulated autofill, mode switch, busy/double-submit, session/logout, network failure, storage/log/URL checks |
| npm test -w @clp/web                                                                                               | 95/95,14suites PASS                                                                                                                                                          |
| npm test -w @clp/api -- --runInBand                                                                                | 831/831,59suites PASS                                                                                                                                                        |
| npm run lint; npm run typecheck                                                                                    | API/Web PASS                                                                                                                                                                 |
| npm run build -w @clp/api                                                                                          | PASS, catalog PREVIEW_ONLY                                                                                                                                                   |
| npm run build -w @clp/web                                                                                          | PASS; first sandbox invocation failed esbuild parent-directory AccessDenied, same command outside sandbox passed without code/dependency change                              |
| node --test deploy/dictionary/packaging.test.cjs deploy/oci01b2/packaging.test.cjs deploy/oci01b2/context.test.cjs | 71/71 PASS                                                                                                                                                                   |
| SEC01_ACCEPTANCE=RUN_ON_APPROVED_DISPOSABLE node deploy/dictionary/disposable.cjs                                  | Final sec01-r03:29/29 steps PASS,26 dictionary/publication/learning-isolation assertions plus3 SEC real-stack steps                                                          |

Real stack uses a newly created PostgreSQL17.11 at127.0.0.1:55441/clp_dict_test, API3116, Vite5206, plus temporary HTTPS proxy5210 loopback only for Secure-cookie tests. Database/user/identity/empty-target checks retained; synthetic accounts only. All owned services stopped afterward; failed runs preserved. No homelab target. Native production Docker image build/runtime and live authenticated UAT were NOT_RUN in SEC-01.

Reproduction commands (PowerShell; prepare a private temporary evidence directory first):

```powershell
$env:PLAYWRIGHT_MODULE = '<existing installed Playwright module path>'
$env:SEC01_EVIDENCE_DIR = '<private temporary evidence directory>'
$env:SEC01_BASELINE = '0'
node apps/web/test/credential-browser.cjs

$env:DICT_DISPOSABLE_APPROVAL = 'APPROVED_55441_3116_5206'
$env:DICT_RUN_ID = '<new unique SEC01 run ID>'
$env:SEC01_TEMP_ROOT = '<private temporary output root>'
$env:SEC01_ACCEPTANCE = 'RUN_ON_APPROVED_DISPOSABLE'
$env:DICT_SOURCE_FILE = '<Owner corpus file whose SHA256 matches existing harness>'
node deploy/dictionary/disposable.cjs
```

The HTTPS fixture reopens the disposable Nest app with the exact HTTPS SPA_ORIGIN and same existing Secure-cookie policy, serves Vite with `/api`, and uses a temporary self-signed certificate. Browser ignoreHTTPSErrors applies only to that local certificate; no production certificate verification claim. No API mocking is used in the29-step real-stack run. UI13-step tests deliberately mock auth to exercise network failures/loading; they are not represented as backend proof.

Test-support failures were corrected, not hidden: initial backend test missed the required AuthenticationFailedError reason; busy-button locator used its pre-loading label; sec01-r01 used HTTP and browser rejected Secure cookies; sec01-r02 tried to read cached response bodies after reload/204. Final capture reads bodies immediately and treats204 as no-body; all security assertions remain, and application code was not weakened to accommodate tests. First Web build was sandbox-blocked as above. Native Chrome autofill is not counted as PASS.

## Native Chrome Password Manager manual acceptance — NOT_RUN

Use an approved isolated HTTPS staging instance and a separate Chrome test profile with synthetic accounts only. Do not inspect personal saved passwords or sync test passwords into a personal account. This is not authorization to deploy SEC-01 to production.

1. Fresh profile: open login, inspect only `hasAttribute('value')` and whether `.value.length` is zero; do not print the plaintext to console/evidence. UI must remain Vietnamese under an English browser locale.
2. Manually type synthetic credentials. Trigger a validation/error rerender. Confirm the app does not write a value attribute; live input value may exist. Login request must remain a POST body.
3. Login and accept Chrome's native Save Password prompt if offered. Logout and reload; use Chrome's native saved-credential suggestion. Confirm current-password/username recognition and successful login/reload/logout. Record whether native Chrome itself changes attributes separately from an app-driven render.
4. Repeat with an invalid synthetic password: error feedback and application field clearing must work; Chrome may refill afterward under its own manager policy.
5. Registration: both password fields use new-password, native generation/save is still available where Chrome policy allows it, confirmation works, and registration/login/session behavior remains correct.
6. Repeat at390×844. Screenshots must show masked/empty fields; do not capture DevTools/network bodies with passwords, cookies or tokens.

Record browser/version, extension state, each observed PASS/FAIL and whether autofill was native. Manager prompts, persistence, generation and browser-specific extension behavior are still unverified. No universal guarantee that every browser/extension will avoid writing its own DOM attributes.

## Deployment and rollback — preparation only

No migrations, schema, account/password/session changes, new dependencies or runtime architecture changes. The runtime patch is Web-only; keep API/database images, volumes, secrets, TLS/proxy and session policy unchanged.

Last historical deployment26/11/2026: API sha256:a7e4f662c23de24225e1a4550d6ad786b813b3643deb5a97ecc1720dd85d8bb3; Web sha256:dad0719542c722d422a35f4f62d0a585a13040238ec5b1d00b5eed9931088ea9; release dictpub-20261126T132010Z. These were not revalidated remotely during SEC-01 and must not be assumed current at a future rollout.

After explicit Owner approval and native-manager acceptance:

1. Revalidate actual active release/API/Web/DB IDs, source drift and current Compose override chain. Stop on unexpected differences; do not overwrite newer functionality with this baseline.
2. Build only a new Web image natively for Linux AMD64 using the existing Dockerfile/context guards, unique tag and reviewed source snapshot. Do not pass credentials as build args or copy Windows node_modules. Validate image user nginx, config readability and read-only startup. A Windows Vite build PASS is not a native image PASS.
3. Record rollback Web image ID and operational backup status. Preserve the current encrypted backups/keys; no database restore/reset/migration is needed for this frontend patch. If a fresh database backup is required by rollout policy, use current schema-aware tooling and verify restore on a clone, not old Mac tooling.
4. Prepare an override changing only Web image; diff full Compose configuration. Keep API and DB container IDs, environment/secrets, networks and all volumes unchanged. No seed, source-rights change or corpus publication.
5. Start only Web using the verified active Compose file chain, --no-deps/--no-build/--pull never. Verify HTTPS assets/health and Owner login/register/logout UAT without resetting real passwords or revoking sessions. Existing sessions should continue against the unchanged API/secrets.
6. Rollback only Web to the exact recorded previous image if acceptance fails. Do not roll back API/schema or restore DB for an HTML-input patch. This returns the previous controlled-input behavior and does not invalidate accounts/sessions. Preserve failed evidence.

Separate read-only self-review of final diff/callers and ordinary/adversarial controls completed; this is not an independent specialist sign-off. Owner review/native-manager checks and explicit production deployment approval remain outstanding. No unrelated security issue or feature is silently implemented.
