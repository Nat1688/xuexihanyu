-- CP-05 Student MVP: exercise linkage + idempotent submission.
--
-- Two NEW tables only. No existing table/column is altered:
--   * `learning_events`   (CP-03) — untouched; remains the evidence of record.
--   * `mastery_projections` (CP-04) — untouched; remains the derived ordering.
--
-- `answer_sessions` stores server-generated exercises. `options` holds the
-- multiple-choice alternatives (NULL for typing); the correct answer is kept
-- ONLY in `answer_key` and is never projected to a client before submission.
--
-- `answer_submissions` stores one EFFECTIVE outcome per (session, token) so a
-- replayed submission is idempotent, and a second, different token is rejected
-- at the application layer. `learning_event_public_id` links the CP-03 event
-- appended for the submission (audit only; no FK so evidence can be rebuilt).

-- CreateEnum
CREATE TYPE "ExerciseFormatKind" AS ENUM ('MULTIPLE_CHOICE', 'TYPING');

-- CreateTable
CREATE TABLE "exercise_sessions" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "learning_item_id" UUID NOT NULL,
    "mode" VARCHAR(40) NOT NULL,
    "format" "ExerciseFormatKind" NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB,
    "answer_key" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_submissions" (
    "id" UUID NOT NULL,
    "exercise_session_id" UUID NOT NULL,
    "submission_token" VARCHAR(80) NOT NULL,
    "submitted_answer" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "feedback" VARCHAR(20) NOT NULL,
    "expected" TEXT NOT NULL,
    "received" TEXT NOT NULL,
    "learning_event_public_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answer_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exercise_sessions_public_id_key" ON "exercise_sessions"("public_id");

-- CreateIndex
CREATE INDEX "exercise_sessions_actor_id_created_at_idx" ON "exercise_sessions"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "exercise_sessions_lesson_id_idx" ON "exercise_sessions"("lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_submissions_exercise_session_id_submission_token_key" ON "answer_submissions"("exercise_session_id", "submission_token");

-- CreateIndex
CREATE INDEX "answer_submissions_exercise_session_id_idx" ON "answer_submissions"("exercise_session_id");

-- AddForeignKey
ALTER TABLE "exercise_sessions" ADD CONSTRAINT "exercise_sessions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_sessions" ADD CONSTRAINT "exercise_sessions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_sessions" ADD CONSTRAINT "exercise_sessions_learning_item_id_fkey" FOREIGN KEY ("learning_item_id") REFERENCES "learning_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_submissions" ADD CONSTRAINT "answer_submissions_exercise_session_id_fkey" FOREIGN KEY ("exercise_session_id") REFERENCES "exercise_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
