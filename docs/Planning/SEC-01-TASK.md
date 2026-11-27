# SEC-01 — Credential handling hardening

Owner directive 27/11/2026 authorizes a focused backward-compatible patch, local commits, tests and documentation; production deployment remains HOLD. Governing policy: AGENTS.md, existing identity/session contracts and the supplied SEC-01 directive.

Baseline: deployed frozen524-file DICT07-P source, privately snapshotted on fix/sec-01-credential-handling as cdd3b3f8b8e84c49d741ce64c5e5116045aae118. Original Main and all pre-existing WIP remain unchanged. This baseline snapshot is separate from the security patch; importer v2/migration13 is excluded.

Confirmed source path: LoginScreen holds password and confirmation in React state, passes them through value props, and updates state on input. Browser autofill input events can therefore cause application-driven value-attribute reflection. Not a confirmed server disclosure or remote credential exfiltration. Login and registration share this component. No password-change/reset/admin credential UI is implemented; do not invent endpoints or flows.

Strategy: native uncontrolled credential fields and FormData read only at submit; no value/defaultValue/password state. Username also read from form so autofill without a React change event remains submittable. Keep current/new-password autocomplete, names, labels, Vietnamese messages, request payloads and session/CSRF/RBAC. Clear DOM password values after request completion and mode switches; clear transient application references after dispatch. The browser input property and request body necessarily contain the password during use; JS strings cannot be securely zeroized.

Scope: LoginScreen, directly related regression/browser tests, bounded credential audit, this contract and docs/security/SEC-01-CREDENTIAL-HANDLING.md. No migration/dependency/backend auth redesign, production account/session changes, dictionary publication, Main merge/push or homelab deployment. Unrelated security gaps are report-only.

Acceptance: reproduce baseline reflection; initial/manual/simulated-autofill password attributes stay absent after patch and rerenders; real login/register failure/success/session/logout work; passwords never persist in app browser storage/logs/ordinary responses; backend hashes with existing scrypt; dictionary regression stays PASS. Native Chrome saved-password behavior is a separate manual acceptance test if not reproducible automatically. Do not label simulated autofill as native-manager verification.

Verification: targeted first, then full API/Web regression, lint/typecheck/build/catalog, scoped format, secret/artifact/diff checks. Existing approved loopback disposable dictionary target (new cluster each run) may validate combined auth/dictionary flows; never use homelab. Independent read-only review pass before the patch checkpoint. Report exact commands/results, limits, local SHA and deployment/rollback instructions. No production writes or service changes.
