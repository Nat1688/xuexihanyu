-- ENROLL-01 additive only: no existing user/course/history modifications.
CREATE TYPE "CourseApplicationStatus" AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED');
CREATE TABLE "course_applications" (
 "id" UUID NOT NULL, "public_id" UUID NOT NULL, "student_id" UUID NOT NULL, "course_id" UUID NOT NULL,
 "status" "CourseApplicationStatus" NOT NULL DEFAULT 'PENDING', "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "decided_at" TIMESTAMPTZ(6), "reviewer_id" UUID, "class_id" UUID, "reason" VARCHAR(500),
 CONSTRAINT "course_applications_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "course_application_decision_consistency" CHECK (
   (status='PENDING' AND decided_at IS NULL AND reviewer_id IS NULL AND class_id IS NULL AND reason IS NULL) OR
   (status='APPROVED' AND decided_at IS NOT NULL AND reviewer_id IS NOT NULL AND class_id IS NOT NULL) OR
   (status='REJECTED' AND decided_at IS NOT NULL AND reviewer_id IS NOT NULL AND class_id IS NULL) OR
   (status='CANCELLED' AND decided_at IS NOT NULL AND reviewer_id IS NULL AND class_id IS NULL)
 )
);
CREATE UNIQUE INDEX "course_applications_public_id_key" ON "course_applications"("public_id");
CREATE UNIQUE INDEX "course_applications_live_unique" ON "course_applications"("student_id","course_id") WHERE status IN ('PENDING','APPROVED');
CREATE INDEX "course_applications_student_id_created_at_idx" ON "course_applications"("student_id","created_at");
CREATE INDEX "course_applications_course_id_status_created_at_idx" ON "course_applications"("course_id","status","created_at");
ALTER TABLE "course_applications" ADD CONSTRAINT "course_applications_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "course_applications" ADD CONSTRAINT "course_applications_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "course_applications" ADD CONSTRAINT "course_applications_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "course_applications" ADD CONSTRAINT "course_applications_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "teaching_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
