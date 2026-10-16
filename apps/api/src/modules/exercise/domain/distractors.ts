/**
 * Deterministic distractor selection (CP-02).
 *
 * A multiple-choice exercise needs wrong options ("distractors") drawn from
 * APPROVED content only — never invented, never AI-generated. Selection is
 * fully DETERMINISTIC and reproducible: given the same candidate pool, the same
 * correct answer and the same options it always yields the same option list.
 *
 * Determinism strategy: candidates are first normalized to a compare-key for
 * the target field and DE-DUPLICATED (an option equal to the correct answer is
 * never a distractor). They are then ordered by a stable key derived from the
 * candidate's public id (a caller-supplied seed + the id), so no RNG/clock is
 * involved and ordering does not depend on the input array order.
 */
import { ContentValidationError } from '../../content/domain/content-errors';
import { type NormalizableField, normalizeForField } from './normalization';

/** A distractor candidate: its external id and the raw field value. */
export interface DistractorCandidate {
  readonly publicId: string;
  readonly value: string;
}

/** Options controlling distractor selection. */
export interface DistractorOptions {
  /** How many distractors to attempt to return (best-effort, deduplicated). */
  readonly count: number;
  /** Stable seed; changing it changes (deterministically) the selection. */
  readonly seed?: string;
}

/**
 * Deterministic 32-bit string hash (FNV-1a). Not cryptographic — used only to
 * derive a stable ordering key from a candidate id + seed.
 */
function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Select up to `count` deterministic distractors for `correctValue` on `field`.
 *
 * - Candidates whose normalized value equals the correct answer's normalized
 *   value are dropped (never surface a second copy of the right answer).
 * - Duplicate candidate values are collapsed (keep the lexicographically
 *   smallest id for stability).
 * - The remainder is ordered by (stableHash(seed + ':' + id), id) and sliced to
 *   `count`. Best-effort: fewer than `count` legitimate candidates yields fewer.
 */
export function selectDistractors(
  field: NormalizableField,
  correctValue: string,
  candidates: readonly DistractorCandidate[],
  options: DistractorOptions,
): string[] {
  if (!Number.isInteger(options.count) || options.count < 0) {
    throw new ContentValidationError('count', 'must be a non-negative integer');
  }
  const seed = options.seed ?? '';
  const correctKey = normalizeForField(field, correctValue);

  // De-duplicate by normalized value, keeping the smallest id for stability.
  const byKey = new Map<string, DistractorCandidate>();
  for (const candidate of candidates) {
    if (typeof candidate.publicId !== 'string' || typeof candidate.value !== 'string') {
      throw new ContentValidationError('candidate', 'must have a string publicId and value');
    }
    const key = normalizeForField(field, candidate.value);
    if (key.length === 0) continue;
    if (key === correctKey) continue;
    const existing = byKey.get(key);
    if (!existing || candidate.publicId < existing.publicId) {
      byKey.set(key, candidate);
    }
  }

  const ordered = [...byKey.values()].sort((a, b) => {
    const ha = stableHash(`${seed}:${a.publicId}`);
    const hb = stableHash(`${seed}:${b.publicId}`);
    if (ha !== hb) return ha - hb;
    return a.publicId < b.publicId ? -1 : a.publicId > b.publicId ? 1 : 0;
  });

  return ordered.slice(0, options.count).map((candidate) => candidate.value);
}
