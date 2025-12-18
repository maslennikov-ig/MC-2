# LLM Model Testing Methodology

**Version**: 1.0
**Date**: 2025-11-13
**Purpose**: Standardized methodology for evaluating LLM models for course generation tasks

---

## 🎯 Core Principle

**Token Count ≠ Quality**

A model generating 5,000 tokens of verbose, repetitive content is **worse** than a model generating 500 tokens of precise, well-structured JSON.

---

## 📋 Testing Framework

### Phase 1: Quantitative Metrics (Basic)

**What to Measure:**
- ✅ **Output Tokens**: Raw token count (input + output)
- ✅ **Generation Time**: Duration in milliseconds
- ✅ **Cost**: Estimated cost based on pricing ($input/$output per 1M tokens)
- ✅ **Success Rate**: % of tests that complete without errors

**Tools:**
- Test scripts: `scripts/test-model-*.ts`
- Output logs: `/tmp/*-complete.log`

**Limitations:**
- ❌ Does NOT measure quality
- ❌ Does NOT validate structure
- ❌ Does NOT check schema compliance
- ❌ Does NOT verify content accuracy

---

### Phase 2: Qualitative Analysis (CRITICAL)

**What to Inspect:**

#### 2.1 JSON Structure Validation
```typescript
// Required checks:
- ✅ Valid JSON syntax (no parsing errors)
- ✅ snake_case field naming (not camelCase)
- ✅ All required fields present
- ✅ Correct data types (string, number, array, object)
- ✅ No extra/unexpected fields
```

**Example Issues:**
```json
// ❌ BAD: camelCase fields
{
  "courseTitle": "...",
  "learningObjectives": []
}

// ✅ GOOD: snake_case fields
{
  "course_title": "...",
  "learning_outcomes": []
}
```

#### 2.2 Content Quality Assessment

**For Metadata (T1, T2):**
| Field | Quality Criteria |
|-------|-----------------|
| `course_title` | 10-100 chars, descriptive, no filler words |
| `course_description` | 50-500 chars, engaging, clear value proposition |
| `course_overview` | 500-3000 chars, detailed but not verbose, structured |
| `target_audience` | Specific personas, clear prerequisites |
| `learning_outcomes` | 3-8 outcomes, SMART format, Bloom's taxonomy levels |
| `prerequisites` | 0-5 items, realistic, not overly restrictive |
| `course_tags` | 5-15 tags, relevant keywords |

**For Lesson Structure (T3, T4):**
| Field | Quality Criteria |
|-------|-----------------|
| `section_title` | Clear, specific topic |
| `section_description` | 100-500 chars, motivational |
| `lessons` | **3-5 lessons** (NOT 1!), each with full structure |
| `lesson_objectives` | 2-5 per lesson, measurable, progressive difficulty |
| `key_topics` | 3-8 topics, specific concepts (not generic) |
| `exercises` | 1-3 per lesson, actionable, clear instructions |

#### 2.3 Language Quality

**For English (en):**
- ✅ Natural, fluent grammar
- ✅ Professional tone
- ✅ Technical terms used correctly
- ❌ No machine translation artifacts

**For Russian (ru):**
- ✅ Native Russian phrasing (not translated from English)
- ✅ Proper declensions and conjugations
- ✅ Appropriate technical terminology
- ❌ No word-for-word translations

#### 2.4 Content Depth Analysis

**Verbosity vs Value:**

| Metric | Measurement | Interpretation |
|--------|-------------|----------------|
| **Info Density** | Unique concepts per 100 tokens | Higher = better |
| **Repetition Rate** | % of repeated phrases | Lower = better |
| **Filler Words** | Count of "very", "really", etc. | Lower = better |
| **Example Quality** | Specificity of examples | Concrete > Generic |

**Example Comparison:**

```json
// ❌ LOW QUALITY (1000 tokens, low density)
{
  "course_overview": "This course is really, really great. It will teach you many things. You will learn a lot. It's very comprehensive. You'll gain knowledge about various topics. The course covers everything you need. It's very detailed and thorough..."
}

// ✅ HIGH QUALITY (300 tokens, high density)
{
  "course_overview": "Master Python fundamentals through 12 hands-on projects: build a web scraper, REST API, data analyzer, and CLI tool. Learn variables, control flow, functions, OOP, and file I/O with immediate application. Includes debugging techniques and PEP8 best practices."
}
```

---

## 🔬 Quality Scoring System

### Schema Compliance Score (0-1.0)

```typescript
function calculateSchemaScore(output: any): number {
  let score = 0;
  const weights = {
    validJSON: 0.25,           // Parses without errors
    correctFields: 0.25,       // All required fields present
    correctTypes: 0.25,        // Data types match schema
    namingConvention: 0.25     // snake_case throughout
  };

  if (isValidJSON(output)) score += weights.validJSON;
  if (hasAllRequiredFields(output)) score += weights.correctFields;
  if (hasCorrectDataTypes(output)) score += weights.correctTypes;
  if (usesSnakeCase(output)) score += weights.namingConvention;

  return score;
}
```

### Content Quality Score (0-1.0)

```typescript
function calculateContentScore(output: any, scenario: 'metadata' | 'lesson'): number {
  let score = 0;

  if (scenario === 'metadata') {
    // Check learning outcomes quality
    if (hasActionVerbs(output.learning_outcomes)) score += 0.2;
    if (hasBloomsTaxonomy(output.learning_outcomes)) score += 0.2;

    // Check description depth
    if (output.course_overview.length >= 500) score += 0.2;
    if (hasSpecificExamples(output.course_overview)) score += 0.2;

    // Check target audience specificity
    if (hasPersonaDetails(output.target_audience)) score += 0.2;
  }

  if (scenario === 'lesson') {
    // Check lesson count
    if (output.lessons.length >= 3 && output.lessons.length <= 5) score += 0.3;
    else if (output.lessons.length === 1) score += 0.0; // Major penalty!

    // Check objectives quality
    if (allLessonsHaveObjectives(output.lessons)) score += 0.2;

    // Check exercise quality
    if (allLessonsHaveExercises(output.lessons)) score += 0.3;

    // Check topic specificity
    if (hasSpecificTopics(output.lessons)) score += 0.2;
  }

  return Math.min(1.0, score);
}
```

### Overall Quality Score

```
Overall = (Schema Score × 0.4) + (Content Score × 0.4) + (Language Score × 0.2)
```

**Quality Tiers:**
- **S-Tier**: 0.90-1.00 (Production-ready)
- **A-Tier**: 0.75-0.89 (Good, minor issues)
- **B-Tier**: 0.60-0.74 (Acceptable, needs improvement)
- **C-Tier**: 0.40-0.59 (Poor quality)
- **F-Tier**: 0.00-0.39 (Unusable)

---

## 📊 Ranking Methodology

### Step 1: Separate by Task Type

**Metadata Generation:**
- Models optimized for detailed descriptions
- Higher token counts may indicate thoroughness

**Lesson Structure Generation:**
- Models optimized for hierarchical JSON
- Critical: Must generate 3-5 lessons, not 1!

### Step 2: Multi-Dimensional Ranking

**For Each Model, Calculate:**

1. **Quality Score** (0-1.0)
   - Schema compliance
   - Content quality
   - Language accuracy

2. **Efficiency Score** (0-1.0)
   - Quality per token
   - Quality per dollar
   - Quality per second

3. **Consistency Score** (0-1.0)
   - Success rate across all tests
   - Variance in quality scores
   - Retry requirements

4. **Composite Score**
   ```
   Composite = (Quality × 0.5) + (Efficiency × 0.3) + (Consistency × 0.2)
   ```

### Step 3: Task-Specific Rankings

**Metadata Ranking:**
```
Rank by: Composite Score
Tiebreaker: Output token count (higher = more detailed)
```

**Lesson Structure Ranking:**
```
Rank by: Composite Score
Tiebreaker: Lesson count (3-5 preferred)
Penalty: -0.5 if only 1 lesson generated
```

---

## ⚠️ Common Pitfalls to Avoid

### 1. Token Count Fallacy
❌ **WRONG**: "Model A generates 5000 tokens, Model B generates 500, so A is better"
✅ **CORRECT**: Read actual outputs and compare information density

### 2. Success Rate Illusion
❌ **WRONG**: "Model passed 4/4 tests, so it's production-ready"
✅ **CORRECT**: Check if outputs meet quality standards, not just parse

### 3. Pricing Myopia
❌ **WRONG**: "Model A is cheapest, so use it everywhere"
✅ **CORRECT**: Factor in quality - poor quality = wasted money

### 4. Single-Test Bias
❌ **WRONG**: "Model performed well on English test, assume Russian is fine"
✅ **CORRECT**: Test all language/scenario combinations separately

### 5. Schema Compromise
❌ **WRONG**: "Model uses camelCase, close enough to snake_case"
✅ **CORRECT**: Schema compliance is binary - either correct or incorrect

---

## 🛠️ Improved Testing Workflow

### Current Issues (2025-11-13)

Our test scripts measure **quantity** but not **quality**:

```typescript
// ❌ What we currently do:
console.log(`SUCCESS - ${tokens.output} output tokens`);

// ✅ What we SHOULD do:
const quality = analyzeQuality(response);
console.log(`SUCCESS - ${tokens.output} tokens, Quality: ${quality.toFixed(2)}`);
```

### Recommended Improvements

1. **Save Full Outputs**
   ```typescript
   // In test scripts:
   writeFileSync(`/tmp/model-${modelName}-T${testId}-output.json`, response);
   ```

2. **Automated Quality Analysis**
   ```bash
   # After tests complete:
   pnpm tsx scripts/analyze-quality.ts /tmp/*-output.json
   ```

3. **Side-by-Side Comparison**
   ```bash
   # Compare two models:
   pnpm tsx scripts/compare-models.ts model-a model-b
   ```

4. **Visual Diff Tool**
   - Show differences in JSON structure
   - Highlight schema violations
   - Compare learning outcomes quality

---

## 📝 Test Case Design Principles

### 1. Representative Scenarios

**Metadata Tests:**
- T1: English, Beginner, Technical (e.g., "Introduction to Python")
- T2: Russian, Intermediate, Conceptual (e.g., "Machine Learning Basics")

**Lesson Tests:**
- T3: English, Programming, Hands-on (e.g., "Variables in Python")
- T4: Russian, Theory, Conceptual (e.g., "Neural Networks Fundamentals")

### 2. Consistent Prompts

All models MUST receive **identical prompts** for fair comparison.

**Template Requirements:**
- Explicit JSON schema in prompt
- Clear field naming convention (snake_case)
- Specific token length expectations
- Example structure (optional)

### 3. Controlled Variables

**Fixed:**
- Temperature: 0.7 (balance creativity/consistency)
- Max tokens: 8000 (sufficient for all scenarios)
- Language: Explicit in prompt
- RAG context: 0 tokens (for initial tests)

**Variable:**
- Model name
- Pricing
- Context window size

---

## 📈 Reporting Standards

### Minimum Report Contents

1. **Executive Summary**
   - Models tested
   - Test scenarios
   - Top 3 recommendations

2. **Quantitative Results Table**
   ```
   | Model | T1 Tokens | T2 Tokens | T3 Tokens | T4 Tokens | Avg Cost | Success Rate |
   ```

3. **Qualitative Analysis**
   - Schema compliance issues
   - Content quality observations
   - Language accuracy notes

4. **Sample Outputs**
   - Best example (highest quality)
   - Worst example (lowest quality)
   - Typical example (median quality)

5. **Recommendations**
   - By use case
   - By budget constraint
   - By quality requirement

---

## 🔄 Continuous Improvement

### Model Retesting Triggers

Retest models when:
- ✅ New model version released
- ✅ Pricing changes significantly (>20%)
- ✅ Schema requirements updated
- ✅ New language support needed
- ✅ Quality issues reported in production

### Benchmark Evolution

Update test cases when:
- ✅ New course types introduced
- ✅ User feedback indicates gaps
- ✅ Competitor models set new standards

---

## 📚 Reference: Previous Mistakes

### Case Study 1: deepseek-chat-v3.1 Misjudgment

**Initial Assessment:**
- ✅ 4/4 tests passed
- ✅ Fast generation (13.8s avg)
- ⭐ Rated as "S-TIER"

**Actual Quality (After Review):**
- ❌ Quality score: 0.80 (not 1.00!)
- ❌ Only 1 lesson generated (not 3-5)
- ❌ Used camelCase fields
- ❌ Output: 463 tokens (6x less than kimi-k2-thinking)

**Lesson Learned:**
> "Success rate alone is meaningless. Always inspect actual outputs."

### Case Study 2: Token Count Overvaluation

**Initial Ranking:**
1. qwen3-235b-thinking: 4,927 tokens (metadata)
2. kimi-k2-thinking: 4,259 tokens (metadata)

**After Quality Review:**
- Both had excellent quality (1.00)
- qwen3-235b: More verbose descriptions
- kimi-k2: More structured, concise

**Lesson Learned:**
> "Higher token count may indicate verbosity, not quality. Prioritize information density."

---

## ✅ Quality Checklist for Manual Review

Before finalizing model rankings, verify:

### Metadata Outputs (T1, T2)
- [ ] `course_description` is engaging (not generic)
- [ ] `course_overview` has specific examples
- [ ] `learning_outcomes` use action verbs
- [ ] `learning_outcomes` follow Bloom's taxonomy
- [ ] `target_audience` defines clear personas
- [ ] `prerequisites` are realistic
- [ ] All fields use snake_case

### Lesson Outputs (T3, T4)
- [ ] Generated 3-5 lessons (NOT 1!)
- [ ] Each lesson has 2-5 objectives
- [ ] Objectives are measurable
- [ ] Topics are specific (not generic)
- [ ] Exercises have clear instructions
- [ ] Estimated durations are reasonable
- [ ] All fields use snake_case

### Language Quality
- [ ] Grammar is natural (not machine-translated)
- [ ] Technical terms used correctly
- [ ] Russian uses native phrasing (if applicable)
- [ ] No repetitive filler words

---

## 🎓 Conclusion

Effective LLM model evaluation requires:

1. **Quantitative metrics** (tokens, cost, speed) for initial filtering
2. **Qualitative analysis** (structure, content, language) for final ranking
3. **Task-specific criteria** (metadata vs lessons have different quality standards)
4. **Continuous validation** (retest as models evolve)

**Golden Rule:**
> Read the actual outputs. Numbers lie, JSON doesn't.

---

**Document Owner**: Claude Code
**Last Updated**: 2025-11-13
**Next Review**: When new models are released or quality issues arise
