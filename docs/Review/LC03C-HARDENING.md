# LC-03C — Preview readiness hardening

## Approved task and boundaries

Baseline: `7dca50e9cbb5d24e834f23c984035329e19d8d44`.
Branch: `codex/lc03c-preview-hardening`, separate worktree.
Owner approved P2-01 availability discovery and P2-02 revision pinning only.
LC-03B's Option P, catalog manifest, editorial restrictions and authorization
contract remain binding. No persistence, schema, dependency, exercise engine,
publication, Main, learning-track WIP or LP-01 changes.

## API contract and compatibility

All routes below require the existing authenticated STUDENT role and return
`Cache-Control: no-store`. Teacher/Admin without STUDENT are denied.

| Method | Route suffix under `/student/learning-prototypes/lesson-01` | Contract                                                                                                                                         |
| ------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/availability`                                             | New, no query fields. Returns only `{ "available": boolean }`. No lesson, revision list, configuration, key or target information.               |
| GET    | empty                                                       | Existing `instructionLanguage=vi/en`, optional exact `revision`. Omitted revision still means current; supplied revision never falls back.       |
| POST   | `/practice-check`                                           | Existing CSRF proof, exact language/revision/task/answer. Uses only that revision's policy; unavailable variant returns 404. No progress writes. |

Availability is false unless the existing server gate and verified disposable
target are valid and a catalog is registered. Default-OFF, development-only and
exact target restrictions are unchanged. Discovery itself is allowed while OFF
but direct content/check calls remain 404. Invalid discovery query is 400;
unauthenticated requests 401 and role/CSRF rejection 403. No auth/RBAC change.

The UI hides the entry initially and on discovery failure, displaying it only
after explicit server approval. Discovery is fetched on Today mount, not stored
in browser storage. It is not a live subscription: if an operator changes the
gate while Today remains mounted, the displayed entry can be stale until remount
or reload. Direct read/check authorization always remains authoritative.

The first successful reader response pins package identity and revision in
component memory. Language switches request that exact revision, clear answers
and feedback, and reject mismatched response identity/revision. Missing revision
or language shows an explicit unavailable state. No silent fallback occurs.
Checks use the rendered lesson's revision. Explicit reload/unmount/browser reload
deliberately clears the unsaved pin and loads current content, retaining previous
LC-03B reload behavior. There is no durable attempt or CP-05 recovery claim.

## Verification design

Unit contracts cover discovery fail-closed target/config combinations, strict
input, missing variant read/check and old versus current policy. Frontend tests
cover initially hidden entry, request URL encoding and POST revision/language.

The extended `apps/web/test/lc03b-realstack.cjs` retains its filename for command
compatibility but now verifies LC-03B plus LC-03C. It uses actual Nest/Prisma,
React/Vite and Chromium, without HTTP interception. In-process test-only registry
variants simulate multiple revisions and an unavailable language; they are never
production catalog revisions or database content. A newer fixture deliberately
has a different P5 policy to detect a silent latest fallback. Test-only delays
exercise loading and stale-response handling, not fabricated HTTP responses.

Required real-stack checks: OFF/ON discovery, auth/RBAC/CSRF, gate-OFF direct
access, VI→EN→VI old revision pinning while current changes, old-policy check,
unknown revision/missing variant 404, reload/current, key exclusion, expiry,
keyboard/mobile and zero learning writes. PostgreSQL row counts and instrumented
learning delegates independently check AnswerSession, AnswerSubmission,
LearningEvent and MasteryProjection.

Owner approved a fresh PostgreSQL 17.11 cluster at loopback 55438,
`clp_lc03b_test`, under private `lc03c-postgres17`; API 3108/UI 5198.
Credentials are random runtime-only. Provisioning verifies actual data directory,
server version, address and port before creating the new DB or migrating.
Only reviewed migrations are deployed on that new cluster. Owned services stop
after tests; cluster data and old recovery artifacts remain preserved.

Exact command results, sanitized logs, screenshots and full binary patch are
included in the external Independent Review package, not in runtime source.

## Acceptance and rollback

P2-01 passes when OFF hides the entry and denies direct content/check access,
while ON permits only authorized students. P2-02 passes when language switches
and self-check keep the rendered revision despite newer content, and unavailable
revisions/variants fail explicitly. Existing no-revision clients remain valid.
Full API/frontend regression, lint, typecheck, build/catalog validation,
changed-file formatting, secret/artifact scan and diff checks are closure gates.

Withdraw preview using the unchanged server flag; roll back API/UI together to
the baseline if necessary. No database rollback, event deletion or migration is
needed. No commit or integration is authorized until independent review.

## Remaining restrictions

Only `lc03b-preview-1` ships. Historical storage/CMS and production availability
are not implemented. Catalog remains PREVIEW_ONLY; specialist sign-off and Owner
publication approval remain absent. P1/P3/P5 give no mastery/completion credit.
Discovery assumes a validated immutable registry, as before. No production/pilot
enablement or multi-revision production claim is made by test-only fixtures.
