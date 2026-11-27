# FC-02 — Typed formative recall

Owner requests direct typing of meanings/Chinese and fill-in-the-blank practice in the flashcard context. Isolated codex/fc02-typed-recall starts from b191d16 plus byte-verified478-file FC01 snapshot. Preserve all prior worktrees,WIP,images and evidence.

Scope:optional Viết đáp án and Điền từ trong ví dụ alongside existing flip mode. Both Chinese→meaning and meaning→Chinese for typing. Cloze uses only published card examples containing the exact target term,masking all occurrences;no invented examples. Cloze always asks for Chinese,shows meaning hint and explicitly states excluded-card counts. If no usable examples,offer a clear choice of another mode. All existing authorized GET lesson reads unchanged.

Typed response stays in React memory. Explicit Đối chiếu reveals published sample only;matching normalizes NFC/trim/whitespace and case for meaning. No accent stripping,synonym guessing,Traditional/Simplified conversion or server grading changes. Non-matching meaning is neutral comparison,not declared incorrect. Learner still self-rates. Answer may be revealed without typing and retried,clearly as ungraded practice. IME composition must not prematurely reveal;next card clears input/feedback and supports keyboard/mobile.

No answer/ratings/storage/API writes,mastery,learning evidence,assignment completion,SRS changes,backend,DTO,schema,migration,dependency,AI or TTS. Existing CP05 exercise evaluation remains authoritative and untouched. Limits and publication/access filters from FC01 remain.

Acceptance:targeted normalization/cloze tests;typing both directions,IME,Enter,empty-input guard,reveal/retry,cloze/missing-example notices,reset/review-again,GET-only/no storage,390/768/1440;prior31browser/API/frontend regression;lint,typecheck,build,source secret,format/diff checks. Web-only staging/rollout under Owner feature request;retain prior image. Real-account UAT remains Owner action. No commit,push or Main merge.
