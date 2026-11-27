declare module '*/demo-fixtures.cjs' {
  interface DemoItem {
    kind: string;
    simplified: string;
    traditional?: string;
    pinyin?: string;
    meaning: string;
    hskLevel?: number;
    reference?: unknown;
  }
  interface DemoLesson {
    slug: string;
    title: string;
    description: string;
    position: number;
    items: DemoItem[];
  }
  export const DEMO_COURSE: {
    slug: string;
    title: string;
    description: string;
    position: number;
    units: { slug: string; title: string; position: number; lessons: DemoLesson[] }[];
  };
  export const DEMO_CLASS: { title: string; term: string };
  export const DEMO_AUTHOR_KEY: string;
  export const DEMO_CLASS_OWNER_KEY: string;
  export const DEMO_STUDENT_KEYS: string[];
  export const DEMO_ASSIGNMENTS: { dueInDays: number };
  export function listDemoLessons(): {
    unitSlug: string;
    lessonSlug: string;
    lessonTitle: string;
    items: DemoItem[];
  }[];
}
declare module '*/db-seed-demo.cjs' {
  export const DEMO_DB_NAME: string;
  export const CONFIRMATION: string;
  export function assertDemoTarget(
    raw?: string,
    confirmation?: string,
    environment?: string,
  ): { allowed: true; target: string } | { allowed: false; reason: string };
  export function demoId(key: string): string;
  export function runDemoSeed(options: {
    url: string;
    confirmation: string;
    password: string;
    now?: Date;
    onPhase?: (phase: string) => Promise<void>;
  }): Promise<Record<string, number>>;
}
