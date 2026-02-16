# mc2-wtcv: Pedagogical Rules + PromptService Migration + Prompt Optimization

## Context

Course "Как стать счастливым" (JAM-6506, 50 lessons) starts with eNPS metrics instead of an introductory module. Root cause: Stage 4 Phase 2 generates `sections_breakdown` without any pedagogical structure guidance. The existing plan (expressive-conjuring-whale.md) proposed fixing Stage 5, but Stage 5 only expands pre-defined sections into lessons — it can't change the section order or topics.

Additionally, Stage 4 and Stage 5 prompts are fully hardcoded in TypeScript, while Stages 3/6/7 already use `PromptService` (DB-backed, editable from admin panel). The hardcoded templates in `stage4-prompts.ts` and `stage5-prompts.ts` are registered but never loaded — dead code.

The Stage 5 prompt (`buildBatchPrompt`, 264 lines) has ~25-30% redundancy: duplicate rules, broken formatting, internal ticket references (FR-XXX), negative framing.

## Three Goals

1. **Fix root cause**: Add pedagogical guidance to Stage 4 Phase 2 where structure is planned
2. **Optimize Stage 5 prompt**: ~25-30% token reduction, positive framing
3. **Migrate to PromptService**: Make Stage 4 + Stage 5 prompts editable from admin panel

---

## Phase 1: Pedagogical Guidance in Stage 4 Phase 2

### File: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-2-scope.ts`

**Where**: `buildSystemPrompt()` (line 281), insert between role description and CRITICAL RULES.

**What to add** (~130 words, positive framing, recommendations not rules):

```
**Course Arc Guidance**:
Structure the course as a learning journey with natural cognitive progression:

1. **Opening section(s)**: Begin with context, motivation, and foundational vocabulary.
   Help learners understand WHY this topic matters and WHAT they will gain before
   introducing specialized concepts.
2. **Core sections**: Progress from simple, concrete ideas toward complex, abstract ones.
   Each section should build on knowledge established in earlier sections.
3. **Closing section(s)**: Conclude with synthesis, real-world application, or
   forward-looking perspectives that tie the course together.

Recommended proportions: ~10-15% orientation, ~60-70% core progression,
~15-20% synthesis and application.

When choosing Bloom's taxonomy verbs for learning_objectives, let them ascend naturally:
early sections favor "identify", "describe", "explain";
later sections favor "analyze", "evaluate", "design".
```

**Design principles**: positive framing, generic across all course types, ~130 words, recommendations not MUST rules, based on 3 Deep Think/Research documents.

---

## Phase 2: Stage 5 Prompt Optimization

### File: `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch/prompt-builder.ts`

6 optimizations, ~810 characters / ~25-30% reduction:

### 2.1 Anti-overlap rules: 6 → 3 (lines 116-123)

**Before** (6 rules, ~500 chars, negative framing):
```
**ANTI-OVERLAP RULES** (CRITICAL — failure to follow will cause rejection):
1. YOU are generating Section N ONLY...
2. DO NOT create lessons...
3. If a concept appears... focus EXCLUSIVELY...
4. Before finalizing... do NOT include it here.
5. Lessons MUST be DISTINCT...
6. SELF-CHECK... REJECT and create a different lesson.
```

**After** (3 rules, ~280 chars, positive framing):
```
**SECTION FOCUS RULES**:
1. Generate lessons exclusively for Section N. Each section in the course map
   owns its own unique topic area.
2. When a concept appears in multiple sections, focus on the specific angle
   defined by THIS section's key topics.
3. Before finalizing, verify each lesson belongs here and not in another
   section listed above.
```

### 2.2 Remove FR-XXX references (lines 200-203)

Remove 4 internal ticket references (`FR-011`, `FR-030` x2) — meaningless for LLM.

### 2.3 Fix Field Type Requirements formatting (lines 229-240)

Fix broken formatting where field names are on separate lines from colons. Remove "CRITICAL" prefix and "(common mistakes to avoid)".

### 2.4 Merge duplicate Quality Requirements (lines 242-245)

Delete separate `**Quality Requirements**` block — already covered in Constraints #2 (Bloom's taxonomy). Fix numbering gap (4 → 6 becomes 4 → 5).

### 2.5 Reframe FORBIDDEN PATTERNS (lines 207-210)

**Before** (3 lines, negative):
```
**CRITICAL - FORBIDDEN PATTERNS** (will cause automatic rejection):
- NO placeholders...
- NO incomplete text...
- ALL fields must contain REAL, COMPLETE content...
```

**After** (1 line, positive):
```
**Content Completeness**: Every field must contain real, finished content in ${language}.
Replace any placeholder text (e.g., [название], [insert X here]) with actual content.
```

### 2.6 Deduplicate COURSE CONSTRAINTS (lines 171-182)

**Before** (~350 chars with CRITICAL, IMPORTANT, MUST, info repeated 3x):
```
**CRITICAL COURSE CONSTRAINTS**...
**IMPORTANT**: The user explicitly configured these limits. You MUST:
1. Generate N lessons... (±1 if pedagogically justified)
2. Respect the total...
3. Distribute lessons evenly...
```

**After** (~150 chars):
```
**Course Structure** (from Stage 4):
- Course: N sections, M total lessons
- This section: X of N
- Target: K lessons for this section (±1 if pedagogically justified)
```

---

## Phase 3: PromptService Migration

### Architecture: "Pre-assembled Dynamic Slots"

Same pattern as Stage 6: code assembles all dynamic/conditional content into string variables, passes them to `PromptService.renderPrompt()` which renders the static template with `{{variable}}` slots.

### 3.1 Stage 4 Phase 2 — System Prompt

**Template key**: `stage4_phase2_scope_system`

Template contains the static system instruction (role + pedagogical guidance + critical rules). Variables: `{{outputLanguage}}`, `{{schemaDescription}}`, `{{minLessonsRule}}`.

**File changes**:
- `phase-2-scope.ts`: `buildSystemPrompt()` → async, uses `promptService.renderPrompt()`
- `stage4-prompts.ts`: Replace dead `stage4_phase2_scope` with real `stage4_phase2_scope_system` template

### 3.2 Stage 4 Phase 2 — User Prompt

**Template key**: `stage4_phase2_scope_user`

The user prompt is large (~300 lines) with many conditional sections. All conditional sections become pre-assembled string variables (empty string when not applicable). Existing `build*()` helpers stay unchanged.

**Variables** (all strings, pre-assembled in code):
- `outputLanguage`, `topic`, `category`, `complexity`, `targetAudience`, `keyConcepts`
- `documentsContext`, `clarifyingContext`, `courseDescriptionContext`, `learningOutcomesContext` (conditional, empty string if N/A)
- `sizeSection`, `sizeConstraintNote`, `sectionsRange`, `sectionsSuffix`, `sizeSpecificNotes` (from size logic)
- `overlapFeedbackSection`, `targetSectionsHint`

**File changes**:
- `phase-2-scope.ts`: `buildPhase2Prompt()` → async, uses two `promptService.renderPrompt()` calls
- `buildPhase2PromptText()` → async
- `runPhase2Scope()` already async — add `await` to `buildPhase2Prompt()`
- `stage4-prompts.ts`: Add real `stage4_phase2_scope_user` template

### 3.3 Stage 5 — Combined Prompt

**Template key**: `stage5_batch_section_generator`

Template contains the full prompt structure with `{{variable}}` slots for all dynamic sections.

**Variables** (all strings, pre-assembled in code):
- `courseTitle`, `language`, `stylePrompt`, `style`
- `targetAudienceLine`, `userContext` (conditional)
- `courseStructureMap`, `antiOverlapRules`, `overlapFeedback`, `previousSectionsDigest` (conditional)
- `sectionNumber`, `sectionTitle`, `learningObjectives`, `keyTopics`, `estimatedLessons`
- `analysisContext`, `constraintsSection` (conditional)
- `schemaDescription`, `lessonGuidance`, `ragToolInfo`, `outputFormat`

**File changes**:
- `prompt-builder.ts`: `buildBatchPrompt()` → `async`, uses `promptService.renderPrompt()`
- `generator-core.ts:283`: Add `await` before `buildBatchPrompt()`
- `stage5-prompts.ts`: Replace dead `stage5_sections_generator` with real `stage5_batch_section_generator`

### 3.4 Backward Compatibility

- `PromptService` already has DB → hardcoded fallback chain
- New templates in `stage4-prompts.ts` / `stage5-prompts.ts` serve as hardcoded fallback
- No DB migration required for launch — works immediately via hardcoded fallback
- Optional: seed `prompt_templates` table to make editable from admin

---

## Critical Files

| File | Change |
|------|--------|
| `stages/stage4-analysis/phases/phase-2-scope.ts` | Add pedagogical guidance + migrate to PromptService |
| `stages/stage5-generation/utils/section-batch/prompt-builder.ts` | 6 optimizations + migrate to PromptService |
| `stages/stage5-generation/utils/section-batch/generator-core.ts:283` | Add `await` for async `buildBatchPrompt` |
| `shared/prompts/stage4-prompts.ts` | Replace dead templates with real ones |
| `shared/prompts/stage5-prompts.ts` | Replace dead template with real one |

All paths relative to `packages/course-gen-platform/src/`.

## Existing Code to Reuse

| What | File | Notes |
|------|------|-------|
| `createPromptService()` | `shared/prompts/prompt-service.ts` | Singleton, DB-backed with cache |
| `PromptService.renderPrompt()` | Same | Mustache-style `{{variable}}` rendering |
| `buildDocumentsContext()` etc. | `phase-2-scope.ts` | All `build*()` helpers stay unchanged |
| `buildCourseStructureMap()` | `prompt-builder.ts` | Stays unchanged |
| `formatPedagogicalStrategyForPrompt()` | `utils/analysis-formatters.ts` | Stays unchanged |
| Stage 6 pattern | `generator-section.ts:144-226` | Reference for PromptService integration |

## Verification

1. `pnpm type-check` — async propagation doesn't break types
2. `pnpm build` — clean build
3. `pnpm test -- prompt-builder` — existing tests pass
4. `pnpm test -- phase-2-scope` — existing tests pass
5. Manual: generate a test course and verify:
   - Stage 4 Phase 2 output has orientation-style first section
   - Stage 5 prompt is shorter (check logs for prompt length)
   - PromptService logs show `source: 'hardcoded'` (fallback working)
6. Compare prompt output before/after migration — must be identical
