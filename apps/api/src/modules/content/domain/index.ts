/**
 * Content domain barrel (CP-01).
 *
 * Re-exports the persistence-agnostic content vocabulary so consumers (and
 * tests) import from one place. Contains no HTTP, repository or persistence
 * code — this is the domain boundary only.
 *
 * Scope: teacher-managed curriculum hierarchy (course/unit/lesson), reusable
 * Chinese-aware learning items, ordering/ownership validation, the read
 * visibility policy and the server-side mutation authorization policy. It does
 * NOT contain exercises/evaluation (CP-02), learning events (CP-03),
 * mastery/review (CP-04), media storage, import/export or AI.
 */
export * from './content-authorization';
export * from './content-errors';
export * from './content-read-policy';
export * from './hierarchy';
export * from './learning-item';
export * from './learning-item-kind';
export * from './ordering';
export * from './visibility';
