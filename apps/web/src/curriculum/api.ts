import { request } from '../api/client';
import type { ContentNode } from '../api/teacher';
export interface LessonItem {
  publicId?: string;
  kind: string;
  simplified: string | null;
  pinyin: string | null;
  meaning: string | null;
  traditional?: string | null;
  hskLevel?: number | null;
  reference?: Record<string, unknown> | null;
}
export interface LessonDocument {
  revision?: string;
  lesson: ContentNode;
  items: LessonItem[];
}
export const curriculumApi = {
  read: (id: string) =>
    request<LessonDocument>('GET', `/content/lessons/${encodeURIComponent(id)}`),
  save: (id: string, document: LessonDocument, visibility: string) =>
    request<LessonDocument>('POST', `/content/lessons/${encodeURIComponent(id)}/save`, {
      ...document.lesson,
      revision: document.revision,
      visibility,
      items: document.items,
    }),
  create: (path: string, title: string, position: number) =>
    request<ContentNode>('POST', `/content/${path}`, {
      title,
      slug: `bai-${crypto.randomUUID()}`,
      position,
      visibility: path === 'courses' || path.endsWith('/units') ? 'PUBLISHED' : 'DRAFT',
    }),
  editCourse: (course: ContentNode, title: string, description: string) =>
    request<ContentNode>('POST', `/content/courses/${course.publicId}/save`, {
      ...course,
      title,
      description,
    }),
};
