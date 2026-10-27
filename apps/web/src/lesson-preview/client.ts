import { request } from '../api/client';

export type InstructionLanguage = 'vi' | 'en';
export interface LessonPreview {
  packageId: string;
  variantId: string;
  revision: string;
  instructionLanguage: InstructionLanguage;
  status: 'PREVIEW_ONLY';
  practiceOnly: true;
  recordsProgress: false;
  title: string;
  notice: string;
  objectives: string[];
  concepts: { id: string; hanzi: string; pinyin: string; gloss: string }[];
  dialogue: { speaker: string; hanzi: string; pinyin: string; translation: string }[];
  blocks: {
    id: string;
    kind: 'explanation' | 'pronunciationNote' | 'activity';
    title: string;
    text: string;
  }[];
  practices: {
    taskId: string;
    format: 'CHOICE' | 'TEXT';
    prompt: string;
    options: string[] | null;
  }[];
}
export interface PracticeFeedback {
  revision: string;
  taskId: string;
  instructionLanguage: InstructionLanguage;
  correct: boolean;
  feedback: string;
  recordsProgress: false;
  status: 'PREVIEW_ONLY';
}
const path = '/student/learning-prototypes/lesson-01';
export const previewApi = {
  read: (language: InstructionLanguage) =>
    request<LessonPreview>('GET', `${path}?instructionLanguage=${language}`),
  check: (body: {
    instructionLanguage: InstructionLanguage;
    revision: string;
    taskId: string;
    answer: string;
  }) => request<PracticeFeedback>('POST', `${path}/practice-check`, body),
};
