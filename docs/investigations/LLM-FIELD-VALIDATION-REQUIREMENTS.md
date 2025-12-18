# LLM-Generated Fields with Format Validation Requirements

**Date**: 2025-11-19
**Purpose**: Complete inventory of ALL fields with format validation (enum, regex, min/max) across Stage 4 Analysis and Stage 5 Generation
**Key Finding**: Stage 4 fields are LLM-to-LLM guidance (should be WARNING), Stage 5 fields go to database (should be STRICT)

---

## Stage 4: Analysis Output (Phase 1 + Phase 2)

| Field | Format Requirement | Current Type | Destination | Recommendation |
|-------|-------------------|--------------|-------------|----------------|
| `primary_strategy` | Enum: 5 values | Enum | Stage 5 guidance | ⚠️ WARNING |
| `theory_practice_ratio` | Regex: `^\d+:\d+$` | Regex validation | Stage 5 guidance | ⚠️ WARNING |
| `assessment_types` | Enum array: 6 values | Enum array | Stage 5 guidance | ⚠️ WARNING |
| `tone` | Enum: 4 values | Enum | Stage 5 guidance | ⚠️ WARNING |
| `include_visuals` | Enum array: 6 values | Enum array | Stage 5 guidance | ⚠️ WARNING |
| `exercise_types` | Enum array: 6 values | Enum array | Stage 5 guidance | ⚠️ WARNING |
| `importance` | Enum: 3 values | Enum | Stage 5 guidance | ⚠️ WARNING |
| `difficulty_progression` | Enum: 3 values | Enum | Stage 5 guidance | ⚠️ WARNING |
| `primary` (category) | Enum: 6 values | Enum | Stage 5 guidance | ⚠️ WARNING |
| `secondary` (category) | Enum: 6 values | Enum | Stage 5 guidance | ⚠️ WARNING |
| `complexity` | Enum: 3 values | Enum | Stage 5 guidance | ⚠️ WARNING |
| `target_audience` | Enum: 4 values | Enum | Stage 5 guidance | ⚠️ WARNING |
| `difficulty` (section) | Enum: 3 values | Enum | Stage 5 guidance | ⚠️ WARNING |
| `estimated_duration_hours` | Min: 0.5 | Numeric min | Stage 5 guidance | ⚠️ WARNING |
| `lesson_duration_minutes` | Min: 3, Max: 45 | Numeric range | Stage 5 guidance | ⚠️ WARNING |
| `total_lessons` | Min: 10 | Numeric min | Stage 5 guidance | ⚠️ WARNING |
| `total_sections` | Min: 1 | Numeric min | Stage 5 guidance | ⚠️ WARNING |
| `information_completeness` | Min: 0, Max: 100 | Numeric range | Stage 5 guidance | ⚠️ WARNING |
| `estimated_duration_hours` (section) | Min: 0.5, Max: 20 | Numeric range | Stage 5 guidance | ⚠️ WARNING |

**Total**: 18 fields (0 strict, 18 warning, 0 optional)

**Key Insight**: All Stage 4 fields are advisory guidance for Stage 5 LLM. They don't go to database, they guide semantic generation. Strict validation here causes false positives.

---

## Stage 5: Generation Output

| Field | Format Requirement | Current Type | Destination | Recommendation |
|-------|-------------------|--------------|-------------|----------------|
| `exercise_type` | Enum: 7 values | Enum | Database JSONB | ✅ STRICT |
| `difficulty_level` (lesson) | Enum: 3 values | Enum | Database JSONB | ✅ STRICT |
| `difficulty_level` (course) | Enum: 3 values | Enum | Database JSONB | ✅ STRICT |
| `cognitiveLevel` | Enum: 6 values | Enum | Database JSONB | ✅ STRICT |
| `language` | Enum: 19 values | Enum | **CODE-INJECTED** | ✅ STRICT (not LLM-generated) |
| `targetAudienceLevel` | Enum: 3 values | Enum | Database JSONB | ✅ STRICT |
| `exercise_title` | Min: 5, Max: 300 | Length constraint | Database JSONB | ✅ STRICT |
| `exercise_description` | Min: 10, Max: 1500 | Length constraint | Database JSONB | ✅ STRICT |
| `lesson_title` | Min: 5, Max: 500 | Length constraint | Database JSONB | ✅ STRICT |
| `lesson_objectives` | Min: 1, Max: 5, Items: 10-600 | Array + length | Database JSONB | ✅ STRICT |
| `key_topics` | Min: 2, Max: 10, Items: 5-300 | Array + length | Database JSONB | ✅ STRICT |
| `estimated_duration_minutes` | Min: 3, Max: 45 | Numeric range | Database JSONB | ✅ STRICT |
| `practical_exercises` | Min: 3, Max: 5 | Array size | Database JSONB | ✅ STRICT |
| `section_title` | Min: 10, Max: 600 | Length constraint | Database JSONB | ✅ STRICT |
| `section_description` | Min: 20, Max: 2000 | Length constraint | Database JSONB | ✅ STRICT |
| `learning_objectives` (section) | Min: 1, Max: 5, Items: 10-600 | Array + length | Database JSONB | ✅ STRICT |
| `sections` | Min: 1 | Array size | Database JSONB | ✅ STRICT |
| `course_title` | Min: 10, Max: 1000 | Length constraint | Database JSONB | ✅ STRICT |
| `course_description` | Min: 20, Max: 3000 | Length constraint | Database JSONB | ✅ STRICT |
| `course_overview` | Min: 30, Max: 10000 | Length constraint | Database JSONB | ✅ STRICT |
| `target_audience` | Min: 20, Max: 1500 | Length constraint | Database JSONB | ✅ STRICT |
| `prerequisites` | Min: 0, Max: 10, Items: 10-600 | Array + length | Database JSONB | ✅ STRICT |
| `learning_outcomes` (course) | Min: 3, Max: 15 | Array size | Database JSONB | ✅ STRICT |
| `course_tags` | Min: 5, Max: 20, Items: 3-150 | Array + length | Database JSONB | ✅ STRICT |
| `assessment_description` | Min: 10, Max: 1500 | Length constraint | Database JSONB | ✅ STRICT |
| `LearningObjective.text` | Min: 10, Max: 500 | Length constraint | Database JSONB | ✅ STRICT |
| `estimatedDuration` | Min: 5, Max: 15 | Numeric range | Database JSONB | ✅ STRICT |

**Total**: 27 fields (27 strict, 0 warning, 0 optional)

**Note**: `language` and `id` fields are **CODE-INJECTED**, not LLM-generated:
- `language` = `frontend_parameters.language` (injected by orchestrator)
- `id` = `crypto.randomUUID()` (generated by code)

---

## Summary

| Stage | STRICT | WARNING | OPTIONAL | TOTAL |
|-------|--------|---------|----------|-------|
| Stage 4 | 0 | 18 | 0 | 18 |
| Stage 5 | 27 | 0 | 0 | 27 |
| **TOTAL** | **27** | **18** | **0** | **45** |

---

## Key Findings

### 1. Stage 4 Fields Should Be WARNING (LLM-to-LLM Guidance)

**Rationale**:
- Fields like `primary_strategy`, `theory_practice_ratio`, `exercise_types` are **advisory recommendations**
- They guide Stage 5 LLM's semantic understanding, not database constraints
- Example: `exercise_types: ['coding', 'debugging']` → Stage 5 interprets semantically, doesn't require exact match
- Strict enum validation causes false positives when LLM uses synonyms or creative variations

**Recommendation**: Convert to warnings that log mismatches but allow progression

### 2. Stage 5 Fields Should Be STRICT (Database Constraints)

**Rationale**:
- Fields like `exercise_type`, `difficulty_level`, `course_title` are stored in database JSONB
- Frontend queries/filters depend on exact values (e.g., filter by `difficulty_level: 'beginner'`)
- Database schema expects specific formats for consistency and querying
- Length constraints prevent JSONB storage issues and UI rendering problems

**Recommendation**: Keep strict validation (block progression on validation failure)

### 3. Duration Proportionality Validation

**Current Status**: `validateDurationProportionality()` is a **blocking refinement** in `LessonSchema`

**Issue**: This calculates expected duration based on:
- `topicCount * (1-5 min)`
- `objectiveCount * (3-15 min)`
- `difficultyMultiplier` (1.0x beginner, 1.5x intermediate, 2.0x advanced)

**Recommendation**: Convert to WARNING (non-blocking)
- LLMs are good at estimating duration holistically
- Formulaic validation is too rigid for creative content
- Keep as advisory metric, not blocking constraint

### 4. Code-Injected Fields (Not LLM-Generated)

**Excluded from this analysis**:
- `language`: Injected from `frontend_parameters.language` by orchestrator
- `id`: Generated via `crypto.randomUUID()` in code
- All `phase_metadata` fields: Generated by orchestrator (duration_ms, model_used, tokens, etc.)

### 5. Placeholder Detection

**Current Status**: `scanForPlaceholders()` is a **blocking refinement** in `CourseStructureSchema`

**Patterns Blocked**:
- TODO/FIXME markers: `/\b(TODO|FIXME|XXX)\b/i`
- Bracketed placeholders: `/\[TODO\]/i`, `/\[insert[^\]]*\]/i`
- Template variables: `/\{\{[^}]+\}\}/`, `/\$\{[^}]+\}/`
- Ellipsis indicators: `/^\.\.\.$|^\.\.\.\s/`

**Recommendation**: Keep STRICT (placeholders indicate incomplete generation)

---

## Validation Categories Explained

### ✅ STRICT (Block Progression)
- **When**: Field is stored in database and queried by frontend
- **Why**: System depends on exact values for functionality
- **Examples**: `exercise_type`, `difficulty_level`, `course_title`

### ⚠️ WARNING (Log But Allow)
- **When**: Field is LLM-to-LLM guidance, not database constraint
- **Why**: Semantic understanding is more important than exact match
- **Examples**: `primary_strategy`, `theory_practice_ratio`, `exercise_types` (in guidance)

### ℹ️ OPTIONAL (No Validation)
- **When**: Internal metadata, truly optional fields
- **Why**: Not critical for system functionality
- **Examples**: None found in current schemas

---

## Recommended Actions

### Immediate (Stage 4 Analysis)
1. Convert all enum fields in `GenerationGuidanceSchema` to warnings
2. Convert all enum fields in `PedagogicalPatternsSchema` to warnings
3. Keep min/max constraints on numeric fields (these prevent nonsensical values)

### Short-term (Stage 5 Generation)
1. Convert `validateDurationProportionality()` from ERROR to WARNING
2. Keep all other Stage 5 validations STRICT (database integrity)
3. Add fuzzy matching for `cognitiveLevel` (RT-007 Phase 2 already planned)

### Long-term (Cross-stage)
1. Implement RT-007 Phase 3 validation severity system
2. Add `ValidationSeverity` enum to all refinements
3. Orchestrator respects severity levels (ERROR blocks, WARNING logs, INFO monitors)
