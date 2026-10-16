/**
 * Learning-events domain barrel (CP-03).
 *
 * Re-exports the append-only, versioned learning-event vocabulary so consumers
 * (and tests) import from one place. Contains no HTTP, repository or
 * persistence code — this is the domain boundary only.
 *
 * Scope: the closed event-type vocabulary, the payload schema-version policy,
 * the bounded allow-listed metadata contract, deterministic ordering, the
 * validated event record contract and typed safe errors.
 *
 * Deliberately ABSENT (CP-03 forbidden): mastery/review scheduling or progress
 * projection (CP-04), any Student MVP UI flow, analytics dashboard, AI, an
 * event broker/microservice, a mutable event endpoint, and any raw
 * answer/secret/session payload.
 */
export * from './event-metadata';
export * from './event-ordering';
export * from './learning-event';
export * from './learning-event-errors';
export * from './learning-event-type';
export * from './schema-version';
