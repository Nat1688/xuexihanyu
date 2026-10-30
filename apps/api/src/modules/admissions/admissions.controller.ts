import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, readCookie } from '../identity/http/auth.guard';
import { RoleGuard } from '../identity/http/role.guard';
import { RequireRoles } from '../identity/http/require-roles';
import { type AuthenticatedRequest } from '../identity/http/authenticated-request';
import { CsrfInvalidError } from '../identity/application/auth-errors';
import { CSRF_COOKIE_NAME } from '../identity/application/cookie-policy';
import { CSRF_HEADER, verifyCsrfProof } from '../identity/domain/csrf';
import { AdmissionsService } from './admissions.service';
function csrf(req: AuthenticatedRequest) {
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
@Controller('admissions')
@UseGuards(AuthGuard, RoleGuard)
export class AdmissionsController {
  constructor(private readonly admissions: AdmissionsService) {}
  @Get('courses')
  @RequireRoles('STUDENT')
  @Header('Cache-Control', 'no-store')
  catalog(@Req() req: AuthenticatedRequest) {
    return this.admissions.catalog(req.auth!.principal);
  }
  @Post('applications')
  @RequireRoles('STUDENT')
  @Header('Cache-Control', 'no-store')
  apply(@Req() req: AuthenticatedRequest, @Body() body: { courseId?: unknown } | undefined) {
    csrf(req);
    return this.admissions.apply(req.auth!.principal, body?.courseId);
  }
  @Post('applications/:id/cancel')
  @RequireRoles('STUDENT')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    csrf(req);
    return this.admissions.cancel(req.auth!.principal, id);
  }
  @Get('review')
  @RequireRoles('ADMIN', 'TEACHER')
  @Header('Cache-Control', 'no-store')
  queue(@Req() req: AuthenticatedRequest) {
    return this.admissions.queue(req.auth!.principal);
  }
  @Post('applications/:id/decision')
  @RequireRoles('ADMIN', 'TEACHER')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  decide(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { decision?: unknown; classId?: unknown; reason?: unknown } | undefined,
  ) {
    csrf(req);
    return this.admissions.decide(req.auth!.principal, id, body ?? {});
  }
}
