-- CP-05 integrity remediation: exactly one effective submission per exercise
-- session. This migration never selects, deletes or rewrites an existing row.
-- If historical duplicates exist, fail before creating the unique index so an
-- Owner-approved reconciliation can be performed separately.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "answer_submissions"
        GROUP BY "exercise_session_id"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'CP-05 submission uniqueness preflight failed: duplicate exercise sessions exist'
            USING ERRCODE = '23505';
    END IF;
END
$$;

-- The existing composite unique index remains in place for the explicit
-- (session, submission token) idempotency key. This stronger index prevents
-- two different tokens from both becoming effective for the same session.
CREATE UNIQUE INDEX "answer_submissions_exercise_session_id_key"
    ON "answer_submissions"("exercise_session_id");
