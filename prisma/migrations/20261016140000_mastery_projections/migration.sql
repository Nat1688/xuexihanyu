-- CreateEnum
CREATE TYPE "MasteryState" AS ENUM ('NEW', 'LEARNING', 'FAMILIAR', 'MASTERED');

-- CreateTable
CREATE TABLE "mastery_projections" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "learning_item_id" UUID NOT NULL,
    "state" "MasteryState" NOT NULL,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "rule_version" INTEGER NOT NULL,
    "consecutive_correct" INTEGER NOT NULL DEFAULT 0,
    "latest_outcome_lapsed" BOOLEAN NOT NULL DEFAULT false,
    "source_last_event_at" TIMESTAMPTZ(6),
    "source_last_event_id" VARCHAR(64),
    "recomputed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mastery_projections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mastery_projections_actor_id_idx" ON "mastery_projections"("actor_id");

-- CreateIndex
CREATE INDEX "mastery_projections_due_at_idx" ON "mastery_projections"("due_at");

-- CreateIndex
CREATE INDEX "mastery_projections_state_idx" ON "mastery_projections"("state");

-- CreateIndex
CREATE UNIQUE INDEX "mastery_projections_actor_id_learning_item_id_key" ON "mastery_projections"("actor_id", "learning_item_id");

-- AddForeignKey
ALTER TABLE "mastery_projections" ADD CONSTRAINT "mastery_projections_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_projections" ADD CONSTRAINT "mastery_projections_learning_item_id_fkey" FOREIGN KEY ("learning_item_id") REFERENCES "learning_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
