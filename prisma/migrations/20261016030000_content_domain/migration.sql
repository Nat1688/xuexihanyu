-- CP-01 — Content Domain (teacher-managed curriculum hierarchy + reusable
-- Chinese-aware learning items).
--
-- Approved scope (CP-01):
--   courses              — top of the hierarchy; UNIQUE slug, indexed position
--                          (ordering only; NOT globally unique), author
--                          (TEACHER/ADMIN), DRAFT|PUBLISHED visibility.
--   units                — one course parent; ordered per course; UNIQUE
--                          (course_id, slug) and (course_id, position).
--   lessons              — one unit parent; ordered per unit; UNIQUE
--                          (unit_id, slug) and (unit_id, position).
--   learning_items       — reusable item library with an explicit kind
--                          (VOCABULARY/CHARACTER/GRAMMAR/EXAMPLE/
--                          MEDIA_REFERENCE) and Chinese-specific fields
--                          (simplified/traditional/pinyin/meaning/hsk_level/
--                          reference JSON).
--   lesson_learning_items— ordered lesson<->item association (composite PK +
--                          UNIQUE (lesson_id, position)).
--
-- Generated with `prisma migrate diff --from-url <clp_test current>
-- --to-schema-datamodel prisma/schema.prisma --script` (deterministic; no
-- shadow database). Append-only: never edit once applied.
--
-- FORBIDDEN here (CP-01 explicit): exercise instance/answer/evaluation (CP-02),
-- learning events (CP-03), mastery/review (CP-04), media storage/upload
-- provider, import/export, AI, analytics, public marketplace, assignment/
-- enrollment or student progress. Deterministic read retrieval only.

-- CreateEnum
CREATE TYPE "ContentVisibility" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "LearningItemKind" AS ENUM ('VOCABULARY', 'CHARACTER', 'GRAMMAR', 'EXAMPLE', 'MEDIA_REFERENCE');

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "visibility" "ContentVisibility" NOT NULL DEFAULT 'DRAFT',
    "author_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "visibility" "ContentVisibility" NOT NULL DEFAULT 'DRAFT',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "visibility" "ContentVisibility" NOT NULL DEFAULT 'DRAFT',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_items" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "kind" "LearningItemKind" NOT NULL,
    "simplified" VARCHAR(200),
    "traditional" VARCHAR(200),
    "pinyin" VARCHAR(200),
    "meaning" TEXT,
    "hsk_level" INTEGER,
    "reference" JSONB,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "learning_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_learning_items" (
    "lesson_id" UUID NOT NULL,
    "learning_item_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_learning_items_pkey" PRIMARY KEY ("lesson_id","learning_item_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courses_public_id_key" ON "courses"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "courses_slug_key" ON "courses"("slug");

-- CreateIndex
CREATE INDEX "courses_position_idx" ON "courses"("position");

-- CreateIndex
CREATE INDEX "courses_visibility_idx" ON "courses"("visibility");

-- CreateIndex
CREATE UNIQUE INDEX "units_public_id_key" ON "units"("public_id");

-- CreateIndex
CREATE INDEX "units_course_id_idx" ON "units"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "units_course_id_position_key" ON "units"("course_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "units_course_id_slug_key" ON "units"("course_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_public_id_key" ON "lessons"("public_id");

-- CreateIndex
CREATE INDEX "lessons_unit_id_idx" ON "lessons"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_unit_id_position_key" ON "lessons"("unit_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_unit_id_slug_key" ON "lessons"("unit_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "learning_items_public_id_key" ON "learning_items"("public_id");

-- CreateIndex
CREATE INDEX "learning_items_kind_idx" ON "learning_items"("kind");

-- CreateIndex
CREATE INDEX "lesson_learning_items_learning_item_id_idx" ON "lesson_learning_items"("learning_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_learning_items_lesson_id_position_key" ON "lesson_learning_items"("lesson_id", "position");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_learning_items" ADD CONSTRAINT "lesson_learning_items_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_learning_items" ADD CONSTRAINT "lesson_learning_items_learning_item_id_fkey" FOREIGN KEY ("learning_item_id") REFERENCES "learning_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

