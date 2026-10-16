/**
 * DI tokens for the mastery application ports (CP-04).
 *
 * The ports are TypeScript interfaces (no runtime value), so NestJS's type-based
 * injection cannot be used. We expose explicit string tokens and inject by
 * token, keeping the wiring auditable in one place.
 */
export const MASTERY_EVENT_READER = 'MASTERY_EVENT_READER';
export const MASTERY_PROJECTION_REPOSITORY = 'MASTERY_PROJECTION_REPOSITORY';
