import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { CsrfInvalidError } from '../identity/application/auth-errors';
import { CSRF_COOKIE_NAME } from '../identity/application/cookie-policy';
import { CSRF_HEADER, verifyCsrfProof } from '../identity/domain/csrf';
import { AuthGuard, readCookie } from '../identity/http/auth.guard';
import { type AuthenticatedRequest } from '../identity/http/authenticated-request';
import { type HttpResponse } from '../identity/http/http-types';
import { RequireRoles } from '../identity/http/require-roles';
import { RoleGuard } from '../identity/http/role.guard';
import { StudentService } from '../student/application/student-service';
import { StudentExceptionFilter } from '../student/http/student-exception.filter';
import { ClassroomService } from './classroom-service';
import { ClassroomError, requirePublicId, unavailable } from './classroom-contract';

function actor(req: AuthenticatedRequest) {
  return req.auth!.principal;
}
function csrf(req: AuthenticatedRequest): void {
  const header = req.headers[CSRF_HEADER];
  if (
    !req.auth ||
    !verifyCsrfProof({
      cookieToken: readCookie(req.headers.cookie, CSRF_COOKIE_NAME),
      headerToken: Array.isArray(header) ? header[0] : header,
      sessionHash: req.auth.csrfHash,
    })
  )
    throw new CsrfInvalidError();
}
@Catch(ClassroomError)
export class ClassroomExceptionFilter implements ExceptionFilter {
  catch(error: ClassroomError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    response.setHeader('Cache-Control', 'no-store');
    if (error.status === 429) response.setHeader('Retry-After', '60');
    response.status?.(error.status).json?.({ error: { code: error.code, message: error.message } });
  }
}

@Controller('teacher/classes')
@UseGuards(AuthGuard, RoleGuard)
@RequireRoles('TEACHER', 'ADMIN')
@UseFilters(ClassroomExceptionFilter)
export class TeacherClassroomController {
  constructor(private readonly service: ClassroomService) {}
  @Get(':classId/invitation')
  @Header('Cache-Control', 'no-store')
  invitation(@Req() req: AuthenticatedRequest, @Param('classId') id: string) {
    return this.service.invitation(actor(req), id, new Date());
  }
  @Post(':classId/invitation')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  rotate(@Req() req: AuthenticatedRequest, @Param('classId') id: string) {
    csrf(req);
    return this.service.rotate(actor(req), id, new Date());
  }
  @Post(':classId/invitation/revoke')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  revoke(@Req() req: AuthenticatedRequest, @Param('classId') id: string) {
    csrf(req);
    return this.service.revoke(actor(req), id, new Date());
  }
  @Post(':classId/enrollments')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  enroll(
    @Req() req: AuthenticatedRequest,
    @Param('classId') id: string,
    @Body() body: { login?: unknown } | undefined,
  ) {
    csrf(req);
    return this.service.enroll(actor(req), id, body?.login);
  }
}

@Controller('student')
@UseGuards(AuthGuard, RoleGuard)
@RequireRoles('STUDENT')
@UseFilters(ClassroomExceptionFilter, StudentExceptionFilter)
export class StudentClassroomController {
  constructor(
    private readonly service: ClassroomService,
    private readonly student: StudentService,
  ) {}
  @Get('classes')
  @Header('Cache-Control', 'no-store')
  async classes(@Req() req: AuthenticatedRequest) {
    return { classes: await this.service.classes(actor(req)) };
  }
  @Post('classes/join')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  join(@Req() req: AuthenticatedRequest, @Body() body: { code?: unknown } | undefined) {
    csrf(req);
    return this.service.join(actor(req), body?.code, new Date());
  }
  @Get('assignments')
  @Header('Cache-Control', 'no-store')
  async assignments(@Req() req: AuthenticatedRequest) {
    return { assignments: await this.service.assignments(actor(req)) };
  }
  @Get('progress')
  @Header('Cache-Control', 'no-store')
  progress(@Req() req: AuthenticatedRequest) {
    return this.service.progress(actor(req), new Date());
  }
  @Get('classes/:classId/assignments')
  @Header('Cache-Control', 'no-store')
  async classAssignments(@Req() req: AuthenticatedRequest, @Param('classId') id: string) {
    return { assignments: await this.service.assignments(actor(req), id) };
  }
  @Post('classes/:classId/assignments/:assignmentId/exercises/next')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  async exercise(
    @Req() req: AuthenticatedRequest,
    @Param('classId') classId: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    csrf(req);
    requirePublicId(assignmentId);
    const assignment = (await this.service.assignments(actor(req), classId)).find(
      (row) => row.assignmentId === assignmentId,
    );
    if (!assignment) unavailable();
    const view = await this.student.startLessonExercise(
      actor(req),
      assignment.lessonId,
      new Date(),
    );
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
}
