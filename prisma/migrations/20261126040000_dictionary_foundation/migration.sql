-- CreateTable
CREATE TABLE "dictionary_sources" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "rights" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "rights_evidence" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dictionary_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_source_categories" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dictionary_source_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_import_batches" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "parser_version" TEXT NOT NULL,
    "normalizer_version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STAGED',
    "summary" JSONB NOT NULL,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dictionary_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_entries" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "chinese" TEXT NOT NULL,
    "pinyin" TEXT NOT NULL,
    "identity_hash" TEXT NOT NULL,
    "pinyin_key" TEXT NOT NULL,
    "pinyin_compact" TEXT NOT NULL,
    "content_type" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
    "verification" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "publication" TEXT NOT NULL DEFAULT 'INTERNAL',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dictionary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_senses" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "vietnamese" TEXT,
    "english" TEXT,
    "identity_hash" TEXT NOT NULL,
    "vietnamese_key" TEXT NOT NULL,
    "english_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dictionary_senses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_import_items" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "flags" JSONB NOT NULL,
    "outcome" TEXT NOT NULL,
    "sense_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dictionary_import_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_sense_origins" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "sense_id" UUID NOT NULL,
    "source_category_id" UUID NOT NULL,
    "import_item_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dictionary_sense_origins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_categories" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "parent_id" UUID,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "chinese_label" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dictionary_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_entry_categories" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dictionary_entry_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_entry_revisions" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dictionary_entry_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_entry_reports" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "reporter_id" UUID NOT NULL,
    "comment" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dictionary_entry_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_audit_events" (
    "id" UUID NOT NULL,
    "public_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dictionary_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_sources_public_id_key" ON "dictionary_sources"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_sources_url_key" ON "dictionary_sources"("url");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_source_categories_public_id_key" ON "dictionary_source_categories"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_source_categories_source_id_label_key" ON "dictionary_source_categories"("source_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_import_batches_public_id_key" ON "dictionary_import_batches"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_import_batches_checksum_parser_version_normalize_key" ON "dictionary_import_batches"("checksum", "parser_version", "normalizer_version");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_entries_public_id_key" ON "dictionary_entries"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_entries_identity_hash_key" ON "dictionary_entries"("identity_hash");

-- CreateIndex
CREATE INDEX "dictionary_entries_chinese_idx" ON "dictionary_entries"("chinese");

-- CreateIndex
CREATE INDEX "dictionary_entries_pinyin_compact_idx" ON "dictionary_entries"("pinyin_compact");

-- CreateIndex
CREATE INDEX "dictionary_entries_publication_verification_idx" ON "dictionary_entries"("publication", "verification");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_senses_public_id_key" ON "dictionary_senses"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_senses_identity_hash_key" ON "dictionary_senses"("identity_hash");

-- CreateIndex
CREATE INDEX "dictionary_senses_entry_id_idx" ON "dictionary_senses"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_import_items_public_id_key" ON "dictionary_import_items"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_import_items_batch_id_ordinal_key" ON "dictionary_import_items"("batch_id", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_sense_origins_public_id_key" ON "dictionary_sense_origins"("public_id");

-- CreateIndex
CREATE INDEX "dictionary_sense_origins_source_category_id_sense_id_idx" ON "dictionary_sense_origins"("source_category_id", "sense_id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_sense_origins_sense_id_source_category_id_import_key" ON "dictionary_sense_origins"("sense_id", "source_category_id", "import_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_categories_public_id_key" ON "dictionary_categories"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_categories_slug_key" ON "dictionary_categories"("slug");

-- CreateIndex
CREATE INDEX "dictionary_categories_parent_id_idx" ON "dictionary_categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_entry_categories_public_id_key" ON "dictionary_entry_categories"("public_id");

-- CreateIndex
CREATE INDEX "dictionary_entry_categories_category_id_entry_id_idx" ON "dictionary_entry_categories"("category_id", "entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_entry_categories_entry_id_category_id_key" ON "dictionary_entry_categories"("entry_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_entry_revisions_public_id_key" ON "dictionary_entry_revisions"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_entry_revisions_entry_id_revision_key" ON "dictionary_entry_revisions"("entry_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_entry_reports_public_id_key" ON "dictionary_entry_reports"("public_id");

-- CreateIndex
CREATE INDEX "dictionary_entry_reports_entry_id_idx" ON "dictionary_entry_reports"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_audit_events_public_id_key" ON "dictionary_audit_events"("public_id");

-- CreateIndex
CREATE INDEX "dictionary_audit_events_actor_id_created_at_idx" ON "dictionary_audit_events"("actor_id", "created_at");

-- AddForeignKey
ALTER TABLE "dictionary_source_categories" ADD CONSTRAINT "dictionary_source_categories_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "dictionary_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_import_batches" ADD CONSTRAINT "dictionary_import_batches_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_senses" ADD CONSTRAINT "dictionary_senses_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "dictionary_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_import_items" ADD CONSTRAINT "dictionary_import_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "dictionary_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_import_items" ADD CONSTRAINT "dictionary_import_items_sense_id_fkey" FOREIGN KEY ("sense_id") REFERENCES "dictionary_senses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_sense_origins" ADD CONSTRAINT "dictionary_sense_origins_sense_id_fkey" FOREIGN KEY ("sense_id") REFERENCES "dictionary_senses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_sense_origins" ADD CONSTRAINT "dictionary_sense_origins_source_category_id_fkey" FOREIGN KEY ("source_category_id") REFERENCES "dictionary_source_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_sense_origins" ADD CONSTRAINT "dictionary_sense_origins_import_item_id_fkey" FOREIGN KEY ("import_item_id") REFERENCES "dictionary_import_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_categories" ADD CONSTRAINT "dictionary_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "dictionary_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_entry_categories" ADD CONSTRAINT "dictionary_entry_categories_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "dictionary_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_entry_categories" ADD CONSTRAINT "dictionary_entry_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "dictionary_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_entry_revisions" ADD CONSTRAINT "dictionary_entry_revisions_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "dictionary_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_entry_revisions" ADD CONSTRAINT "dictionary_entry_revisions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_entry_reports" ADD CONSTRAINT "dictionary_entry_reports_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "dictionary_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_entry_reports" ADD CONSTRAINT "dictionary_entry_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_audit_events" ADD CONSTRAINT "dictionary_audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- DICT02: bounded states and indexed multilingual search; original migrations unchanged.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
ALTER TABLE dictionary_sources ADD CONSTRAINT dictionary_rights_state CHECK (rights IN ('UNKNOWN','CONFIRMED','DENIED'));
ALTER TABLE dictionary_sources ADD CONSTRAINT dictionary_rights_evidence CHECK (rights <> 'CONFIRMED' OR length(trim(rights_evidence)) > 0 AND rights_evidence IS NOT NULL);
ALTER TABLE dictionary_entries ADD CONSTRAINT dictionary_type_state CHECK (content_type IN ('WORD','TERM','PHRASE','SENTENCE','UNCLASSIFIED'));
ALTER TABLE dictionary_entries ADD CONSTRAINT dictionary_verification_state CHECK (verification IN ('UNVERIFIED','IN_REVIEW','VERIFIED','NEEDS_CORRECTION'));
ALTER TABLE dictionary_entries ADD CONSTRAINT dictionary_publication_state CHECK (publication IN ('DRAFT','INTERNAL','PUBLISHED','ARCHIVED'));
ALTER TABLE dictionary_entries ADD CONSTRAINT dictionary_publish_verified CHECK (publication <> 'PUBLISHED' OR verification='VERIFIED');
ALTER TABLE dictionary_entries ADD CONSTRAINT dictionary_entry_text_bounds CHECK (length(chinese) BETWEEN 1 AND 2000 AND length(pinyin)<=4000);
ALTER TABLE dictionary_categories ADD CONSTRAINT dictionary_not_self_parent CHECK (id IS DISTINCT FROM parent_id);
ALTER TABLE dictionary_import_batches ADD CONSTRAINT dictionary_import_state CHECK (status IN ('STAGED','COMPLETED','FAILED'));
CREATE INDEX dictionary_chinese_trgm ON dictionary_entries USING gin(chinese gin_trgm_ops);
CREATE INDEX dictionary_pinyin_trgm ON dictionary_entries USING gin(pinyin_compact gin_trgm_ops);
CREATE INDEX dictionary_vi_trgm ON dictionary_senses USING gin(vietnamese_key gin_trgm_ops);
CREATE INDEX dictionary_en_trgm ON dictionary_senses USING gin(english_key gin_trgm_ops);
CREATE INDEX dictionary_zh_prefix ON dictionary_entries(chinese text_pattern_ops);
CREATE INDEX dictionary_py_prefix ON dictionary_entries(pinyin_key text_pattern_ops);
CREATE INDEX dictionary_vi_prefix ON dictionary_senses(vietnamese_key text_pattern_ops);
CREATE INDEX dictionary_en_prefix ON dictionary_senses(english_key text_pattern_ops);

CREATE INDEX dictionary_senses_entry_id_public_id_idx ON dictionary_senses(entry_id,public_id);
-- Serialize structural taxonomy changes, reject cycles and subtree depth overflow.
CREATE FUNCTION dictionary_validate_tree() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_parent uuid; ancestor_depth integer := 1; subtree_depth integer;
BEGIN
  PERFORM pg_advisory_xact_lock(8312602);
  current_parent := NEW.parent_id;
  WHILE current_parent IS NOT NULL LOOP
    IF current_parent = NEW.id THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid dictionary category hierarchy'; END IF;
    ancestor_depth := ancestor_depth + 1;
    IF ancestor_depth > 8 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Dictionary hierarchy is too deep'; END IF;
    SELECT parent_id INTO current_parent FROM dictionary_categories WHERE id=current_parent;
  END LOOP;
  WITH RECURSIVE children AS (
    SELECT id,1 AS depth FROM dictionary_categories WHERE id=NEW.id
    UNION ALL SELECT c.id,p.depth+1 FROM dictionary_categories c JOIN children p ON c.parent_id=p.id WHERE p.depth<9
  ) SELECT COALESCE(max(depth),1) INTO subtree_depth FROM children;
  IF ancestor_depth+subtree_depth-1 > 8 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Dictionary hierarchy is too deep'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dictionary_tree_guard BEFORE INSERT OR UPDATE OF parent_id ON dictionary_categories FOR EACH ROW EXECUTE FUNCTION dictionary_validate_tree();
CREATE FUNCTION dictionary_reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Dictionary history is append-only'; END $$;
CREATE TRIGGER dictionary_audit_append_only BEFORE UPDATE OR DELETE ON dictionary_audit_events FOR EACH ROW EXECUTE FUNCTION dictionary_reject_history_mutation();
CREATE TRIGGER dictionary_revision_append_only BEFORE UPDATE OR DELETE ON dictionary_entry_revisions FOR EACH ROW EXECUTE FUNCTION dictionary_reject_history_mutation();

ALTER TABLE dictionary_entries ADD COLUMN pinyin_alias TEXT NOT NULL;
CREATE INDEX dictionary_pinyin_alias_idx ON dictionary_entries(pinyin_alias);

CREATE INDEX dictionary_catalog_version_idx ON dictionary_entries(updated_at);
