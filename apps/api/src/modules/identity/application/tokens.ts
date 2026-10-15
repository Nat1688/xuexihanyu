/**
 * DI tokens for the identity/session application ports (CLP-00-06).
 *
 * The ports are TypeScript interfaces (no runtime value), so NestJS's
 * type-based injection cannot be used. We expose explicit string tokens and
 * inject by token. Keeping them in one module makes the wiring auditable.
 */
export const IDENTITY_REPOSITORY = 'IDENTITY_REPOSITORY';
export const SESSION_REPOSITORY = 'SESSION_REPOSITORY';
export const PASSWORD_HASHER = 'PASSWORD_HASHER';
