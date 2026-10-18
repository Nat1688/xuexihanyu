-- CP-06: Teacher MVP — classes, enrollments, assignments, private notes.
--
-- Ownership is explicit: one teacher per class; enrollment is unique per
-- (class, student); assignment is unique per (class, student, lesson); notes
-- carry author + class + student. Progress tables are NOT created: progress is
-- derived from learning_events (CP-03) and mastery_projections (CP-04).

-- CreateTable
CREATE TABLE "teaching_classes" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "term" VARCHAR(40),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teaching_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_enrollments" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_assignments" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "due_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_notes" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "title" VARCHAR(120),
    "body" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teaching_classes_public_id_key" ON "teaching_classes"("public_id");
CREATE INDEX "teaching_classes_owner_id_created_at_idx" ON "teaching_classes"("owner_id", "created_at");
CREATE UNIQUE INDEX "class_enrollments_public_id_key" ON "class_enrollments"("public_id");
CREATE UNIQUE INDEX "class_enrollments_class_id_student_id_key" ON "class_enrollments"("class_id", "student_id");
CREATE INDEX "class_enrollments_student_id_idx" ON "class_enrollments"("student_id");
CREATE UNIQUE INDEX "lesson_assignments_public_id_key" ON "lesson_assignments"("public_id");
CREATE UNIQUE INDEX "lesson_assignments_class_id_student_id_lesson_id_key" ON "lesson_assignments"("class_id", "student_id", "lesson_id");
CREATE INDEX "lesson_assignments_class_id_student_id_idx" ON "lesson_assignments"("class_id", "student_id");
CREATE INDEX "lesson_assignments_lesson_id_idx" ON "lesson_assignments"("lesson_id");
CREATE UNIQUE INDEX "teacher_notes_public_id_key" ON "teacher_notes"("public_id");
CREATE INDEX "teacher_notes_author_id_class_id_student_id_created_at_idx" ON "teacher_notes"("author_id", "class_id", "student_id", "created_at");

-- AddForeignKey
ALTER TABLE "teaching_classes" ADD CONSTRAINT "teaching_classes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "teaching_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_assignments" ADD CONSTRAINT "lesson_assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "teaching_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_assignments" ADD CONSTRAINT "lesson_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_assignments" ADD CONSTRAINT "lesson_assignments_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teacher_notes" ADD CONSTRAINT "teacher_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teacher_notes" ADD CONSTRAINT "teacher_notes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "teaching_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teacher_notes" ADD CONSTRAINT "teacher_notes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
