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
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, readCookie } from '../identity/http/auth.guard';
import { RoleGuard } from '../identity/http/role.guard';
import { RequireRoles } from '../identity/http/require-roles';
import { AuthenticatedRequest } from '../identity/http/authenticated-request';
import { CSRF_COOKIE_NAME } from '../identity/application/cookie-policy';
import { CsrfInvalidError } from '../identity/application/auth-errors';
import { CSRF_HEADER, verifyCsrfProof } from '../identity/domain/csrf';
import { DictionaryError, invalid, MAX_IMPORT_BYTES } from './domain';
import { DictionaryRateLimiter, DictionaryService } from './service';

@Catch(DictionaryError)
export class DictionaryExceptionFilter implements ExceptionFilter {
  catch(error: DictionaryError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      setHeader: (k: string, v: string) => void;
      status: (s: number) => { json: (b: unknown) => void };
    }>();
    response.setHeader('Cache-Control', 'no-store');
    response.status(error.status).json({ error: { code: error.code, message: error.message } });
  }
}
function csrf(req: AuthenticatedRequest): void {
  const token = req.headers[CSRF_HEADER];
  if (
    !req.auth ||
    !verifyCsrfProof({
      cookieToken: readCookie(req.headers.cookie, CSRF_COOKIE_NAME),
      headerToken: Array.isArray(token) ? token[0] : token,
      sessionHash: req.auth.csrfHash,
    })
  )
    throw new CsrfInvalidError();
}
type UploadRequest = AuthenticatedRequest & AsyncIterable<Buffer>;

@Controller('dictionary')
@RequireRoles('ADMIN', 'TEACHER', 'STUDENT')
@UseGuards(AuthGuard, RoleGuard)
@UseFilters(DictionaryExceptionFilter)
export class DictionaryController {
  constructor(
    private readonly dictionary: DictionaryService,
    private readonly limiter: DictionaryRateLimiter,
  ) {}
  private budget(req: AuthenticatedRequest, kind: 'read' | 'import' | 'report') {
    this.limiter.check(req.auth!.principal.publicId, kind);
  }
  @Get('admin/categories/:id/publication-preview')
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  publicationPreview(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    this.budget(req, 'read');
    return this.dictionary.publicationPreview(id);
  }
  @Post('admin/categories/:id/publication')
  @RequireRoles('ADMIN')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  publication(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    csrf(req);
    this.budget(req, 'report');
    return this.dictionary.changePublication(id, req.auth!.principal.userId, body);
  }
  @Post('admin/sources/:id/rights')
  @RequireRoles('ADMIN')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  sourceRights(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    csrf(req);
    this.budget(req, 'report');
    return this.dictionary.changeSourceRights(id, req.auth!.principal.userId, body);
  }
  @Get('entries')
  @Header('Cache-Control', 'no-store')
  search(@Req() req: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    this.budget(req, 'read');
    return this.dictionary.search(query, false);
  }
  @Get('entries/:id')
  @Header('Cache-Control', 'no-store')
  detail(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('senseAfter') after: unknown,
  ) {
    this.budget(req, 'read');
    return this.dictionary.detail(id, false, after);
  }
  @Get('categories')
  @Header('Cache-Control', 'no-store')
  categories(@Req() req: AuthenticatedRequest) {
    this.budget(req, 'read');
    return this.dictionary.categories(false);
  }
  @Post('entries/:id/reports')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  report(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    csrf(req);
    this.budget(req, 'report');
    return this.dictionary.report(id, req.auth!.principal.userId, body);
  }
  @Get('admin/overview')
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  overview(@Req() req: AuthenticatedRequest) {
    this.budget(req, 'read');
    return this.dictionary.overview();
  }
  @Get('admin/entries')
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  adminSearch(@Req() req: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    this.budget(req, 'read');
    return this.dictionary.search(query, true);
  }
  @Get('admin/entries/:id')
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  adminDetail(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('senseAfter') after: unknown,
  ) {
    this.budget(req, 'read');
    return this.dictionary.detail(id, true, after);
  }
  @Get('admin/categories')
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  adminCategories(@Req() req: AuthenticatedRequest) {
    this.budget(req, 'read');
    return this.dictionary.categories(true);
  }
  @Get('admin/imports/:id')
  @RequireRoles('ADMIN')
  @Header('Cache-Control', 'no-store')
  batch(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('afterOrdinal') after: unknown,
  ) {
    this.budget(req, 'read');
    return this.dictionary.batch(id, after);
  }
  @Post('admin/imports/dry-run')
  @RequireRoles('ADMIN')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  dryRun(@Req() req: UploadRequest) {
    return this.upload(req, true);
  }
  @Post('admin/imports')
  @RequireRoles('ADMIN')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  write(@Req() req: UploadRequest) {
    return this.upload(req, false);
  }
  private async upload(req: UploadRequest, dryRun: boolean) {
    csrf(req);
    this.budget(req, 'import');
    if (req.headers['content-type'] !== 'application/octet-stream')
      invalid('Chỉ nhận tệp dữ liệu qua kênh tải lên được hỗ trợ.');
    if (!dryRun && req.headers['x-dictionary-confirm'] !== 'IMPORT_INTERNAL_UNVERIFIED')
      invalid('Bạn cần xác nhận nhập dữ liệu nội bộ chưa hiệu đính.');
    const format = req.headers['x-dictionary-format'],
      name = req.headers['x-dictionary-filename'];
    if (typeof format !== 'string' || typeof name !== 'string') invalid();
    const length = Number(req.headers['content-length']);
    if (!Number.isFinite(length) || length < 1 || length > MAX_IMPORT_BYTES)
      throw new DictionaryError(
        413,
        'DICTIONARY_FILE_SIZE',
        'Tệp phải có dung lượng không quá 16 MB.',
      );
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > MAX_IMPORT_BYTES)
        throw new DictionaryError(413, 'DICTIONARY_FILE_SIZE', 'Tệp vượt giới hạn cho phép.');
      chunks.push(chunk);
    }
    let filename: string;
    try {
      filename = decodeURIComponent(name);
    } catch {
      return invalid();
    }
    return this.dictionary.import(
      Buffer.concat(chunks),
      format,
      filename,
      req.auth!.principal.userId,
      dryRun,
    );
  }
}
