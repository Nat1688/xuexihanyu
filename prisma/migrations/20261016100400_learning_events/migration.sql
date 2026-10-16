-- CP-03 — Learning Events (append-only, versioned interaction evidence).
--
-- Approved scope (CP-03):
--   learning_events — IMMUTABLE interaction evidence. One row per learner
--                     interaction, carrying:
--                       * public_id      — non-guessable external UUID.
--                       * schema_version — payload contract version (bounded).
--                       * type           — closed LearningEventType vocabulary.
--                       * actor_id       — server-derived acting user (FK).
--                       * course/unit/lesson/learning_item — OPTIONAL content
--                                          references (FK, nullable).
--                       * exercise_ref   — opaque CP-02 exercise/instance ref.
--                       * occurred_at    — UTC instant the interaction occurred.
--                       * metadata       — BOUNDED, allow-listed JSONB.
--                       * created_at     — server receipt time (UTC).
--
-- There is NO update/delete path: mutation is forbidden by the application
-- boundary (repository exposes append only; the service has no update/delete
-- method). Events are EVIDENCE, not derived progress.
--
-- Hand-written to match the deterministic Prisma diff format (no live/shadow
-- database available in this environment; provider pinned to postgresql).
-- Append-only: never edit once applied.
--
-- FORBIDDEN here (CP-03 explicit): mastery/review scheduling/progress
-- projection (CP-04), student MVP UI flow, analytics dashboard, AI, event
-- broker/microservice, mutable event endpoint, raw answer/secret/session
-- payload.

-- CreateEnum
CREATE TYPE "LearningEventType" AS ENUM ('LESSON_STARTED', 'LESSON_COMPLETED', 'EXERCISE_PRESENTED', 'ANSWER_SUBMITTED', 'EXERCISE_COMPLETED', 'REVIEW_ACTIVITY');

-- CreateTable
CREATE TABLE "learning_events" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "type" "LearningEventType" NOT NULL,
    "actor_id" UUID NOT NULL,
    "course_id" UUID,
    "unit_id" UUID,
    "lesson_id" UUID,
    "learning_item_id" UUID,
    "exercise_ref" VARCHAR(200),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "learning_events_public_id_key" ON "learning_events"("public_id");

-- CreateIndex
CREATE INDEX "learning_events_actor_id_occurred_at_idx" ON "learning_events"("actor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "learning_events_occurred_at_id_idx" ON "learning_events"("occurred_at", "id");

-- CreateIndex
CREATE INDEX "learning_events_type_idx" ON "learning_events"("type");

-- AddForeignKey
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_learning_item_id_fkey" FOREIGN KEY ("learning_item_id") REFERENCES "learning_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
