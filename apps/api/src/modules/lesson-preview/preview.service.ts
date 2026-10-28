import { HttpException, Inject, Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';
import { SERVER_CONFIG } from '../../config/config.module';
import { type ServerConfig } from '../../config/config.schema';
import { normalizeForField } from '../exercise/domain/normalization';
import { loadCatalog, type Catalog } from './catalog';

const language = z.enum(['vi', 'en']);
const revision = z.string().min(1).max(80);
export const querySchema = z
  .object({ instructionLanguage: language, revision: revision.optional() })
  .strict();
const checkSchema = z
  .object({
    instructionLanguage: language,
    revision,
    taskId: z.string().min(1).max(80),
    answer: z.string().refine((x) => [...x].length <= 200),
  })
  .strict();

export function previewEnabled(config: Readonly<ServerConfig>): boolean {
  return (
    config.LC03B_PREVIEW_ENABLED === 'true' &&
    config.NODE_ENV === 'development' &&
    config.POSTGRES_HOST === '127.0.0.1' &&
    config.POSTGRES_PORT === 55438 &&
    config.POSTGRES_DB === 'clp_lc03b_test' &&
    config.API_PORT === 3108 &&
    config.SPA_ORIGIN === 'http://127.0.0.1:5198'
  );
}
export const PREVIEW_TARGET_VERIFIED = Symbol('LC03B_PREVIEW_TARGET_VERIFIED');
export const PREVIEW_CATALOGS = Symbol('LC03B_PREVIEW_CATALOGS');

function failure(status: number): never {
  throw new HttpException(
    {
      error: {
        code: status === 404 ? 'LESSON_PREVIEW_UNAVAILABLE' : 'LESSON_PREVIEW_INVALID',
        message: status === 404 ? 'Lesson preview unavailable.' : 'Invalid preview request.',
      },
    },
    status,
  );
}

@Injectable()
export class PreviewService {
  // No repository, event, session or mastery dependency: practice cannot write progress.
  private readonly catalogs: readonly Catalog[];
  constructor(
    @Inject(SERVER_CONFIG) private readonly config: Readonly<ServerConfig>,
    @Inject(PREVIEW_TARGET_VERIFIED) private readonly targetVerified: boolean,
    @Optional() @Inject(PREVIEW_CATALOGS) releases?: readonly Catalog[],
  ) {
    this.catalogs = releases ?? [loadCatalog()];
  }

  private ensure(revisionId?: string) {
    if (!previewEnabled(this.config) || !this.targetVerified) failure(404);
    const catalog = revisionId
      ? this.catalogs.find((x) => x.revision === revisionId)
      : this.catalogs.at(-1);
    if (!catalog) failure(404);
    return catalog;
  }
  availability(input: unknown = {}) {
    if (!z.object({}).strict().safeParse(input).success) failure(400);
    return {
      available: previewEnabled(this.config) && this.targetVerified && this.catalogs.length > 0,
    };
  }
  read(input: unknown) {
    this.ensure();
    const parsed = querySchema.safeParse(input);
    if (!parsed.success) failure(400);
    const q = parsed.data;
    const catalog = this.ensure(q.revision);
    const v = catalog.variants.find((x) => x.language === q.instructionLanguage);
    if (!v) failure(404);
    return {
      packageId: catalog.packageId,
      variantId: v.variantId,
      revision: catalog.revision,
      instructionLanguage: v.language,
      status: 'PREVIEW_ONLY' as const,
      practiceOnly: true as const,
      recordsProgress: false as const,
      title: v.title,
      notice: v.notice,
      objectives: [...v.objectives],
      concepts: catalog.concepts.map((x) => ({
        id: x.id,
        hanzi: x.hanzi,
        pinyin: x.pinyin,
        gloss: x.gloss[v.language],
      })),
      dialogue: catalog.dialogue.map((x) => ({
        speaker: x.speaker,
        hanzi: x.hanzi,
        pinyin: x.pinyin,
        translation: x.translation[v.language],
      })),
      blocks: v.blocks.map((x) => ({ id: x.id, kind: x.kind, title: x.title, text: x.text })),
      practices: catalog.tasks.map((x) => ({
        taskId: x.id,
        format: x.format,
        prompt: x.prompt[v.language],
        options: x.options ? [...x.options] : null,
      })),
    };
  }
  check(input: unknown) {
    this.ensure();
    const parsed = checkSchema.safeParse(input);
    if (!parsed.success || Buffer.byteLength(JSON.stringify(input), 'utf8') > 8192) failure(400);
    const b = parsed.data;
    const catalog = this.ensure(b.revision);
    if (!catalog.variants.some((x) => x.language === b.instructionLanguage)) failure(404);
    const task = catalog.tasks.find((x) => x.id === b.taskId);
    if (!task) failure(404);
    const received = normalizeForField(task.field, b.answer);
    if (task.options && !task.options.some((x) => normalizeForField(task.field, x) === received))
      failure(400);
    const correct = received === normalizeForField(task.field, task.expected);
    return {
      revision: b.revision,
      taskId: task.id,
      instructionLanguage: b.instructionLanguage,
      correct,
      feedback: (correct ? task.correct : task.incorrect)[b.instructionLanguage],
      practiceOnly: true,
      recordsProgress: false,
      status: 'PREVIEW_ONLY',
    };
  }
}
