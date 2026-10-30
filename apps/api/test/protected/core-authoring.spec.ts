import { FakeContentRepository, makeContentService } from '../support/fake-content-repository';
import {
  type ContentActor,
  ContentNotFoundError,
  ContentValidationError,
} from '../../src/modules/content/domain';
import { ForbiddenError } from '../../src/modules/identity/application/auth-errors';
const owner: ContentActor = { userId: 'owner', roles: ['TEACHER'] };
const student: ContentActor = { userId: 'student', roles: ['STUDENT'] };
const stranger: ContentActor = { userId: 'other', roles: ['TEACHER'] };
async function setup() {
  const repo = new FakeContentRepository();
  const service = makeContentService(repo);
  const course = await service.createCourse(owner, {
    title: 'Khóa học',
    slug: 'course',
    visibility: 'PUBLISHED',
  });
  const unit = await service.createUnit(owner, course.publicId, {
    title: 'Chương',
    slug: 'unit',
    visibility: 'PUBLISHED',
  });
  const lesson = await service.createLesson(owner, unit.publicId, {
    title: 'Chào hỏi',
    slug: 'lesson',
  });
  return { repo, service, course, lesson };
}
const item = { kind: 'VOCABULARY', simplified: '你好', pinyin: 'nǐ hǎo', meaning: 'Xin chào' };
describe('CORE-01 lesson composition', () => {
  it('persists draft, publishes ordered items and retains unchanged identities on reorder', async () => {
    const { service, lesson } = await setup();
    const draft = await service.saveLesson(owner, lesson.publicId, {
      ...lesson,
      items: [item, { ...item, simplified: '谢谢', meaning: 'Cảm ơn' }],
    });
    await expect(service.readLesson(student, lesson.publicId)).rejects.toBeInstanceOf(
      ContentNotFoundError,
    );
    const published = await service.saveLesson(owner, lesson.publicId, {
      ...lesson,
      visibility: 'PUBLISHED',
      items: [...draft.items].reverse(),
    });
    expect(published.items.map((row) => row.publicId)).toEqual(
      draft.items.map((row) => row.publicId).reverse(),
    );
    expect((await service.readLesson(student, lesson.publicId)).items[0].simplified).toBe('谢谢');
  });
  it('preserves original item when edited or removed; never overwrites source evidence', async () => {
    const { service, repo, lesson } = await setup();
    const first = await service.saveLesson(owner, lesson.publicId, { ...lesson, items: [item] });
    const oldId = first.items[0].publicId;
    const second = await service.saveLesson(owner, lesson.publicId, {
      ...lesson,
      items: [{ ...first.items[0], meaning: 'Chào bạn' }],
    });
    expect(second.items[0].publicId).not.toBe(oldId);
    expect((await repo.findItemByPublicId(oldId))?.meaning).toBe('Xin chào');
    await service.saveLesson(owner, lesson.publicId, { ...lesson, items: [] });
    expect((await service.readLesson(owner, lesson.publicId)).items).toEqual([]);
    expect(await repo.findItemByPublicId(oldId)).not.toBeNull();
  });
  it('rejects cross-owner/student writes, invalid items and empty publication without changing saved data', async () => {
    const { service, lesson } = await setup();
    for (const actor of [student, stranger])
      await expect(
        service.saveLesson(actor, lesson.publicId, { ...lesson, items: [item] }),
      ).rejects.toThrow();
    await expect(
      service.saveLesson(owner, lesson.publicId, { ...lesson, items: [{ kind: 'VOCABULARY' }] }),
    ).rejects.toBeInstanceOf(ContentValidationError);
    await expect(
      service.saveLesson(owner, lesson.publicId, { ...lesson, visibility: 'PUBLISHED', items: [] }),
    ).rejects.toBeInstanceOf(ContentValidationError);
    expect((await service.readLesson(owner, lesson.publicId)).lesson.visibility).toBe('DRAFT');
  });
  it('course editing retains slug and ownership and denies other teachers', async () => {
    const { service, course } = await setup();
    await expect(
      service.editCourse(stranger, course.publicId, { ...course, title: 'Khác' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(
      (
        await service.editCourse(owner, course.publicId, {
          ...course,
          title: 'Mới',
          slug: 'ignored',
        })
      ).slug,
    ).toBe(course.slug);
  });
});
// CORE-01 protects long-lived browser editors from silently overwriting content.
it('rejects stale revision before replacing the latest composition', async () => {
  const { service, lesson } = await setup();
  const initial = await service.readLesson(owner, lesson.publicId);
  await service.saveLesson(owner, lesson.publicId, {
    ...lesson,
    title: 'Mới',
    revision: initial.revision,
    items: [item],
  });
  await expect(
    service.saveLesson(owner, lesson.publicId, {
      ...lesson,
      revision: initial.revision,
      items: [],
    }),
  ).rejects.toThrow('lesson changed');
  expect((await service.readLesson(owner, lesson.publicId)).lesson.title).toBe('Mới');
});
