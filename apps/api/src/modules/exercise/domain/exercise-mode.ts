/**
 * Exercise mode vocabulary (CP-02).
 *
 * A provider-neutral exercise is fully described by a small, closed vocabulary
 * so generation and evaluation are deterministic and testable. CP-02 defines
 * exactly the content-derived modes accepted by the Owner and NOTHING more:
 *
 *   Mode (question -> answer)   | question field | answer field
 *   ----------------------------|----------------|-------------
 *   ZH_TO_VI                    | simplified     | meaning
 *   VI_TO_ZH                    | meaning        | simplified
 *   ZH_TO_PINYIN                | simplified     | pinyin
 *   PINYIN_TO_ZH                | pinyin         | simplified
 *
 * Two answer formats are supported:
 *
 *   - MULTIPLE_CHOICE — the learner picks one option (deterministic
 *                       distractors drawn from approved content).
 *   - TYPING          — the learner types the answer (free text).
 *
 * AUDIO modes are CONTRACT PLACEHOLDERS ONLY: `AUDIO_TO_ZH`/`AUDIO_TO_VI` are
 * declared so the vocabulary is stable, but CP-02 stores and delivers NO media
 * — audio requires a separately approved media-storage/reference-delivery
 * checkpoint. A generator/evaluator MUST refuse an audio mode in CP-02.
 */
import { ContentValidationError } from '../../content/domain/content-errors';

/** The content-derived exercise modes implemented in CP-02. */
export const EXERCISE_MODES = ['ZH_TO_VI', 'VI_TO_ZH', 'ZH_TO_PINYIN', 'PINYIN_TO_ZH'] as const;

export type ExerciseMode = (typeof EXERCISE_MODES)[number];

/**
 * Modes declared as CONTRACT PLACEHOLDERS. They exist in the vocabulary but are
 * NOT generatable/evaluable in CP-02 (no media storage/delivery is approved).
 */
export const AUDIO_EXERCISE_MODES = ['AUDIO_TO_ZH', 'AUDIO_TO_VI'] as const;

export type AudioExerciseMode = (typeof AUDIO_EXERCISE_MODES)[number];

/** The answer formats an exercise may use. */
export const EXERCISE_FORMATS = ['MULTIPLE_CHOICE', 'TYPING'] as const;

export type ExerciseFormat = (typeof EXERCISE_FORMATS)[number];

/** Type guard: is `value` a content-derived CP-02 exercise mode? */
export function isExerciseMode(value: unknown): value is ExerciseMode {
  return typeof value === 'string' && (EXERCISE_MODES as readonly string[]).includes(value);
}

/** Type guard: is `value` a declared (placeholder) audio exercise mode? */
export function isAudioExerciseMode(value: unknown): value is AudioExerciseMode {
  return typeof value === 'string' && (AUDIO_EXERCISE_MODES as readonly string[]).includes(value);
}

/** Type guard: is `value` a supported answer format? */
export function isExerciseFormat(value: unknown): value is ExerciseFormat {
  return typeof value === 'string' && (EXERCISE_FORMATS as readonly string[]).includes(value);
}

/** The content field a mode consumes as the question. */
export type QuestionField = 'simplified' | 'meaning' | 'pinyin';
/** The content field a mode expects as the answer. */
export type AnswerField = 'simplified' | 'meaning' | 'pinyin';

/** The (question, answer) content-field pair a mode binds to. */
export interface ModeFieldBinding {
  readonly question: QuestionField;
  readonly answer: AnswerField;
}

/** Field binding per content-derived mode (fixed, no drift). */
const MODE_BINDINGS: Record<ExerciseMode, ModeFieldBinding> = {
  ZH_TO_VI: { question: 'simplified', answer: 'meaning' },
  VI_TO_ZH: { question: 'meaning', answer: 'simplified' },
  ZH_TO_PINYIN: { question: 'simplified', answer: 'pinyin' },
  PINYIN_TO_ZH: { question: 'pinyin', answer: 'simplified' },
};

/**
 * Resolve the field binding for a content-derived mode. Throws a safe
 * {@link ContentValidationError} for an unknown or audio-placeholder mode (no
 * audio generation/evaluation exists in CP-02).
 */
export function modeFieldBinding(mode: unknown): ModeFieldBinding {
  if (isExerciseMode(mode)) return MODE_BINDINGS[mode];
  if (isAudioExerciseMode(mode)) {
    throw new ContentValidationError(
      'mode',
      'audio exercise modes are not available (media delivery is not approved)',
    );
  }
  throw new ContentValidationError('mode', 'must be an approved exercise mode');
}

/** Human/stable label for a mode's answer field (used in safe feedback codes). */
export function answerFieldOf(mode: unknown): AnswerField {
  return modeFieldBinding(mode).answer;
}

/** Human/stable label for a mode's question field. */
export function questionFieldOf(mode: unknown): QuestionField {
  return modeFieldBinding(mode).question;
}
