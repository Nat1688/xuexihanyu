import { request } from '../api/client';
import type { ContentNode } from '../api/teacher';
import { curriculumApi } from '../curriculum/api';
import { buildFlashcards, FlashcardSetupError, MAX_COURSE_LESSONS } from './model';

export async function publishedLessons(courseId: string): Promise<ContentNode[]> {
  const units = await request<ContentNode[]>(
    'GET',
    `/content/courses/${encodeURIComponent(courseId)}/units`,
  );
  const lessons: ContentNode[] = [];
  for (const unit of units.filter((row) => row.visibility === 'PUBLISHED')) {
    const rows = await request<ContentNode[]>(
      'GET',
      `/content/units/${encodeURIComponent(unit.publicId)}/lessons`,
    );
    for (const row of rows)
      if (
        row.visibility === 'PUBLISHED' &&
        !lessons.some((value) => value.publicId === row.publicId)
      )
        lessons.push(row);
  }
  return lessons;
}

export async function loadFlashcards(lessons: ContentNode[], isActive: () => boolean) {
  if (lessons.length > MAX_COURSE_LESSONS)
    throw new FlashcardSetupError(
      'Khóa học có hơn 50 bài. Hãy chọn một bài để ôn thay vì toàn bộ khóa.',
    );
  const documents = [];
  for (const lesson of lessons) {
    if (!isActive()) return null;
    const document = await curriculumApi.read(lesson.publicId);
    if (!isActive()) return null;
    if (document.lesson.publicId !== lesson.publicId || document.lesson.visibility !== 'PUBLISHED')
      throw new FlashcardSetupError(
        'Nội dung bài học đã thay đổi hoặc chưa xuất bản. Hãy tải lại danh sách.',
      );
    documents.push(document);
  }
  return buildFlashcards(documents);
}
