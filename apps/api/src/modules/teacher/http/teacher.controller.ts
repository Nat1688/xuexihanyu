/**
 * Teacher HTTP controller (CP-06).
 *
 * Routes (prefix `/teacher`) — every route is guarded by `AuthGuard` (server
 * session) and `RoleGuard` (`@RequireRoles('TEACHER','ADMIN')`):
 *
 *   GET  /teacher/classes                                  list MY classes
 *   POST /teacher/classes                                  create a class (mine)
 *   GET  /teacher/classes/:classId/roster                  roster
 *   POST /teacher/classes/:classId/roster                  enroll an ACTIVE account
 *   POST /teacher/classes/:classId/assignments             assign a PUBLISHED lesson
 *   GET  /teacher/classes/:classId/students/:studentId/assignments
 *   GET  /teacher/classes/:classId/students/:studentId/progress?days=
 *   GET  /teacher/classes/:classId/students/:studentId     detail (progress+evidence)
 *   GET  /teacher/classes/:classId/students/:studentId/notes   MY private notes
 *   POST /teacher/classes/:classId/students/:studentId/notes   write a private note
 *
 * The acting teacher is ALWAYS `req.auth.principal.publicId`; the URL only
 * names a class/student the service independently authorises. Mutating POSTs
 * verify the session's CSRF double-submit proof (same as `POST /auth/logout`).
 *
 * Forbidden here (contract): AI summaries, high-stakes grading, notifications,
 * analytics dashboards, global student search, direct messaging.
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
  parseDays,
  TeacherService,
  type AssignmentView,
  type ClassView,
  type NoteView,
  type RosterEntryView,
  type StudentDetailView,
  type StudentProgressView,
} from '../application/teacher-service';
import { TeacherExceptionFilter } from './teacher-exception.filter';

function actorOf(req: AuthenticatedRequest) {
  const principal = req.auth!.principal;
  return { publicId: principal.publicId, roles: principal.roles as string[] };
}

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

function projectClass(view: ClassView): Record<string, unknown> {
  return {
    classId: view.publicId,
    title: view.title,
    term: view.term,
    enrolled: view.enrollmentCount,
    createdAt: view.createdAt.toISOString(),
  };
}

function projectRoster(entry: RosterEntryView): Record<string, unknown> {
  return {
    studentId: entry.studentId,
    login: entry.login,
    displayName: entry.displayName,
    enrolledAt: entry.enrolledAt.toISOString(),
  };
}

function projectAssignment(view: AssignmentView): Record<string, unknown> {
  return {
    assignmentId: view.id,
    completion: view.completion,
    studentId: view.studentId,
    lessonId: view.lessonId,
    lessonTitle: view.lessonTitle,
    dueAt: view.dueAt ? view.dueAt.toISOString() : null,
    createdAt: view.createdAt.toISOString(),
  };
}

function projectProgress(view: StudentProgressView): Record<string, unknown> {
  return {
    studentId: view.studentId,
    classId: view.classId,
    evidence: {
      window: {
        from: view.evidence.window.from.toISOString(),
        to: view.evidence.window.to.toISOString(),
        days: view.evidence.window.days,
      },
      totalEvents: view.evidence.totalEvents,
      attempts: view.evidence.attempts,
      correct: view.evidence.correct,
      incorrect: view.evidence.incorrect,
      accuracy: view.evidence.accuracy,
      assignedLessons: view.evidence.assignedLessons,
      itemsWithEvidence: view.evidence.itemsWithEvidence,
    },
    weakItems: view.weakItems.map((item) => ({
      itemId: item.itemId,
      state: item.state,
      correct: item.correct,
      incorrect: item.incorrect,
      dueAt: item.dueAt ? item.dueAt.toISOString() : null,
    })),
  };
}

function projectDetail(view: StudentDetailView): Record<string, unknown> {
  return {
    studentId: view.studentId,
    login: view.login,
    displayName: view.displayName,
    assignments: view.assignments.map(projectAssignment),
    progress: projectProgress(view.progress),
    recentEvidence: view.recentEvidence.map((event) => ({
      eventId: event.id,
      type: event.type,
      occurredAt: event.occurredAt.toISOString(),
      accepted: event.accepted,
      lessonId: event.lessonId,
      itemId: event.itemId,
    })),
  };
}

function projectNote(view: NoteView): Record<string, unknown> {
  return {
    noteId: view.id,
    studentId: view.studentId,
    title: view.title,
    body: view.body,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
  };
}

@Controller('teacher')
@UseGuards(AuthGuard, RoleGuard)
@RequireRoles('TEACHER', 'ADMIN')
@UseFilters(TeacherExceptionFilter)
export class TeacherController {
  constructor(private readonly teacher: TeacherService) {}

  @Get('overview')
  async overview(@Req() req: AuthenticatedRequest) {
    return this.teacher.overview(actorOf(req));
  }

  // --- classes -----------------------------------------------------------

  @Get('classes')
  async classes(@Req() req: AuthenticatedRequest): Promise<{ classes: Record<string, unknown>[] }> {
    const rows = await this.teacher.listClasses(actorOf(req));
    return { classes: rows.map(projectClass) };
  }

  @Post('classes/:classId/save')
  @HttpCode(200)
  async editClass(
    @Req() req: AuthenticatedRequest,
    @Param('classId') id: string,
    @Body() body: { title?: unknown; term?: unknown },
  ) {
    assertCsrf(req);
    return projectClass(await this.teacher.editClass(actorOf(req), id, body ?? {}));
  }

  @Post('classes')
  @HttpCode(201)
  async createClass(
    @Req() req: AuthenticatedRequest,
    @Body() body: { title?: unknown; term?: unknown } | undefined,
  ): Promise<Record<string, unknown>> {
    assertCsrf(req);
    const view = await this.teacher.createClass(actorOf(req), body ?? {}, new Date());
    return projectClass(view);
  }

  // --- roster ------------------------------------------------------------

  @Get('classes/:classId/roster')
  async roster(
    @Req() req: AuthenticatedRequest,
    @Param('classId') classId: string,
  ): Promise<{ students: Record<string, unknown>[] }> {
    const rows = await this.teacher.listRoster(actorOf(req), classId);
    return { students: rows.map(projectRoster) };
  }

  @Post('classes/:classId/roster')
  @HttpCode(201)
  async enroll(
    @Req() req: AuthenticatedRequest,
    @Param('classId') classId: string,
    @Body() body: { studentId?: unknown } | undefined,
  ): Promise<Record<string, unknown>> {
    assertCsrf(req);
    const view = await this.teacher.enrollStudent(
      actorOf(req),
      classId,
      body?.studentId,
      new Date(),
    );
    return projectRoster(view);
  }

  // --- assignments -------------------------------------------------------

  @Post('classes/:classId/assignments')
  @HttpCode(201)
  async assign(
    @Req() req: AuthenticatedRequest,
    @Param('classId') classId: string,
    @Body() body: { studentId?: unknown; lessonId?: unknown; dueAt?: unknown } | undefined,
  ): Promise<Record<string, unknown>> {
    assertCsrf(req);
    const view = await this.teacher.createAssignment(actorOf(req), classId, body ?? {}, new Date());
    return projectAssignment(view);
  }

  @Get('classes/:classId/students/:studentId/assignments')
  async assignments(
    @Req() req: AuthenticatedRequest,
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
  ): Promise<{ assignments: Record<string, unknown>[] }> {
    const rows = await this.teacher.listAssignments(actorOf(req), classId, studentId);
    return { assignments: rows.map(projectAssignment) };
  }

  // --- progress ----------------------------------------------------------

  @Get('classes/:classId/students/:studentId/progress')
  async progress(
    @Req() req: AuthenticatedRequest,
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
    @Query('days') days?: string,
  ): Promise<Record<string, unknown>> {
    const view = await this.teacher.getStudentProgress(
      actorOf(req),
      classId,
      studentId,
      parseDays(days),
      new Date(),
    );
    return projectProgress(view);
  }

  @Get('classes/:classId/students/:studentId')
  async detail(
    @Req() req: AuthenticatedRequest,
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
  ): Promise<Record<string, unknown>> {
    const view = await this.teacher.getStudentDetail(actorOf(req), classId, studentId, new Date());
    return projectDetail(view);
  }

  // --- private notes -----------------------------------------------------

  @Get('classes/:classId/students/:studentId/notes')
  async notes(
    @Req() req: AuthenticatedRequest,
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
  ): Promise<{ notes: Record<string, unknown>[] }> {
    const rows = await this.teacher.listNotes(actorOf(req), classId, studentId);
    return { notes: rows.map(projectNote) };
  }

  @Post('classes/:classId/students/:studentId/notes')
  @HttpCode(201)
  async addNote(
    @Req() req: AuthenticatedRequest,
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
    @Body() body: { studentId?: unknown; title?: unknown; body?: unknown } | undefined,
  ): Promise<Record<string, unknown>> {
    assertCsrf(req);
    const view = await this.teacher.createNote(
      actorOf(req),
      classId,
      { studentId, title: body?.title, body: body?.body },
      new Date(),
    );
    return projectNote(view);
  }
}
