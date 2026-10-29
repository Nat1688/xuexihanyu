-- CL-01 additive only. No existing enrollment, identity or evidence changes.
CREATE TABLE "class_invitations" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "class_invitations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "class_invitations_class_id_key" ON "class_invitations"("class_id");
CREATE UNIQUE INDEX "class_invitations_code_hash_key" ON "class_invitations"("code_hash");
ALTER TABLE "class_invitations" ADD CONSTRAINT "class_invitations_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "teaching_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
