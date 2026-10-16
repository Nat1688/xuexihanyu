# CP-02 Exercise Engine Task Contract

**Status:** Accepted by Owner — exercise foundation implementation may proceed only within this scope.

## First deterministic scope

- Provider-neutral exercise definition/instance/evaluation contracts, no AI.
- Initial content-derived modes: Chinese→Vietnamese, Vietnamese→Chinese, Chinese→Pinyin, Pinyin→Chinese, multiple choice and typing.
- Audio modes are contract placeholders only until media storage/reference delivery is separately approved.
- Explicit normalization: Unicode NFC, trim/collapse whitespace, case handling for Latin/Pinyin, tone/diacritic policy declared per mode; Chinese characters are never case-normalized.

## Allowed

- Exercise type enums/contracts and deterministic generators/evaluators from approved learning items.
- Pure answer evaluation result: correct/incorrect, normalized expected/received safe forms, deterministic feedback code.
- Deterministic distractor selection from approved content with explicit stable ordering/seed.
- Unit/property tests for each normalization/evaluation mode.

## Forbidden

No answer attempt/event persistence (CP-03), mastery/review (CP-04), student UI flow, AI generation, media upload/storage, assignment/enrollment, random unseeded distractors, analytics.

## Acceptance

- Same approved content + request produces same exercise/evaluation result.
- Content source is referenced, not duplicated into exercise contracts.
- Invalid/missing Chinese/Pinyin/meaning data yields explicit safe contract errors.
- Normalization behavior is fully test-covered.
- No event/mastery/AI schema or dependency introduced.
