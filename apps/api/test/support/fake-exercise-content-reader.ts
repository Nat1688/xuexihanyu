/**
 * In-memory exercise content reader fake (CP-02 test support).
 *
 * A dependency-free implementation of {@link ExerciseContentReader} used by
 * unit tests so they never touch PostgreSQL. It models only the read semantics
 * the generator relies on: a lesson maps to an ordered list of item ids, and
 * only items marked approved are returned.
 */
import {
  ExerciseService,
  type ExerciseServiceDeps,
} from '../../src/modules/exercise/application/exercise-service';
import {
  type ExerciseContentReader,
  type ExerciseSourceItem,
} from '../../src/modules/exercise/application/exercise-ports';

export class FakeExerciseContentReader implements ExerciseContentReader {
  private readonly lessons = new Map<string, string[]>();
  private readonly items = new Map<string, ExerciseSourceItem>();

  /** Register a readable lesson with its ordered item ids. */
  addLesson(lessonPublicId: string, itemIds: readonly string[]): this {
    this.lessons.set(lessonPublicId, [...itemIds]);
    return this;
  }

  /** Register an approved source item. */
  addItem(item: ExerciseSourceItem): this {
    this.items.set(item.learningItemPublicId, item);
    return this;
  }

  async listApprovedItemIds(lessonPublicId: string): Promise<string[] | null> {
    const ids = this.lessons.get(lessonPublicId);
    return ids ? [...ids] : null;
  }

  async getApprovedItem(learningItemPublicId: string): Promise<ExerciseSourceItem | null> {
    return this.items.get(learningItemPublicId) ?? null;
  }
}

/** Construct an ExerciseService over the fake. */
export function makeExerciseService(
  content: ExerciseContentReader = new FakeExerciseContentReader(),
): { service: ExerciseService; content: FakeExerciseContentReader } {
  const deps: ExerciseServiceDeps = { content };
  return { service: new ExerciseService(deps), content: content as FakeExerciseContentReader };
}
