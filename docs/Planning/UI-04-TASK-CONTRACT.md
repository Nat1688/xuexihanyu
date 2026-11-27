# UI-04 — Student dashboard and exercise exit

Owner reports a trapped exercise screen and requests a Student progress dashboard. Extend the isolated UI-03 worktree; preserve its frozen deployment snapshot and original checkout WIP. No commit/push or Main merge.

Scope: safe exit to Student overview from exercise (including loading/error), explicit resume of the same server session, preserve answer/token in React memory while temporarily leaving, keep uncertain-submit/recovery behavior, prevent leaving during a pending submission. Pause state may store only an opaque session identifier; never answer,token or credentials. Reload of an explicitly paused exercise returns to dashboard; resume/reload still uses existing server ownership and POST recovery.

Dashboard uses only existing GET student classes/assignments/progress contracts: enrolled class count, accessible assignments and confirmed completion, answer counts and recent results in the server-provided window. Completion is not mastery. No invented daily chart,streak,XP or unsupported progress claim. Provide loading,error,retry,empty and session-expired states; all current course/class/join/tools flows remain.

Out of scope: API/schema/migration/dependencies,server evaluation/mastery/authorization,record creation by the dashboard or synthetic live data. Frontend-only deployment after regression and staging; retain previous Web and do not restart API/DB.

Acceptance: exit/resume and reload after pause; typed/MCQ draft survives exit/resume in the same tab without storage; same token after network failure; pending-submit exit and navigation blocked; GET/already-answered recovery preserved; latest results/progress reflect API values; mobile390px; full frontend/API,Chrome interaction,lint/typecheck/build,source secret scan and diff checks. Real-account UAT remains Owner action; fixture tests must be labelled synthetic.
