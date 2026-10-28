import {
  loadRememberedExercise,
  recalledExercise,
  rememberExercise,
  submitRememberedExercise,
  type ExerciseResumeApi,
  type SessionStorageLike,
} from '../src/exercise-resume';
import type { ExerciseView, ResultView } from '../src/api/client';

const SESSION_ID = '10000000-0000-4000-8000-000000000001';

class MemorySessionStorage implements SessionStorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function exercise(alreadyAnswered: boolean): ExerciseView {
  return {
    sessionId: SESSION_ID,
    lessonId: 'lesson',
    mode: 'VI_TO_ZH',
    format: 'TYPING',
    prompt: 'you',
    options: null,
    expiresAt: '2026-10-21T12:00:00.000Z',
    alreadyAnswered,
  };
}

function result(): ResultView {
  return {
    sessionId: SESSION_ID,
    correct: true,
    feedback: 'CORRECT',
    expected: '你',
    received: '你',
    submittedAt: '2026-10-21T10:00:00.000Z',
    integrityStatus: 'COMPLETE',
    next: { action: 'CONTINUE', remaining: 1, completedToday: 1 },
  };
}

describe('exercise reload recovery', () => {
  it('retains only the session id after a network failure and recovers it after reload', async () => {
    const storage = new MemorySessionStorage();
    rememberExercise(storage, SESSION_ID);
    const api: ExerciseResumeApi = {
      exercise: jest.fn(async () => exercise(true)),
      answer: jest.fn(async () => {
        throw new Error('network timeout after commit');
      }),
      recoverResult: jest.fn(async () => result()),
    };

    await expect(
      submitRememberedExercise(api, storage, SESSION_ID, 'submission-token', '你'),
    ).rejects.toThrow('network timeout after commit');
    expect(recalledExercise(storage)).toBe(SESSION_ID);
    expect([...storage.values.values()]).toEqual([SESSION_ID]);

    const restored = recalledExercise(storage);
    expect(restored).toBe(SESSION_ID);
    const loaded = await loadRememberedExercise(api, storage, restored!);
    expect(loaded.result).toEqual(result());
    expect(api.recoverResult).toHaveBeenCalledWith(SESSION_ID);
    expect(recalledExercise(storage)).toBeNull();
  });

  it('uses read-only exercise lookup then POST recovery for an existing submission', async () => {
    const storage = new MemorySessionStorage();
    rememberExercise(storage, SESSION_ID);
    const calls: string[] = [];
    const api: ExerciseResumeApi = {
      exercise: async () => {
        calls.push('GET exercise');
        return exercise(true);
      },
      answer: jest.fn(),
      recoverResult: async () => {
        calls.push('POST recover');
        return result();
      },
    };

    const loaded = await loadRememberedExercise(api, storage, SESSION_ID);
    expect(calls).toEqual(['GET exercise', 'POST recover']);
    expect(loaded.result?.integrityStatus).toBe('COMPLETE');
    expect(recalledExercise(storage)).toBeNull();
  });
});
