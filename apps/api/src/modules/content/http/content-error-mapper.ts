/**
 * Content HTTP error mapping (CP-01; ADR-005).
 *
 * Maps content-domain errors to the ADR-005 error contract: a stable machine
 * code, a safe message, an HTTP status and an optional correlation id. It NEVER
 * exposes stack traces, SQL/ORM text or internal identifiers.
 *
 *   - `ContentValidationError` → 400
 *   - `ContentNotFoundError`   → 404
 *   - `ContentConflictError`   → 409
 *
 * `ForbiddenError` (authorization) is already mapped by the shared auth layer;
 * this module intentionally does not duplicate it.
 */
import {
  CONTENT_CONFLICT_CODE,
  CONTENT_NOT_FOUND_CODE,
  CONTENT_VALIDATION_CODE,
  ContentConflictError,
  ContentNotFoundError,
  ContentValidationError,
} from '../domain/content-errors';

/** The stable error body shape (ADR-005). */
export interface ContentErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId?: string;
  };
}

/** A content error translated to (status, body). */
export interface MappedContentError {
  readonly status: number;
  readonly body: ContentErrorBody;
}

function withId(code: string, message: string, requestId?: string): ContentErrorBody['error'] {
  return requestId ? { code, message, requestId } : { code, message };
}

/** Translate a known content error to its HTTP shape, or `null` otherwise. */
export function mapContentError(error: unknown, requestId?: string): MappedContentError | null {
  if (error instanceof ContentValidationError) {
    // The domain message is already safe (field + reason); no SQL/ORM text.
    return {
      status: 400,
      body: { error: withId(CONTENT_VALIDATION_CODE, error.message, requestId) },
    };
  }
  if (error instanceof ContentNotFoundError) {
    return {
      status: 404,
      body: { error: withId(CONTENT_NOT_FOUND_CODE, error.message, requestId) },
    };
  }
  if (error instanceof ContentConflictError) {
    return {
      status: 409,
      body: { error: withId(CONTENT_CONFLICT_CODE, error.message, requestId) },
    };
  }
  return null;
}
