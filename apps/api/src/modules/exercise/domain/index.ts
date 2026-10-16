/**
 * Exercise domain barrel (CP-02).
 *
 * Re-exports the provider-neutral, deterministic exercise vocabulary so
 * consumers (and tests) import from one place. Contains no HTTP, repository or
 * persistence code — this is the domain boundary only.
 *
 * Scope: exercise modes/formats (content-derived; audio declared as a
 * placeholder only), field normalization, deterministic distractors, the
 * content-referenced definition/instance contract and pure evaluation.
 *
 * Deliberately ABSENT (CP-02 forbidden): learning events/attempt capture
 * (CP-03), mastery/review scheduling (CP-04), AI generation, media storage/
 * delivery, server-persisted exercise sessions (CP-02 generates/evaluates
 * in-memory and stores nothing) and any UI.
 */
export * from './distractors';
export * from './evaluation';
export * from './exercise-definition';
export * from './exercise-errors';
export * from './exercise-mode';
export * from './normalization';
