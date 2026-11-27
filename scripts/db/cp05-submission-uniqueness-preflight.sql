-- READ-ONLY CP-05 migration preflight.
--
-- A zero-row result means the one-submission-per-session unique index can be
-- created without choosing or deleting data. Any returned row is a hard stop:
-- do not apply the migration until the Owner approves a reconciliation plan.
SELECT
    "exercise_session_id",
    COUNT(*) AS "submission_count"
FROM "answer_submissions"
GROUP BY "exercise_session_id"
HAVING COUNT(*) > 1
ORDER BY "exercise_session_id";
