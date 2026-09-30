# Chinese Learning Platform — Project Charter

**Status:** BASELINE DRAFT — requires Owner approval before CP-00 implementation  
**Project codename:** CLP  
**Owner:** Product Owner / Human Teacher  
**Primary users:** Students, Teachers, Administrators

## 1. Mission
Build a Chinese-learning platform for real students that combines structured course content, reusable learning items, adaptive practice, measurable mastery, teacher oversight, and—only after the deterministic learning platform is proven—an AI teaching assistant.

The product takes inspiration from the reusable study-set model of flashcard platforms and Chinese-specific learning tools, but it is not a clone. Chinese language pedagogy and teacher control are first-class requirements.

## 2. Product principles
1. **Learning system first, AI second.** Core learning remains usable when all LLM/AI providers are unavailable.
2. **Content is reusable.** One learning item can power multiple exercise types without duplicating source content.
3. **Events are evidence.** Student interactions are captured as immutable learning events; derived progress is not a substitute for source evidence.
4. **Teacher remains in control.** Automation may recommend and assist; teacher-facing consequential actions require explicit policy/authorization.
5. **Chinese is a first-class domain.** Simplified/traditional characters, pinyin, audio, characters, examples, grammar and HSK metadata must not be forced into a generic term/definition schema.
6. **Privacy by design.** Collect only learning data needed for the product; authorization and auditability are baseline requirements.
7. **No silent scope expansion.** Architecture, contracts, migrations and security boundaries cannot be changed incidentally by implementation agents.
8. **Testable before clever.** Deterministic rules and services precede adaptive algorithms and LLM features.

## 3. Initial scope
### In scope through Student/Teacher MVP
- ADMIN / TEACHER / STUDENT identities and RBAC.
- Courses, units, lessons and Chinese learning content.
- Vocabulary, character, grammar, sentence/example and media references.
- Exercise generation/evaluation from learning content.
- Learning-event capture.
- Mastery and review scheduling.
- Student learning flow.
- Teacher class/student progress views and assignments.

### Deferred until AI phases
- AI explanations and tutoring.
- AI-generated practice.
- Proactive reminders.
- AI teacher reports/recommendations.
- Local/self-hosted model adapters.

### Explicitly out of initial scope
- OCR.
- Social network/community feed.
- Public content marketplace.
- Native mobile apps.
- High-stakes grading/proctoring.
- AI direct database access.
- AI autonomous modification of grades/mastery/source content.

## 4. Success criteria
The first meaningful success milestone is a private beta in which a real student can log in, continue today's study, complete deterministic exercises, generate learning events, receive review scheduling, and have progress visible to an authorized teacher.

The second milestone is a real-class pilot where a teacher can manage content/assignments and inspect evidence-backed student progress without relying on AI.

## 5. Roles
- **Owner:** scope, product decisions, checkpoint approval.
- **SOL:** lead architect; contracts, ADRs, architecture adjudication.
- **Explorer:** research, alternatives, edge cases; no implementation authority.
- **TERRA:** implementation within approved task contracts.
- **LUNA:** tests, fixtures, documentation and bounded low-risk work.
- **Reviewer:** independent architecture/security/code review; no feature implementation in the review pass.

## 6. Governance
No feature moves directly from idea to implementation. Required path:

`REQUEST → SPEC → RESEARCH (when needed) → ARCHITECTURE → OWNER APPROVAL → IMPLEMENTATION → TEST → REVIEW → FINDING CLOSURE → FULL REGRESSION → DOCS → CHECKPOINT`

A checkpoint is not complete until acceptance criteria, tests, review findings and documentation are closed. Commits/checkpoints must identify the corresponding CLP task IDs.

## 7. Non-negotiable invariants
- AI depends on application services; application core never depends on an AI provider.
- Browser/client code never receives database credentials or privileged service secrets.
- Authorization is enforced server-side.
- Learning-event history is append-oriented and auditable.
- Derived mastery can be recomputed from authoritative data/versioned rules where practical.
- Schema changes require migration + rollback/recovery consideration + tests.
- No implementation agent may redefine a domain contract to make its task easier.

## 8. Decision rule
When requirements are ambiguous and the ambiguity changes domain behavior, data integrity, authorization, privacy, or public API contracts, stop and escalate to SOL/Owner. Do not guess.
