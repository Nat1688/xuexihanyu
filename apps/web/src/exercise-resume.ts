import type { ExerciseView, ResultView } from './api/client';

const ACTIVE_EXERCISE_KEY = 'clp.activeExerciseSessionId';
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ExerciseResumeApi {
  exercise(sessionId: string): Promise<ExerciseView>;
  answer(sessionId: string, submissionToken: string, answer: string): Promise<ResultView>;
  recoverResult(sessionId: string): Promise<ResultView>;
}

/** Store only the opaque server-issued session id, never auth or answer data. */
export function rememberExercise(storage: SessionStorageLike, sessionId: string): void {
  if (SESSION_ID.test(sessionId)) storage.setItem(ACTIVE_EXERCISE_KEY, sessionId);
}

export function recalledExercise(storage: SessionStorageLike): string | null {
  const sessionId = storage.getItem(ACTIVE_EXERCISE_KEY);
  if (!sessionId || !SESSION_ID.test(sessionId)) {
    storage.removeItem(ACTIVE_EXERCISE_KEY);
    return null;
  }
  return sessionId;
}

export function forgetExercise(storage: SessionStorageLike): void {
  storage.removeItem(ACTIVE_EXERCISE_KEY);
}

export async function submitRememberedExercise(
  api: ExerciseResumeApi,
  storage: SessionStorageLike,
  sessionId: string,
  submissionToken: string,
  answer: string,
): Promise<ResultView> {
  const result = await api.answer(sessionId, submissionToken, answer);
  if (result.integrityStatus === 'COMPLETE') forgetExercise(storage);
  return result;
}

export async function loadRememberedExercise(
  api: ExerciseResumeApi,
  storage: SessionStorageLike,
  sessionId: string,
): Promise<{ exercise: ExerciseView; result: ResultView | null }> {
  const exercise = await api.exercise(sessionId);
  if (!exercise.alreadyAnswered) return { exercise, result: null };

  // Recovery is the CSRF-protected POST. The preceding GET stays read-only.
  const result = await api.recoverResult(sessionId);
  if (result.integrityStatus === 'COMPLETE') forgetExercise(storage);
  return { exercise, result };
}
