import {
  CURRENT_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  isLearningEventType,
  isSupportedSchemaVersion,
  validateEventType,
  validateSchemaVersion,
  LEARNING_EVENT_TYPES,
  LearningEventUnknownTypeError,
  LearningEventVersionError,
  LEARNING_EVENT_UNKNOWN_TYPE_CODE,
  LEARNING_EVENT_UNSUPPORTED_VERSION_CODE,
} from '../../src/modules/learning-events/domain';

/**
 * Learning-event type + schema-version contract tests (CP-03).
 *
 * Proves the closed vocabulary and the version policy: only the six approved
 * event types are accepted, only supported schema versions are accepted, and a
 * rejected value NEVER survives in the (safe) error message.
 */
describe('learning-event vocabulary (CP-03)', () => {
  it('exposes exactly the six approved event types', () => {
    expect(LEARNING_EVENT_TYPES).toEqual([
      'LESSON_STARTED',
      'LESSON_COMPLETED',
      'EXERCISE_PRESENTED',
      'ANSWER_SUBMITTED',
      'EXERCISE_COMPLETED',
      'REVIEW_ACTIVITY',
    ]);
  });

  it.each(LEARNING_EVENT_TYPES)('accepts the approved type %s', (type) => {
    expect(isLearningEventType(type)).toBe(true);
    expect(validateEventType(type)).toBe(type);
  });

  it.each(['LESSON_PAUSED', 'lesson_started', '', 'MASTERY_UPDATED', 42, null, undefined])(
    'rejects the non-vocabulary value %p',
    (value) => {
      expect(isLearningEventType(value)).toBe(false);
      expect(() => validateEventType(value)).toThrow(LearningEventUnknownTypeError);
    },
  );

  it('never echoes a rejected event-type value in the error message', () => {
    const secretish = 'token=super-secret-value';
    try {
      validateEventType(secretish);
      throw new Error('expected throw');
    } catch (error) {
      const e = error as LearningEventUnknownTypeError;
      expect(e.code).toBe(LEARNING_EVENT_UNKNOWN_TYPE_CODE);
      expect(e.message).toBe('Unsupported learning event type');
      expect(e.message).not.toContain('super-secret-value');
    }
  });

  it('accepts the current and supported schema versions', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
    expect(SUPPORTED_SCHEMA_VERSIONS).toContain(1);
    expect(isSupportedSchemaVersion(1)).toBe(true);
    expect(validateSchemaVersion(CURRENT_SCHEMA_VERSION)).toBe(CURRENT_SCHEMA_VERSION);
  });

  it.each([0, 2, -1, 1.5, '1', null, undefined, NaN])(
    'rejects the unsupported version %p',
    (value) => {
      expect(isSupportedSchemaVersion(value)).toBe(false);
      expect(() => validateSchemaVersion(value)).toThrow(LearningEventVersionError);
    },
  );

  it('reports the unsupported-version code without leaking payload data', () => {
    try {
      validateSchemaVersion(99);
      throw new Error('expected throw');
    } catch (error) {
      const e = error as LearningEventVersionError;
      expect(e.code).toBe(LEARNING_EVENT_UNSUPPORTED_VERSION_CODE);
      expect(e.message).toBe('Unsupported learning event schema version');
    }
  });
});
