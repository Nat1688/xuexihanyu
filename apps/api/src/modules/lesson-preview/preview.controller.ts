import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  Header,
  HttpCode,
  HttpException,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { CsrfInvalidError } from '../identity/application/auth-errors';
import { CSRF_COOKIE_NAME } from '../identity/application/cookie-policy';
import { CSRF_HEADER, verifyCsrfProof } from '../identity/domain/csrf';
import { AuthGuard, readCookie } from '../identity/http/auth.guard';
import { type AuthenticatedRequest } from '../identity/http/authenticated-request';
import { RequireRoles } from '../identity/http/require-roles';
import { RoleGuard } from '../identity/http/role.guard';
import { PreviewService } from './preview.service';

@Catch(HttpException)
class PreviewHttpFilter implements ExceptionFilter {
  catch(error: HttpException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    res.setHeader('Cache-Control', 'no-store');
    res.status(error.getStatus()).json(error.getResponse());
  }
}

@Controller('student/learning-prototypes/lesson-01')
@UseGuards(AuthGuard, RoleGuard)
@RequireRoles('STUDENT')
@UseFilters(PreviewHttpFilter)
export class PreviewController {
  constructor(private readonly preview: PreviewService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  read(@Query() query: unknown) {
    return this.preview.read(query);
  }

  @Post('practice-check')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  check(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
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
    return this.preview.check(body);
  }
}
