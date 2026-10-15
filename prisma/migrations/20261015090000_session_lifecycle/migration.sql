-- CLP-00-06 — Session Lifecycle (ADR-003).
--
-- Approved scope: exactly ONE further table, `sessions`.
--   sessions — opaque SERVER-SIDE session. The browser holds only an opaque
--              random token in an HttpOnly cookie; only the token's SHA-256
--              hash is persisted here (`token_hash`, UNIQUE), so a database
--              read cannot reconstruct a usable cookie. `user_id` references
--              the owning identity; created/last-used/expires/revoked
--              timestamps bound the lifetime and support rotation/revocation.
--              `csrf_hash` binds the ADR-003 double-submit CSRF token to the
--              session (only its hash is stored). NO permission/role snapshot
--              is stored (role authorization is CLP-00-07, always resolved
--              server-side from `user_roles`).
--
-- Generated with `prisma migrate diff --from-url <clp_test current>
-- --to-schema-datamodel prisma/schema.prisma --script` (deterministic; no
-- shadow database). Append-only: never edit once applied.
--
-- FORBIDDEN here (CLP-00-06): RBAC role guards/policy tables, session
-- permission/role snapshots, profile/class/enrollment, teacher/student
-- relationship, content/exercise/learning-event/mastery/reporting/AI tables,
-- password reset/SSO/registration, seed/bootstrap rows.
-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "csrf_hash" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
