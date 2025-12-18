# Model Quality Testing Methodology V2

**Version**: 2.0
**Date**: 2025-11-13
**Purpose**: Quality-focused LLM model evaluation (NOT token-count focused)

---

## 🎯 Core Philosophy

### OLD Approach (WRONG)
```
Test model → Count output tokens → Rank by tokens
```
**Problems**:
- 5000 tokens of garbage > 500 tokens of quality
- No quality assessment
- No consistency measurement
- Cost estimates (not real)

### NEW Approach (CORRECT)
```
Test model 3-5x → Save full outputs → Analyze quality → Rank by quality
```
**Benefits**:
- Quality-first ranking
- Consistency measurement
- Real output inspection
- Cost from user (real data)

---

## 📐 Test Design

### Models to Test

```typescript
const MODELS = [
  'moonshotai/kimi-k2-0905',       // Regular version
  'moonshotai/kimi-k2-thinking',   // Thinking version (comparison)
  'deepseek/deepseek-v3.2-exp',    // Cheapest fully-capable
  'deepseek/deepseek-chat-v3.1',   // Stable version
  'x-ai/grok-4-fast',              // Speed champion
  'minimax/minimax-m2',            // New candidate
];
```

### Test Scenarios

**4 Scenarios × 3-5 Runs Each = 12-20 Outputs Per Model**

#### Scenario 1: Metadata - English, Beginner
```json
{
  "id": "metadata-en",
  "type": "metadata",
  "language": "en",
  "title": "Introduction to Python Programming",
  "description": "Beginner-level technical programming course"
}
```

#### Scenario 2: Metadata - Russian, Intermediate
```json
{
  "id": "metadata-ru",
  "type": "metadata",
  "language": "ru",
  "title": "Машинное обучение для начинающих",
  "description": "Intermediate-level conceptual ML course"
}
```

#### Scenario 3: Lesson Structure - English, Programming
```json
{
  "id": "lesson-en",
  "type": "lesson",
  "language": "en",
  "title": "Variables and Data Types in Python",
  "description": "Hands-on programming section with exercises"
}
```

#### Scenario 4: Lesson Structure - Russian, Theory
```json
{
  "id": "lesson-ru",
  "type": "lesson",
  "language": "ru",
  "title": "Основы нейронных сетей",
  "description": "Conceptual theory section with examples"
}
```

---

## 🔄 Multiple Runs Strategy

### Why 3-5 Runs?

**Single run problems**:
- Model may get lucky/unlucky once
- Temperature 0.7 = variability
- No consistency measurement

**Multiple runs benefits**:
- Measure consistency (standard deviation of quality)
- Identify best/worst/average performance
- Detect random failures vs systematic issues

### Run Configuration

```typescript
const RUNS_PER_SCENARIO = 3;  // Minimum for consistency
// Can increase to 5 for more confidence

// Total API calls per model:
// 4 scenarios × 3 runs = 12 API calls
// 6 models × 12 calls = 72 total API calls
```

---

## 💾 Output Storage

### Directory Structure

```
/tmp/quality-tests/
  kimi-k2-0905/
    metadata-en-run1.json
    metadata-en-run1.log
    metadata-en-run2.json
    metadata-en-run2.log
    metadata-en-run3.json
    metadata-en-run3.log
    metadata-ru-run1.json
    metadata-ru-run2.json
    metadata-ru-run3.json
    lesson-en-run1.json
    lesson-en-run2.json
    lesson-en-run3.json
    lesson-ru-run1.json
    lesson-ru-run2.json
    lesson-ru-run3.json
  kimi-k2-thinking/
    [same structure]
  deepseek-v32-exp/
    [same structure]
  ... (other models)
  quality-analysis-report.json
  quality-rankings.md
```

### Output Files

**\*.json** - Full model output (raw response)
```json
{
  "course_title": "Introduction to Python Programming",
  "course_description": "...",
  "learning_outcomes": [...]
}
```

**\*.log** - Metadata about generation
```json
{
  "model": "Kimi K2 0905",
  "scenario": "metadata-en",
  "runNumber": 1,
  "duration": 14326,
  "timestamp": "2025-11-13T12:00:00.000Z",
  "contentLength": 3521
}
```

**\*-ERROR.json** - Error details (if failed)
```json
{
  "model": "...",
  "scenario": "...",
  "runNumber": 1,
  "error": "HTTP 500 Internal Server Error",
  "timestamp": "..."
}
```

---

## 🔍 Quality Analysis Framework

### Phase 1: Schema Validation

```typescript
interface SchemaCheck {
  validJSON: boolean;          // Parses without errors?
  hasRequiredFields: boolean;  // All required fields present?
  correctDataTypes: boolean;   // string/number/array match schema?
  usesSnakeCase: boolean;      // snake_case (NOT camelCase)?
}

function validateSchema(output: any, type: 'metadata' | 'lesson'): SchemaCheck {
  // For metadata:
  const requiredFields = [
    'course_title', 'course_description', 'course_overview',
    'target_audience', 'estimated_duration_hours', 'difficulty_level',
    'prerequisites', 'learning_outcomes', 'course_tags'
  ];

  // For lessons:
  const requiredFields = [
    'section_number', 'section_title', 'section_description',
    'learning_objectives', 'lessons'
  ];

  // Check each field...
}
```

**Schema Score**: 0.0-1.0
- 1.0 = Perfect compliance
- 0.0 = Failed to parse or missing critical fields

### Phase 2: Content Quality Analysis

#### For Metadata

```typescript
interface MetadataQuality {
  descriptionEngaging: boolean;      // Has value proposition?
  overviewDetailed: boolean;         // 500+ chars with structure?
  learningOutcomesQuality: number;   // 0-1 scale
  targetAudienceSpecific: boolean;   // Defines personas?
  prerequisitesRealistic: boolean;   // Not overly restrictive?
}

function analyzeMetadataQuality(output: any): number {
  let score = 0;

  // Learning outcomes quality (0-0.4)
  if (hasActionVerbs(output.learning_outcomes)) score += 0.1;
  if (followsBloomsTaxonomy(output.learning_outcomes)) score += 0.1;
  if (output.learning_outcomes.length >= 3 && output.learning_outcomes.length <= 8) score += 0.1;
  if (isMeasurable(output.learning_outcomes)) score += 0.1;

  // Overview quality (0-0.3)
  if (output.course_overview.length >= 500) score += 0.1;
  if (hasSpecificExamples(output.course_overview)) score += 0.1;
  if (hasStructure(output.course_overview)) score += 0.1;

  // Description quality (0-0.2)
  if (output.course_description.length >= 50 && output.course_description.length <= 500) score += 0.1;
  if (hasValueProposition(output.course_description)) score += 0.1;

  // Target audience (0-0.1)
  if (definesPersonas(output.target_audience)) score += 0.1;

  return Math.min(1.0, score);
}
```

**Key Checks**:
- ✅ **Action Verbs**: "Define", "Build", "Analyze" (not "Learn", "Understand")
- ✅ **Bloom's Taxonomy**: Progressive cognitive levels
- ✅ **Specificity**: Concrete examples, not generic phrases
- ✅ **Measurability**: Outcomes can be tested

#### For Lesson Structure

```typescript
interface LessonQuality {
  lessonCount: number;                    // How many lessons? (target: 3-5)
  allLessonsComplete: boolean;            // Each has objectives/topics/exercises?
  objectivesQuality: number;              // 0-1 scale
  topicsSpecific: boolean;                // Not generic "Introduction to..."?
  exercisesActionable: boolean;           // Clear instructions?
}

function analyzeLessonQuality(output: any): number {
  let score = 0;

  // Lesson count (CRITICAL!) (0-0.4)
  if (output.lessons.length === 1) score += 0.0;      // Major penalty
  else if (output.lessons.length === 2) score += 0.2;
  else if (output.lessons.length >= 3 && output.lessons.length <= 5) score += 0.4;
  else if (output.lessons.length > 5) score += 0.3;   // Too many

  // Objectives quality (0-0.3)
  if (allLessonsHaveObjectives(output.lessons)) score += 0.1;
  if (objectivesAreMeasurable(output.lessons)) score += 0.1;
  if (objectivesUseActionVerbs(output.lessons)) score += 0.1;

  // Topics specificity (0-0.2)
  if (topicsAreSpecific(output.lessons)) score += 0.2;

  // Exercises quality (0-0.1)
  if (allLessonsHaveExercises(output.lessons)) score += 0.05;
  if (exercisesHaveClearInstructions(output.lessons)) score += 0.05;

  return Math.min(1.0, score);
}
```

**Critical Check**: Lesson Count
```typescript
// ❌ BAD: Only 1 lesson
{
  "lessons": [
    { "lesson_number": 1, "lesson_title": "..." }
  ]
}

// ✅ GOOD: 3-5 lessons
{
  "lessons": [
    { "lesson_number": 1, "lesson_title": "Variables" },
    { "lesson_number": 2, "lesson_title": "Data Types" },
    { "lesson_number": 3, "lesson_title": "Type Conversion" }
  ]
}
```

### Phase 3: Language Quality

```typescript
interface LanguageQuality {
  grammar: boolean;              // Natural, fluent?
  terminology: boolean;          // Technical terms correct?
  culturalFit: boolean;          // Native phrasing (for Russian)?
  noTranslationArtifacts: boolean; // Not machine-translated?
}

function analyzeLanguageQuality(output: any, language: 'en' | 'ru'): number {
  let score = 0;

  if (language === 'en') {
    if (hasNaturalGrammar(output)) score += 0.3;
    if (usesCorrectTerminology(output)) score += 0.4;
    if (hasProfessionalTone(output)) score += 0.3;
  }

  if (language === 'ru') {
    if (hasNativeRussianPhrasing(output)) score += 0.3;
    if (usesCorrectRussianTerminology(output)) score += 0.4;
    if (noWordForWordTranslation(output)) score += 0.3;
  }

  return Math.min(1.0, score);
}
```

---

## 📊 Quality Scoring System

### Overall Quality Score

```typescript
function calculateOverallQuality(
  output: any,
  scenario: TestScenario
): number {
  const schemaScore = validateSchema(output, scenario.type);
  const contentScore = scenario.type === 'metadata'
    ? analyzeMetadataQuality(output)
    : analyzeLessonQuality(output);
  const languageScore = analyzeLanguageQuality(output, scenario.language);

  // Weighted average
  const overall = (
    schemaScore * 0.4 +
    contentScore * 0.4 +
    languageScore * 0.2
  );

  return overall;
}
```

### Consistency Score (Across Multiple Runs)

```typescript
function calculateConsistency(runs: number[]): number {
  const mean = runs.reduce((a, b) => a + b) / runs.length;
  const variance = runs.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / runs.length;
  const stdDev = Math.sqrt(variance);

  // Consistency = 1 - (stdDev / mean)
  // Perfect consistency (stdDev=0) = 1.0
  // High variance = lower score
  return Math.max(0, 1 - stdDev);
}
```

---

## 🏆 Ranking Methodology

### Step 1: Calculate Per-Model Scores

For each model:

```typescript
interface ModelScore {
  model: string;
  metadataQuality: {
    avgScore: number;         // Average of all metadata runs
    consistency: number;      // How stable?
    bestRun: number;          // Highest score
    worstRun: number;         // Lowest score
  };
  lessonQuality: {
    avgScore: number;
    consistency: number;
    bestRun: number;
    worstRun: number;
  };
  overallQuality: number;     // Combined score
  successRate: number;        // % of runs that succeeded
}
```

### Step 2: Separate Rankings

#### Metadata Ranking

```
Rank models by: metadataQuality.avgScore
Tiebreaker: consistency (higher = better)
```

**Example**:
1. Kimi K2 Thinking - 0.95 avg, 0.92 consistency
2. Kimi K2 0905 - 0.93 avg, 0.88 consistency
3. DeepSeek v3.2 - 0.91 avg, 0.95 consistency

#### Lesson Structure Ranking

```
Rank models by: lessonQuality.avgScore
Tiebreaker: consistency
Penalty: -0.3 if generates only 1 lesson
```

**Example**:
1. Kimi K2 Thinking - 0.92 avg, 0.89 consistency (3-5 lessons)
2. Grok 4 Fast - 0.85 avg, 0.91 consistency (3-4 lessons)
3. DeepSeek Chat v3.1 - 0.65 avg, 0.80 consistency (**only 1 lesson!**)

### Step 3: Quality Report

Generate comprehensive report:

```markdown
# Model Quality Rankings (No Cost Consideration)

## Metadata Generation

### 🥇 #1: Kimi K2 Thinking
- **Avg Quality**: 0.95 / 1.00
- **Consistency**: 0.92 / 1.00 (Very stable)
- **Best Run**: 0.98 (metadata-en run 2)
- **Worst Run**: 0.91 (metadata-ru run 1)

**Strengths**:
- Excellent learning outcomes (action verbs, Bloom's taxonomy)
- Detailed course_overview (avg 2800 chars)
- Specific target_audience personas

**Sample Output**: `/tmp/quality-tests/kimi-k2-thinking/metadata-en-run2.json`

---

### 🥈 #2: Kimi K2 0905
... (similar format)

---

## Lesson Structure Generation

### 🥇 #1: Kimi K2 Thinking
- **Avg Quality**: 0.92 / 1.00
- **Consistency**: 0.89 / 1.00
- **Lesson Count**: 3-5 (all runs)

**Strengths**:
- Always generates 3-5 complete lessons
- Detailed objectives per lesson
- Specific key_topics (not generic)
- Actionable exercise instructions

**Sample Output**: `/tmp/quality-tests/kimi-k2-thinking/lesson-en-run1.json`

---

### 🥈 #2: Grok 4 Fast
...

---

### ⚠️ #6: DeepSeek Chat v3.1
- **Avg Quality**: 0.65 / 1.00
- **Major Issue**: Only generates 1 lesson (all 3 runs)

**Sample Output**: `/tmp/quality-tests/deepseek-chat-v31/lesson-en-run1.json`
```

---

## 💰 Cost Integration (Phase 2)

After quality rankings complete, user provides **real costs**:

```typescript
interface RealCosts {
  model: string;
  inputCostPer1M: number;    // User provides
  outputCostPer1M: number;   // User provides
  source: string;            // e.g., "OpenRouter API 2025-11-13"
}

// Then calculate cost-adjusted rankings:
function calculateValueScore(
  qualityScore: number,
  realCost: number
): number {
  // Quality per dollar
  return qualityScore / realCost;
}
```

**Final Rankings** will include:
1. **Pure Quality** (current phase)
2. **Quality per Dollar** (after user provides costs)
3. **Speed-Adjusted Quality** (quality / generation_time)

---

## 🚀 Execution Plan

### Phase 1: Data Collection (Current)

```bash
# Run quality tests (72 API calls total)
cd packages/course-gen-platform
pnpm tsx scripts/test-models-with-quality.ts

# Expected time: ~30-40 minutes
# (6 models × 4 scenarios × 3 runs × ~30s avg = ~36 minutes)
```

### Phase 2: Quality Analysis

```bash
# Analyze all saved outputs
pnpm tsx scripts/analyze-quality.ts

# Generates:
# - /tmp/quality-tests/quality-analysis-report.json
# - /tmp/quality-tests/quality-rankings.md
```

### Phase 3: Review & Ranking

Manual review of:
- Best runs (highest quality samples)
- Worst runs (identify failure patterns)
- Consistency issues

Create final rankings document.

### Phase 4: Cost Integration (User Input)

User provides real costs → Recalculate rankings with cost factor.

---

## ✅ Success Criteria

**Test run is successful when:**
- ✅ All 72 outputs saved (6 models × 4 scenarios × 3 runs)
- ✅ Quality analysis completes without errors
- ✅ Rankings generated for both metadata and lessons
- ✅ Sample outputs reviewed manually

**Model passes quality threshold when:**
- ✅ Avg quality ≥ 0.75 (B-Tier minimum)
- ✅ Success rate ≥ 80% (at least 2 of 3 runs succeed)
- ✅ For lessons: generates 3+ lessons (not just 1!)
- ✅ Schema compliance = 100%

---

## 🎯 Expected Outcomes

### Hypothesis

**Metadata Generation**:
- Kimi K2 Thinking → Best quality (detailed, thinking tokens)
- Kimi K2 0905 → Lower quality (less detailed)
- DeepSeek models → Good but shorter

**Lesson Structure**:
- Kimi K2 Thinking → Best (3-5 lessons, full structure)
- Grok 4 Fast → Fast but decent quality
- DeepSeek Chat v3.1 → **Likely issue** (only 1 lesson)

### Validation Strategy

Compare new results with old data:
- Old: kimi-k2-thinking had 4,259 metadata tokens
- New: Check if quality actually matches token count
- Old: deepseek-chat-v3.1 had quality 0.80
- New: Verify with multiple runs

---

## 📝 Summary

**This methodology ensures**:
1. ✅ Quality-first ranking (not token-count)
2. ✅ Consistency measurement (3-5 runs)
3. ✅ Full output preservation (manual review possible)
4. ✅ Separate rankings (metadata vs lessons)
5. ✅ Cost consideration (later, from user)

**Key Principle**:
> "Read the outputs, not the metrics. Quality beats quantity."

---

**Ready to Execute**: YES
**Next Command**: `pnpm tsx scripts/test-models-with-quality.ts`
**Expected Duration**: 30-40 minutes
**Expected Output**: 72 JSON files + quality analysis report

