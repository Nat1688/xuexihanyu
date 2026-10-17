/**
 * Token + prompt-sampling rules for the student loop (CP-05).
 *
 * Both are PURE and clock-free so the EXERCISE screen is reproducible in tests:
 *   - {@link isValidSubmissionToken} guarantees a token is bounded, opaque and
 *     safe to store, so idempotency keys cannot be used to smuggle payloads.
 *   - {@link pickExerciseItem} deterministically picks WHICH learning item of a
 *     lesson to reveal first ("CONTINUE"), so the same learner state yields the
 *     same prompt and there is no randomness in the teaching loop.
 */

/** Length bounds for a client-provided submission token (crypto random UUID). */
export const MIN_TOKEN_LENGTH = 16;
export const MAX_TOKEN_LENGTH = 80;

/** Token charset: URL-safe, no whitespace, no separators that aid injection. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * A submission token must be a non-empty, bounded, URL-safe opaque string. The
 * token is a CLIENT-coined idempotency key (e.g. a crypto random UUID); it is
 * never trusted for authorization and never parsed for meaning.
 */
export function isValidSubmissionToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= MIN_TOKEN_LENGTH &&
    value.length <= MAX_TOKEN_LENGTH &&
    TOKEN_PATTERN.test(value)
  );
}

/**
 * Deterministically choose an item from an ordered candidate list. Selection is
 * driven by the learner's already-submitted exercise count for the day
 * (`step`), so successive CONTINUEs walk the lesson in order and wrap around
 * only after the whole lesson has been shown. Returns null for an empty list.
 */
export function pickExerciseItem<T>(ordered: readonly T[], step: number): T | null {
  if (ordered.length === 0) return null;
  const index = Math.abs(Math.trunc(step)) % ordered.length;
  return ordered[index];
}
