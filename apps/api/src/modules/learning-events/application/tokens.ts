/**
 * DI tokens for the learning-event application ports (CP-03).
 *
 * The ports are TypeScript interfaces (no runtime value), so NestJS's type-based
 * injection cannot be used. We expose explicit string tokens and inject by
 * token, keeping the wiring auditable in one place.
 */
export const LEARNING_EVENT_REPOSITORY = 'LEARNING_EVENT_REPOSITORY';
