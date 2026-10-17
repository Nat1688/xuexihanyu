/**
 * Student HTTP controller (CP-05).
 *
 * The single student-facing surface. Every route is guarded by `AuthGuard`
 * (server-resolved session) and `RoleGuard` (`@RequireRoles('STUDENT')`); the
 * acting learner is ALWAYS taken from `req.auth.principal.publicId`, never from
 * the URL or body, so a caller cannot address another learner's state.
 *
 * Routes (prefix `/student`):
 *   GET  /student/today                      TODAY (queue + counts + empty state)
 *   POST /student/exercises/next             CONTINUE (issue the next exercise)
 *   GET  /student/exercises/:sessionId       EXERCISE (no answer key)
 *   POST /student/exercises/:sessionId/answers  RESULT (submit, idempotent)
 *   GET  /student/exercises/:sessionId/result   RESULT (stable re-read)
 *
 * Mutating POSTs additionally verify the session's CSRF double-submit proof
 * (same contract as `POST /auth/logout`), because `AuthGuard` does not.
 *
 * No route here exposes teacher/admin data, analytics, or another learner.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { CsrfInvalidError } from '../../identity/application/auth-errors';
import { CSRF_HEADER, verifyCsrfProof } from '../../identity/domain/csrf';
import { AuthGuard, readCookie } from '../../identity/http/auth.guard';
import { type AuthenticatedRequest } from '../../identity/http/authenticated-request';
import { RequireRoles } from '../../identity/http/require-roles';
import { RoleGuard } from '../../identity/http/role.guard';
import { CSRF_COOKIE_NAME } from '../../identity/application/cookie-policy';
import {
  StudentService,
  type ActorContext,
  type ExerciseView,
  type ResultView,
  type TodayView,
} from '../application/student-service';
import { StudentInvalidTokenError } from '../domain';
import { StudentExceptionFilter } from './student-exception.filter';

/** Extract the server-derived actor context from a validated request. */
function actorOf(req: AuthenticatedRequest): ActorContext {
  const principal = req.auth!.principal;
  return { publicId: principal.publicId, roles: principal.roles };
}

/** Verify the double-submit CSRF proof against the resolved session. */
function assertCsrf(req: AuthenticatedRequest): void {
  const auth = req.auth;
  if (!auth) throw new CsrfInvalidError();
  const cookieToken = readCookie(req.headers.cookie, CSRF_COOKIE_NAME);
  const headerToken = req.headers[CSRF_HEADER];
  const ok = verifyCsrfProof({
    cookieToken,
    headerToken: Array.isArray(headerToken) ? headerToken[0] : headerToken,
    sessionHash: auth.csrfHash,
  });
  if (!ok) throw new CsrfInvalidError();
}

/** Learner-facing projection (explicit allow-list; no answer key, ever). */
function projectExercise(view: ExerciseView): Record<string, unknown> {
  return {
    sessionId: view.sessionPublicId,
    lessonId: view.lessonPublicId,
    mode: view.mode,
    format: view.format,
    prompt: view.prompt,
    options: view.options,
    expiresAt: view.expiresAt.toISOString(),
    alreadyAnswered: view.alreadyAnswered,
  };
}

function projectToday(view: TodayView): Record<string, unknown> {
  return {
    generatedAt: view.generatedAt.toISOString(),
    dailyGoal: view.dailyGoal,
    completedToday: view.completedToday,
    remaining: view.remaining,
    entries: view.entries.map((entry) => ({
      lessonId: entry.lessonPublicId,
      lessonTitle: entry.lessonTitle,
      itemId: entry.learningItemPublicId,
      state: entry.state,
      dueAt: entry.dueAt ? entry.dueAt.toISOString() : null,
      due: entry.due,
    })),
    empty: view.empty,
  };
}

function projectResult(view: ResultView): Record<string, unknown> {
  return {
    sessionId: view.sessionPublicId,
    correct: view.correct,
    feedback: view.feedback,
    expected: view.expected,
    received: view.received,
    submittedAt: view.submittedAt.toISOString(),
    next: view.next,
  };
}

/** Optional query flag (`?goal=`) parsed defensively into the service. */
function goalOf(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\d{1,3}$/.test(value)) return undefined;
  return Number(value);
}

@Controller('student')
@UseGuards(AuthGuard, RoleGuard)
@RequireRoles('STUDENT')
@UseFilters(StudentExceptionFilter)
export class StudentController {
  constructor(private readonly student: StudentService) {}

  // --- TODAY -------------------------------------------------------------

  @Get('today')
  async today(
    @Req() req: AuthenticatedRequest,
    @Query('goal') goal?: string,
  ): Promise<Record<string, unknown>> {
    const view = await this.student.getToday(actorOf(req), new Date(), goalOf(goal));
    return projectToday(view);
  }

  // --- CONTINUE ----------------------------------------------------------

  @Post('exercises/next')
  @HttpCode(201)
  async next(
    @Req() req: AuthenticatedRequest,
    @Query('goal') goal?: string,
  ): Promise<Record<string, unknown>> {
    assertCsrf(req);
    const view = await this.student.startNextExercise(actorOf(req), new Date(), goalOf(goal));
    return projectExercise(view);
  }

  // --- EXERCISE ----------------------------------------------------------

  @Get('exercises/:sessionId')
  async exercise(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
  ): Promise<Record<string, unknown>> {
    const view = await this.student.getExercise(actorOf(req), sessionId, new Date());
    return projectExercise(view);
  }

  // --- RESULT ------------------------------------------------------------

  @Post('exercises/:sessionId/answers')
  @HttpCode(200)
  async answer(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: { submissionToken?: unknown; answer?: unknown },
  ): Promise<Record<string, unknown>> {
    assertCsrf(req);
    if (typeof body !== 'object' || body === null) throw new StudentInvalidTokenError();
    const view = await this.student.submitAnswer(
      actorOf(req),
      sessionId,
      body.submissionToken,
      body.answer,
      new Date(),
    );
    return projectResult(view);
  }

  @Get('exercises/:sessionId/result')
  async result(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
  ): Promise<Record<string, unknown>> {
    const view = await this.student.getResult(actorOf(req), sessionId, new Date());
    return projectResult(view);
  }
}
