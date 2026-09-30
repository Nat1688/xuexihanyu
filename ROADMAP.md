# Chinese Learning Platform — Roadmap

**Baseline:** v0.1  
**Execution rule:** only the active checkpoint is implementation-authorized. Later checkpoints are planning context unless Owner explicitly opens them.

| Checkpoint | Name | Primary outcome | Gate |
|---|---|---|---|
| CP-00 | Foundation | Bootable, testable, secure application skeleton | Foundation review PASS |
| CP-01 | Content Engine | Teacher-managed structured Chinese content | Content contracts stable |
| CP-02 | Exercise Engine | Reusable deterministic exercise generation/evaluation | Exercise contract PASS |
| CP-03 | Learning Events | Authoritative interaction telemetry | Event integrity PASS |
| CP-04 | Mastery Engine | Deterministic mastery + review scheduling | Reproducibility PASS |
| CP-05 | Student MVP | Low-friction end-to-end student learning flow | Private beta |
| CP-06 | Teacher MVP | Classes, assignments, student/class progress | Real-class pilot |
| CP-07 | AI Foundation | Provider-neutral AI boundary and safe tools | AI boundary review PASS |
| CP-08 | AI Tutor | Contextual explanations/practice assistant | Controlled student pilot |
| CP-09 | Proactive Tutor | Policy-controlled reminders/interventions | Notification safety gate |
| CP-10 | Teacher Intelligence | Evidence-backed summaries/recommendations | Teacher validation |

## CP-00 — Foundation
Deliver repository structure, architecture baseline, application bootstrap, configuration, database/migrations, identity/RBAC, seed/bootstrap path, test harness, CI and operational documentation. **No learning-domain feature implementation.**

Exit criteria: clean checkout can be configured and started; migrations work on a clean DB; ADMIN/TEACHER/STUDENT authorization has automated tests; login/logout/session behavior is tested; CI runs required checks; secrets are excluded from source; baseline docs match implementation.

## CP-01 — Content Engine
Define Course → Unit → Lesson hierarchy and learning-item contracts for vocabulary, characters, grammar, examples/sentences and media references. Implement teacher-authorized CRUD, validation, import/export only if separately approved, and deterministic content retrieval.

## CP-02 — Exercise Engine
Introduce provider-neutral exercise contracts and deterministic generators/evaluators. Initial modes: Chinese→Vietnamese, Vietnamese→Chinese, Chinese→Pinyin, Pinyin→Chinese, Audio→Chinese, Audio→Meaning, multiple choice and typing. Normalization rules must be explicit and tested.

## CP-03 — Learning Events
Capture authoritative study interactions: session/lesson start-complete, answer submission, exercise completion, review activity and relevant timing/attempt metadata. Events must be append-oriented; event schema/versioning and privacy retention policy must be documented.

## CP-04 — Mastery Engine
Derive per-item learning state from evidence. Start with deterministic/versioned rules (NEW → LEARNING → FAMILIAR → MASTERED) and review scheduling. Do not introduce LLM-based mastery decisions.

## CP-05 — Student MVP
Implement the shortest useful path: `LOGIN → TODAY → CONTINUE → EXERCISE → RESULT → NEXT`. Include due review, current lesson, basic progress and accessible/mobile-responsive interaction. Open private beta only after regression and privacy/security review.

## CP-06 — Teacher MVP
Implement classes/enrollment, assignments, student detail, class aggregates, weak-item evidence and teacher notes. Analytics must identify their source window and must not imply unsupported high-stakes assessment.

## CP-07 — AI Foundation
Introduce AI as an optional application-layer consumer through explicit tools/services such as `get_student_progress`, `get_weak_items`, `get_recent_mistakes`, `get_due_reviews`, and `get_lesson_content`. No direct SQL/database credentials for AI. Provider adapter must permit later cloud/local model substitution.

## CP-08 — AI Tutor
Add contextual Q&A, explanations, examples, bounded practice generation and sentence correction. Responses use authorized student/course context and are logged sufficiently for audit/debugging without retaining unnecessary sensitive content.

## CP-09 — Proactive Tutor
Add scheduled detection of inactivity, overdue review and persistent difficulty. Notification policy requires cooldown, quiet hours, user/teacher controls and rate limits. AI recommendations do not bypass application authorization.

## CP-10 — Teacher Intelligence
Generate evidence-linked class/student summaries, common-error analysis and suggested teaching focus. Recommendations remain advisory and must expose the underlying data window/evidence.

## Cross-cutting workstreams
Security/privacy, accessibility, observability, backup/recovery, localization, performance and documentation are continuous workstreams, not cleanup phases.

## Change control
Any proposal that changes an approved checkpoint's domain contract, security boundary, persistence model or public API requires an ADR/spec amendment and Owner approval before implementation.
