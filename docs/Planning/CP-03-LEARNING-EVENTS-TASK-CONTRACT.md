# CP-03 Learning Events Task Contract

**Status:** Accepted by Owner — append-only event foundation implementation may proceed only within this scope.

## Scope

- Append-only `learning_events` record with public UUID, schema version, event type, actor user reference, content/exercise references where applicable, occurred-at instant, bounded metadata and created-at.
- Initial event vocabulary: lesson started/completed, exercise presented, answer submitted, exercise completed, review activity.
- Event payload is versioned and validated by event type; store reference/normalized evaluation outcome, never raw credentials/cookies/CSRF or unbounded answer text.
- Exercise/Event module boundary: CP-02 remains deterministic generator/evaluator; CP-03 records authoritative interaction evidence only.

## Integrity & privacy

- Normal application repository/service exposes append only; no update/delete API or mutation method.
- Event ordering uses timestamp plus stable ID; timestamps are UTC instants.
- Metadata allowlist and size limits; privacy/retention policy documentation must state events are evidence, not derived progress.
- Teacher/admin read access is deferred unless a separately approved reporting/query contract is added.

## Forbidden

No mastery/review scheduling/progress projection, no Student MVP UI flow, no analytics dashboard, no AI, no event broker/microservice, no mutable event endpoint, no raw answer/secret/session payload.

## Acceptance

- Append-only migration/repository tests prove no application update/delete path.
- Version/type/metadata validation and privacy-redaction tests.
- Deterministic ordering/serialization tests.
- Migration/reset/secret/quality gates pass.
