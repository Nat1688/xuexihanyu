/**
 * DI tokens for the exercise application ports (CP-02).
 *
 * The ports are TypeScript interfaces (no runtime value), so NestJS's type-based
 * injection cannot be used. We expose explicit string tokens and inject by
 * token, keeping the wiring auditable in one place.
 */
export const EXERCISE_CONTENT_READER = 'EXERCISE_CONTENT_READER';
