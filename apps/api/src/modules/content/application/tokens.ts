/**
 * DI tokens for the content application ports (CP-01).
 *
 * The ports are TypeScript interfaces (no runtime value), so NestJS's type-based
 * injection cannot be used. We expose explicit string tokens and inject by
 * token, keeping the wiring auditable in one place.
 */
export const CONTENT_REPOSITORY = 'CONTENT_REPOSITORY';
export const CONTENT_PUBLIC_ID_GENERATOR = 'CONTENT_PUBLIC_ID_GENERATOR';
