# FC-01 — Read-only flashcard practice

Owner approves the proposed flashcard flow. Isolated codex/fc01-flashcard-review starts from b191d16 with byte-verified471-file UI-05 source overlay;original worktrees/WIP and release evidence remain untouched.

Scope:Student dashboard/sidebar Flashcard ôn tập;approved,published course selector;published lesson or whole-course deck;front Chinese/meaning,flip to Pinyin/meaning/example;local remembered/review-again session and restart. Existing lesson content only. No synthetic production content,AI,TTS or exercise answer-key API.

Contracts:GET /admissions/courses determines current approved published choices;GET /content/courses/:id/units;GET /content/units/:id/lessons;GET /content/lessons/:id for authorized published content. Server CourseAccessService and content visibility remain authoritative for every read. Filter vocabulary/character items with usable Chinese/meaning. Render whitelisted text only,never HTML/reference secrets. No API/backend/schema/migration/dependency change.

Self-ratings are transient practice only,never answer submissions,learning events,mastery,assignment completion or scheduled-review evidence. No credentials,lesson content,answers or ratings in browser storage. Reload/leave starts a new flashcard round;clearly disclosed. This is manual lesson/course review,not a replacement for existing due-review scheduling.

Acceptance:real text deck/filtering/dedup/Unicode;approved-course and published filters;Chinese/meaning directions,hide answer until flip;ratings,review-again,round progress;all-request GET-only;no storage;loading/error/retry/401/403/empty/missing fields;race-safe course switch/unmount;390/768/1440 keyboard/mobile;existing dashboard/Teacher/CP05 recovery regression. Unit + browser fixtures explicitly synthetic;full API/frontend,lint/typecheck/build/source-secret/diff checks. Public Web staging/deployment uses existing rollback;no account provisioning or DB writes for feature tests.

Limits:whole-course deck cap50lessons/2000usable cards,explicitly refuse oversized deck with instruction to select one lesson;never silently truncate. Content revisions are in-memory snapshots from published lesson reads;no durable history or automatic mastery transfer. Keep default-OFF PREVIEW_ONLY catalog untouched. No commit,push or Main merge.
