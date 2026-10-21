/**
 * Student API client (CP-05).
 *
 * Thin, typed wrapper over the CP-05 `/student` surface plus the two identity
 * routes the student loop needs (login/logout/me).
 *
 * Security notes:
 *   - Requests are credential-including (`credentials: 'include'`) so the
 *     browser sends the httpOnly session cookie. The SPA never reads or stores
 *     the session cookie, and never sees a token in JS.
 *   - State-changing POSTs send the CSRF double-submit proof: the value of the
 *     non-httpOnly `clp_csrf` cookie echoed in the `X-CSRF-Token` header.
 *   - The exercise/answer payloads contain NO answer key; correctness is
 *     server-owned and only revealed on the RESULT payload.
 */
import { getPublicConfig } from '../config/public-config';

/** Stable ADR-005 error body. */
export interface ApiErrorBody {
  error: { code: string; message: string; requestId?: string };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface Principal {
  publicId: string;
  login: string;
  displayName: string | null;
  roles: string[];
}

export interface TodayEntry {
  lessonId: string;
  lessonTitle: string;
  itemId: string;
  state: string | null;
  dueAt: string | null;
  due: boolean;
}

export interface TodayView {
  generatedAt: string;
  dailyGoal: number;
  completedToday: number;
  remaining: number;
  entries: TodayEntry[];
  empty: boolean;
}

export interface ExerciseView {
  sessionId: string;
  lessonId: string;
  mode: string;
  format: 'MULTIPLE_CHOICE' | 'TYPING';
  prompt: string;
  options: string[] | null;
  expiresAt: string;
  alreadyAnswered: boolean;
}

export interface ResultView {
  sessionId: string;
  correct: boolean;
  feedback: string;
  expected: string;
  received: string;
  submittedAt: string;
  next: { action: string; remaining: number; completedToday: number };
}

const CSRF_COOKIE = 'clp_csrf';

function baseUrl(): string {
  return getPublicConfig().apiBaseUrl.replace(/\/$/, '');
}

function readCookie(name: string): string | null {
  const raw = document.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method === 'POST') {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const response = await fetch(`${baseUrl()}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    let parsed: ApiErrorBody | null = null;
    try {
      parsed = (await response.json()) as ApiErrorBody;
    } catch {
      parsed = null;
    }
    throw new ApiError(
      response.status,
      parsed?.error?.code ?? 'HTTP_ERROR',
      parsed?.error?.message ?? `Request failed (${response.status}).`,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Client for the student loop. Bound to the browser's cookie session. */
export const studentApi = {
  async login(login: string, password: string): Promise<Principal> {
    const body = await request<{ user: Principal }>('POST', '/auth/login', { login, password });
    return body.user;
  },

  async logout(): Promise<void> {
    await request<void>('POST', '/auth/logout');
  },

  async me(): Promise<Principal | null> {
    try {
      const body = await request<{ user: Principal }>('GET', '/auth/me');
      return body.user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },

  async today(goal?: number): Promise<TodayView> {
    const query = goal ? `?goal=${encodeURIComponent(goal)}` : '';
    return request<TodayView>('GET', `/student/today${query}`);
  },

  async next(goal?: number): Promise<ExerciseView> {
    const query = goal ? `?goal=${encodeURIComponent(goal)}` : '';
    return request<ExerciseView>('POST', `/student/exercises/next${query}`);
  },

  async exercise(sessionId: string): Promise<ExerciseView> {
    return request<ExerciseView>('GET', `/student/exercises/${encodeURIComponent(sessionId)}`);
  },

  async answer(sessionId: string, submissionToken: string, answer: string): Promise<ResultView> {
    return request<ResultView>(
      'POST',
      `/student/exercises/${encodeURIComponent(sessionId)}/answers`,
      {
        submissionToken,
        answer,
      },
    );
  },

  async result(sessionId: string): Promise<ResultView> {
    return request<ResultView>('GET', `/student/exercises/${encodeURIComponent(sessionId)}/result`);
  },

  async recoverResult(sessionId: string): Promise<ResultView> {
    return request<ResultView>(
      'POST',
      `/student/exercises/${encodeURIComponent(sessionId)}/result/recover`,
    );
  },
};
