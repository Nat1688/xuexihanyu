/**
 * Content HTTP controller (CP-01).
 *
 * Exposes the teacher-managed content authoring + deterministic read surface.
 * Every mutating route is guarded by BOTH `AuthGuard` (authentication) and
 * `RoleGuard` (authorization) with a `@RequireRoles('TEACHER', 'ADMIN')`
 * declaration, in that ORDER — so authorization only ever runs against a
 * server-resolved principal. The AUTHORITATIVE, per-object decision (a TEACHER
 * may mutate only their OWN content; an ADMIN any) is applied inside
 * {@link ContentService} via the domain policy, because it depends on the
 * node's recorded author, which the role guard cannot know.
 *
 * Routes (prefix `/content`):
 *   POST /content/courses                                  author a course
 *   GET  /content/courses                                  list readable courses
 *   POST /content/courses/:coursePublicId/units            author a unit
 *   GET  /content/courses/:coursePublicId/units            list readable units
 *   POST /content/units/:unitPublicId/lessons              author a lesson
 *   GET  /content/units/:unitPublicId/lessons              list readable lessons
 *   POST /content/items                                    author a learning item
 *   GET  /content/items?kind=...                           list items by kind
 *   POST /content/lessons/:lessonPublicId/items            associate an item
 *   GET  /content/lessons/:lessonPublicId/items            list a lesson's items
 *
 * Reads are deterministic (stable ordering) and visibility-filtered server-side.
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

import { AuthGuard, readCookie } from '../../identity/http/auth.guard';
import { CsrfInvalidError } from '../../identity/application/auth-errors';
import { CSRF_COOKIE_NAME } from '../../identity/application/cookie-policy';
import { CSRF_HEADER, verifyCsrfProof } from '../../identity/domain/csrf';
import { type AuthenticatedRequest } from '../../identity/http/authenticated-request';
import { RequireRoles } from '../../identity/http/require-roles';
import { RoleGuard } from '../../identity/http/role.guard';
import { type ContentActor, type LearningItemKind } from '../domain';
import { ContentService, type ItemDraft, type NodeDraft } from '../application/content-service';
import { ContentExceptionFilter } from './content-exception.filter';

/** Extract the server-derived actor context from a validated request. */
function actorOf(req: AuthenticatedRequest): ContentActor {
  const principal = req.auth!.principal;
  return { userId: principal.userId, roles: principal.roles };
}

function assertCsrf(req: AuthenticatedRequest): void {
  const auth = req.auth;
  if (!auth) throw new CsrfInvalidError();
  const headerToken = req.headers[CSRF_HEADER];
  if (
    !verifyCsrfProof({
      cookieToken: readCookie(req.headers.cookie, CSRF_COOKIE_NAME),
      headerToken: Array.isArray(headerToken) ? headerToken[0] : headerToken,
      sessionHash: auth.csrfHash,
    })
  )
    throw new CsrfInvalidError();
}

@Controller('content')
@UseGuards(AuthGuard, RoleGuard)
@UseFilters(ContentExceptionFilter)
export class ContentController {
  constructor(private readonly content: ContentService) {}

  // --- courses -----------------------------------------------------------

  @Post('courses')
  @RequireRoles('TEACHER', 'ADMIN')
  @HttpCode(201)
  async createCourse(
    @Req() req: AuthenticatedRequest,
    @Body() body: NodeDraft,
  ): Promise<Record<string, unknown>> {
    assertCsrf(req);
    const node = await this.content.createCourse(actorOf(req), body);
    return projectNode(node);
  }

  @Get('courses')
  async listCourses(@Req() req: AuthenticatedRequest): Promise<Record<string, unknown>[]> {
    const nodes = await this.content.listCourses(actorOf(req));
    return nodes.map(projectNode);
  }

  // --- units -------------------------------------------------------------

  @Post('courses/:coursePublicId/units')
  @RequireRoles('TEACHER', 'ADMIN')
  @HttpCode(201)
  async createUnit(
    @Req() req: AuthenticatedRequest,
    @Param('coursePublicId') coursePublicId: string,
    @Body() body: NodeDraft,
  ): Promise<Record<string, unknown>> {
    assertCsrf(req);
    const node = await this.content.createUnit(actorOf(req), coursePublicId, body);
    return projectNode(node);
  }

  @Get('courses/:coursePublicId/units')
  async listUnits(
    @Req() req: AuthenticatedRequest,
    @Param('coursePublicId') coursePublicId: string,
  ): Promise<Record<string, unknown>[]> {
    const nodes = await this.content.listUnits(actorOf(req), coursePublicId);
    return (nodes ?? []).map(projectNode);
  }

  // --- lessons -----------------------------------------------------------

  @Post('units/:unitPublicId/lessons')
  @RequireRoles('TEACHER', 'ADMIN')
  @HttpCode(201)
  async createLesson(
    @Req() req: AuthenticatedRequest,
    @Param('unitPublicId') unitPublicId: string,
    @Body() body: NodeDraft,
  ): Promise<Record<string, unknown>> {
    assertCsrf(req);
    const node = await this.content.createLesson(actorOf(req), unitPublicId, body);
    return projectNode(node);
  }

  @Get('units/:unitPublicId/lessons')
  async listLessons(
    @Req() req: AuthenticatedRequest,
    @Param('unitPublicId') unitPublicId: string,
  ): Promise<Record<string, unknown>[]> {
    const nodes = await this.content.listLessons(actorOf(req), unitPublicId);
    return (nodes ?? []).map(projectNode);
  }

  // --- learning items ----------------------------------------------------

  @Post('items')
  @RequireRoles('TEACHER', 'ADMIN')
  @HttpCode(201)
  async createItem(
    @Req() req: AuthenticatedRequest,
    @Body() body: ItemDraft,
  ): Promise<Record<string, unknown>> {
    assertCsrf(req);
    const item = await this.content.createItem(actorOf(req), body);
    return projectItem(item);
  }

  @Get('items')
  @RequireRoles('TEACHER', 'ADMIN')
  async listItems(
    @Req() req: AuthenticatedRequest,
    @Query('kind') kind: LearningItemKind,
  ): Promise<Record<string, unknown>[]> {
    const items = await this.content.listItemsByKind(actorOf(req), kind);
    return items.map(projectItem);
  }

  @Post('lessons/:lessonPublicId/items')
  @RequireRoles('TEACHER', 'ADMIN')
  @HttpCode(204)
  async attachItem(
    @Req() req: AuthenticatedRequest,
    @Param('lessonPublicId') lessonPublicId: string,
    @Body() body: { learningItemPublicId: string; position?: unknown },
  ): Promise<void> {
    assertCsrf(req);
    await this.content.attachItemToLesson(
      actorOf(req),
      lessonPublicId,
      body.learningItemPublicId,
      body.position,
    );
  }

  @Get('lessons/:lessonPublicId/items')
  async listLessonItems(
    @Req() req: AuthenticatedRequest,
    @Param('lessonPublicId') lessonPublicId: string,
  ): Promise<Array<{ learningItemPublicId: string; position: number }>> {
    const rows = await this.content.listLessonItems(actorOf(req), lessonPublicId);
    return rows ?? [];
  }
}

// --- projections (never surface the internal surrogate id) -----------------

function projectNode(node: {
  publicId: string;
  slug: string;
  title: string;
  description: string | null;
  visibility: string;
  position: number;
}): Record<string, unknown> {
  return {
    publicId: node.publicId,
    slug: node.slug,
    title: node.title,
    description: node.description,
    visibility: node.visibility,
    position: node.position,
  };
}

function projectItem(item: {
  publicId: string;
  kind: string;
  simplified: string | null;
  traditional: string | null;
  pinyin: string | null;
  meaning: string | null;
  hskLevel: number | null;
  reference: Record<string, unknown> | null;
}): Record<string, unknown> {
  return {
    publicId: item.publicId,
    kind: item.kind,
    simplified: item.simplified,
    traditional: item.traditional,
    pinyin: item.pinyin,
    meaning: item.meaning,
    hskLevel: item.hskLevel,
    reference: item.reference,
  };
}
