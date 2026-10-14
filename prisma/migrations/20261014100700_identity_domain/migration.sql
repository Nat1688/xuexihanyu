-- CLP-00-05 — Identity Domain (ADR-004).
--
-- Approved scope: THREE identity tables only.
--   users                — stable public UUID, normalized unique login, state
--   password_credentials — 1:1 user; memory-hard hash + algorithm metadata only
--   user_roles           — membership constrained to ADMIN/TEACHER/STUDENT
--
-- Generated with `prisma migrate diff --from-empty --to-schema-datamodel`
-- (deterministic, no shadow database required). Append-only: never edit once
-- applied.
--
-- FORBIDDEN here (CLP-00-05): session/login/current-user/CSRF tables, profile/
-- class/enrollment, teacher/student relationship, content/exercise/learning-
-- event/mastery/reporting/AI tables, seed/bootstrap rows.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountState" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'TEACHER', 'STUDENT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "login" VARCHAR(320) NOT NULL,
    "login_normalized" VARCHAR(320) NOT NULL,
    "state" "AccountState" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "algorithm" VARCHAR(64) NOT NULL,
    "parameters" JSONB NOT NULL,
    "hash" VARCHAR(512) NOT NULL,
    "password_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "password_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_public_id_key" ON "users"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_login_normalized_key" ON "users"("login_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "password_credentials_user_id_key" ON "password_credentials"("user_id");

-- AddForeignKey
ALTER TABLE "password_credentials" ADD CONSTRAINT "password_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

