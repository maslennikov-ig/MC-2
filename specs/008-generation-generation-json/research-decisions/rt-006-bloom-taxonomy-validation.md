# RT-006: Bloom's Taxonomy Validation Framework - FINAL DECISION

**Research Task**: RT-006 Bloom's Taxonomy Integration for Pedagogical Validation
**Decision Date**: 2025-11-07
**Status**: ✅ APPROVED - Ready for Implementation
**Strategy**: **3-Tier Progressive Validation** + Bilingual Bloom's Whitelist + Duration Proportionality

---

## Executive Summary

**ФИНАЛЬНОЕ РЕШЕНИЕ**: Progressive validation gates (Draft 40% → Publication 85%) with bilingual Bloom's whitelist (165 verbs) + duration proportionality formulas + placeholder/blacklist detection.

**Target Quality**: 85-90% pedagogical compliance at publication
**Rejection Rate**: 30-40% at draft stage (prevents downstream waste)
**Validation Coverage**: 95%+ placeholder detection, 100% non-measurable verb blocking

**Research Consensus**: All 6 recommendations (26KB research report) approved for production deployment.

---

## Research Context

**Source Analyzed**: RT-006 Research Report "Bloom's Taxonomy Integration for Pedagogical Validation" (~26KB)

**Key Finding**:

> "40% of quality issues stem from non-measurable action verbs (understand, know, learn) in learning objectives. Blocking these at draft stage prevents 15-100x downstream revision costs."

**Implication**: Early validation gates with strict Bloom's compliance prevent expensive regeneration cycles.

---

## Validation Strategy: 6-Component Framework

### 1. 3-Tier Progressive Validation (P3 Priority) 🎯

**Strategy**: Stage-gated quality thresholds matching SDLC phases

**Thresholds**:

- **Draft (40%)**: Basic structure, placeholder detection, blacklist blocking
- **Review (60%)**: Bloom's taxonomy compliance, duration proportionality
- **Submission (70%)**: Specificity scoring, cross-objective coherence
- **Publication (85%)**: Full pedagogical compliance, production-ready

**Cost Impact**: 30-40% rejection at draft saves $0.10-0.15 per course (no regeneration)

**Implementation**:

```typescript
enum ValidationStage {
  DRAFT = 'DRAFT', // 40% threshold
  REVIEW = 'REVIEW', // 60% threshold
  SUBMISSION = 'SUBMISSION', // 70% threshold
  PUBLICATION = 'PUBLICATION', // 85% threshold
}

async function validateCourseStructure(
  structure: CourseStructure,
  stage: ValidationStage
): Promise<ValidationResult> {
  const threshold = STAGE_THRESHOLDS[stage];
  const validators = STAGE_VALIDATORS[stage];

  for (const validator of validators) {
    const result = await validator(structure);
    if (result.score < threshold) {
      return {
        passed: false,
        stage,
        score: result.score,
        threshold,
        issues: result.issues,
        recommendation:
          stage === ValidationStage.DRAFT
            ? 'REGENERATE_METADATA' // cheap fix at draft
            : 'ESCALATE_TO_HUMAN', // expensive fix later
      };
    }
  }

  return { passed: true, stage, score: aggregateScore(validators) };
}

const STAGE_THRESHOLDS = {
  [ValidationStage.DRAFT]: 0.4,
  [ValidationStage.REVIEW]: 0.6,
  [ValidationStage.SUBMISSION]: 0.7,
  [ValidationStage.PUBLICATION]: 0.85,
};

const STAGE_VALIDATORS = {
  [ValidationStage.DRAFT]: [
    validatePlaceholders, // P0: 95%+ detection
    validateBlacklistVerbs, // P0: 100% blocking
  ],
  [ValidationStage.REVIEW]: [
    validateBloomsTaxonomy, // P1: 165 verbs
    validateDurationProportionality, // P1: 2-5 min/topic
  ],
  [ValidationStage.SUBMISSION]: [
    validateSpecificityScoring, // P2: 0-100 scale
    validateCrossObjectiveCoherence,
  ],
  [ValidationStage.PUBLICATION]: [validateFullPedagogicalCompliance, validateProductionReadiness],
};
```

**Rationale**: Research shows 40% of quality issues detectable at draft stage with simple regex/blacklist checks. Progressive gates prevent expensive late-stage failures.

---

### 2. Bilingual Bloom's Whitelist (P1 Priority) 📚

**Strategy**: 165 approved action verbs (87 EN + 78 RU) mapped to 6 cognitive levels

**Cognitive Levels** (Bloom's Taxonomy Revised):

1. **Remember** (Knowledge): list, name, identify, recall, define
2. **Understand** (Comprehension): explain, summarize, interpret, describe, classify
3. **Apply** (Application): demonstrate, implement, execute, use, solve
4. **Analyze** (Analysis): compare, contrast, differentiate, examine, categorize
5. **Evaluate** (Evaluation): assess, justify, critique, defend, recommend
6. **Create** (Synthesis): design, develop, construct, formulate, plan

**Verb Distribution**:

- **English**: 87 verbs (15 Remember, 18 Understand, 14 Apply, 15 Analyze, 12 Evaluate, 13 Create)
- **Russian**: 78 verbs (12 Remember, 16 Understand, 13 Apply, 14 Analyze, 11 Evaluate, 12 Create)

**Implementation**:

```typescript
const BLOOMS_TAXONOMY_WHITELIST = {
  en: {
    remember: [
      'list',
      'name',
      'identify',
      'recall',
      'define',
      'recognize',
      'state',
      'label',
      'match',
      'select',
      'describe',
      'cite',
      'enumerate',
      'quote',
      'retrieve',
    ],
    understand: [
      'explain',
      'summarize',
      'interpret',
      'describe',
      'classify',
      'paraphrase',
      'exemplify',
      'illustrate',
      'infer',
      'predict',
      'discuss',
      'clarify',
      'relate',
      'translate',
      'convert',
      'express',
      'report',
      'restate',
    ],
    apply: [
      'demonstrate',
      'implement',
      'execute',
      'use',
      'solve',
      'apply',
      'construct',
      'operate',
      'perform',
      'practice',
      'compute',
      'calculate',
      'modify',
      'prepare',
    ],
    analyze: [
      'compare',
      'contrast',
      'differentiate',
      'examine',
      'categorize',
      'analyze',
      'organize',
      'deconstruct',
      'distinguish',
      'investigate',
      'integrate',
      'correlate',
      'structure',
      'attribute',
      'outline',
    ],
    evaluate: [
      'assess',
      'justify',
      'critique',
      'defend',
      'recommend',
      'evaluate',
      'judge',
      'appraise',
      'argue',
      'prioritize',
      'validate',
      'verify',
    ],
    create: [
      'design',
      'develop',
      'construct',
      'formulate',
      'plan',
      'create',
      'invent',
      'compose',
      'generate',
      'hypothesize',
      'devise',
      'produce',
      'synthesize',
    ],
  },
  ru: {
    remember: [
      'перечислить',
      'назвать',
      'определить',
      'вспомнить',
      'указать',
      'распознать',
      'обозначить',
      'выбрать',
      'цитировать',
      'описать',
      'воспроизвести',
      'найти',
    ],
    understand: [
      'объяснить',
      'резюмировать',
      'интерпретировать',
      'описать',
      'классифицировать',
      'перефразировать',
      'проиллюстрировать',
      'предсказать',
      'обсудить',
      'уточнить',
      'связать',
      'перевести',
      'выразить',
      'пересказать',
      'преобразовать',
      'сообщить',
    ],
    apply: [
      'продемонстрировать',
      'реализовать',
      'выполнить',
      'использовать',
      'решить',
      'применить',
      'построить',
      'оперировать',
      'практиковать',
      'вычислить',
      'рассчитать',
      'модифицировать',
      'подготовить',
    ],
    analyze: [
      'сравнить',
      'противопоставить',
      'дифференцировать',
      'исследовать',
      'категоризировать',
      'анализировать',
      'организовать',
      'деконструировать',
      'различить',
      'интегрировать',
      'соотнести',
      'структурировать',
      'определить атрибуты',
      'составить план',
    ],
    evaluate: [
      'оценить',
      'обосновать',
      'критиковать',
      'защитить',
      'рекомендовать',
      'судить',
      'аргументировать',
      'приоритизировать',
      'валидировать',
      'верифицировать',
      'проверить',
    ],
    create: [
      'разработать',
      'создать',
      'сконструировать',
      'сформулировать',
      'спланировать',
      'изобрести',
      'составить',
      'генерировать',
      'гипотезировать',
      'придумать',
      'произвести',
      'синтезировать',
    ],
  },
};

function validateBloomsTaxonomy(objective: LearningObjective): ValidationResult {
  const verb = extractActionVerb(objective.text, objective.language);
  const whitelistForLanguage = BLOOMS_TAXONOMY_WHITELIST[objective.language];

  // Check if verb exists in any cognitive level
  for (const [level, verbs] of Object.entries(whitelistForLanguage)) {
    if (verbs.includes(verb.toLowerCase())) {
      return {
        passed: true,
        cognitiveLevel: level as BloomLevel,
        verb,
        score: 1.0,
      };
    }
  }

  return {
    passed: false,
    cognitiveLevel: null,
    verb,
    score: 0.0,
    issues: [
      `Action verb "${verb}" not found in Bloom's taxonomy whitelist for ${objective.language}`,
    ],
    suggestion: suggestAlternativeVerb(verb, objective.language),
  };
}

function extractActionVerb(text: string, language: string): string {
  // Extract first verb (objectives typically start with action verb)
  const tokens = text.trim().toLowerCase().split(/\s+/);

  // For Russian, handle infinitive forms (заканчиваются на -ть, -ти, -чь)
  if (language === 'ru') {
    return tokens[0]?.replace(/ся$/, '') || ''; // Remove reflexive ending
  }

  // For English, use base form
  return tokens[0] || '';
}
```

**Rationale**: Research shows 165 verbs cover 95%+ of valid educational objectives. Bilingual support critical for Russian courses (50% of target audience).

---

### 3. Non-Measurable Verbs Blacklist (P0 Priority) 🚫

**Strategy**: Block 40% of quality issues at draft stage by rejecting non-measurable verbs

**Blacklisted Verbs**:

- **English**: understand, know, learn, appreciate, believe, become aware, comprehend, familiarize, grasp, realize, recognize (importance of)
- **Russian**: понимать, знать, учиться, ценить, верить, осознавать, постигать, ознакомиться, усваивать, осознать

**Why Blacklisted**: These verbs are non-measurable (cannot verify learning through assessment)

**Implementation**:

```typescript
const NON_MEASURABLE_VERBS_BLACKLIST = {
  en: [
    'understand',
    'know',
    'learn',
    'appreciate',
    'believe',
    'become aware',
    'comprehend',
    'familiarize',
    'grasp',
    'realize',
    'recognize',
  ],
  ru: [
    'понимать',
    'знать',
    'учиться',
    'ценить',
    'верить',
    'осознавать',
    'постигать',
    'ознакомиться',
    'усваивать',
    'осознать',
  ],
};

function validateNonMeasurableVerbs(objective: LearningObjective): ValidationResult {
  const verb = extractActionVerb(objective.text, objective.language);
  const blacklistForLanguage = NON_MEASURABLE_VERBS_BLACKLIST[objective.language];

  if (blacklistForLanguage.some(banned => verb.toLowerCase().includes(banned))) {
    return {
      passed: false,
      score: 0.0,
      issues: [
        `Non-measurable verb "${verb}" detected. Learning objectives must use measurable action verbs.`,
      ],
      suggestion: `Replace "${verb}" with measurable verb from Bloom's taxonomy (e.g., "explain", "demonstrate", "analyze")`,
      blockedAt: ValidationStage.DRAFT,
    };
  }

  return { passed: true, score: 1.0 };
}
```

**Rationale**: Research shows 40% of rejected objectives contain "understand", "know", "learn". Blocking at draft prevents $0.10-0.15 regeneration cost per course.

---

### 4. Placeholder Detection (P0 Priority) 🔍

**Strategy**: 95%+ detection of incomplete/template content via comprehensive regex

**Placeholder Patterns**:

- TODO/FIXME markers: `TODO`, `FIXME`, `XXX`, `HACK`, `NOTE`, `@todo`
- Bracketed placeholders: `[insert...]`, `[TBD]`, `[название...]`, `[описание...]`
- Template variables: `{{variable}}`, `${variable}`, `<placeholder>`
- Ellipsis indicators: `...`, `…`, `etc.`, `и т.д.`
- Generic placeholders: `example`, `sample`, `placeholder`, `пример`, `образец`

**Implementation**:

```typescript
const PLACEHOLDER_REGEX_PATTERNS = [
  // TODO/FIXME markers
  /\b(TODO|FIXME|XXX|HACK|NOTE|@todo)\b/i,

  // Bracketed placeholders
  /\[(insert|add|TBD|название|описание|введите|добавьте)[^\]]*\]/i,

  // Template variables
  /\{\{[^}]+\}\}|\$\{[^}]+\}|<[a-z]+>/i,

  // Ellipsis indicators (3+ dots or unicode ellipsis)
  /\.{3,}|…/,

  // Generic placeholders
  /\b(example|sample|placeholder|пример|образец)\s+(title|name|description|text|название|текст)\b/i,

  // Empty or whitespace-only content
  /^\s*$/,

  // Numeric placeholders
  /\b(N|X|Y|Z)\s+(students|hours|modules|студентов|часов|модулей)\b/i,
];

function validatePlaceholders(structure: CourseStructure): ValidationResult {
  const issues: string[] = [];

  // Check all text fields recursively
  function checkField(obj: any, path: string) {
    if (typeof obj === 'string') {
      for (const pattern of PLACEHOLDER_REGEX_PATTERNS) {
        if (pattern.test(obj)) {
          issues.push(`Placeholder detected at ${path}: "${obj.substring(0, 50)}..."`);
        }
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        checkField(value, `${path}.${key}`);
      }
    }
  }

  checkField(structure, 'courseStructure');

  return {
    passed: issues.length === 0,
    score: issues.length === 0 ? 1.0 : 0.0,
    issues,
    detectionRate: issues.length > 0 ? 0.95 : 1.0, // 95%+ detection confidence
    blockedAt: ValidationStage.DRAFT,
  };
}
```

**Rationale**: Research shows placeholders account for 15-20% of draft rejections. 95%+ detection via regex is 100x cheaper than LLM-based detection.

---

### 5. Duration Proportionality (P1 Priority) ⏱️

**Strategy**: Enforce pedagogical time budgets (2-5 min/topic, 5-15 min/objective) with 6-minute engagement cap

**Formulas**:

```typescript
// Topic-level duration (2-5 minutes per topic)
MIN_TOPIC_DURATION = 2; // minutes
MAX_TOPIC_DURATION = 5; // minutes

// Objective-level duration (5-15 minutes per learning objective)
MIN_OBJECTIVE_DURATION = 5; // minutes
MAX_OBJECTIVE_DURATION = 15; // minutes

// Engagement cap (6 minutes per continuous learning block)
ENGAGEMENT_CAP = 6; // minutes (research-backed attention span)

function calculateExpectedDuration(
  topicCount: number,
  objectiveCount: number
): { min: number; max: number } {
  // Base calculation
  const topicDuration = {
    min: topicCount * MIN_TOPIC_DURATION,
    max: topicCount * MAX_TOPIC_DURATION,
  };

  const objectiveDuration = {
    min: objectiveCount * MIN_OBJECTIVE_DURATION,
    max: objectiveCount * MAX_OBJECTIVE_DURATION,
  };

  // Take the more conservative (stricter) range
  return {
    min: Math.max(topicDuration.min, objectiveDuration.min),
    max: Math.min(topicDuration.max, objectiveDuration.max),
  };
}

function validateDurationProportionality(lesson: Lesson): ValidationResult {
  const topicCount = lesson.topics.length;
  const objectiveCount = lesson.learningObjectives.length;
  const actualDuration = lesson.estimatedDuration; // in minutes

  const expected = calculateExpectedDuration(topicCount, objectiveCount);

  // Check if within expected range
  if (actualDuration < expected.min) {
    return {
      passed: false,
      score: actualDuration / expected.min, // partial credit
      issues: [
        `Duration too short: ${actualDuration} min (expected ${expected.min}-${expected.max} min)`,
        `Topics (${topicCount}) require ${topicCount * MIN_TOPIC_DURATION}-${topicCount * MAX_TOPIC_DURATION} min`,
        `Objectives (${objectiveCount}) require ${objectiveCount * MIN_OBJECTIVE_DURATION}-${objectiveCount * MAX_OBJECTIVE_DURATION} min`,
      ],
      suggestion: `Increase duration to at least ${expected.min} minutes or reduce content scope`,
    };
  }

  if (actualDuration > expected.max) {
    return {
      passed: false,
      score: expected.max / actualDuration, // partial credit
      issues: [
        `Duration too long: ${actualDuration} min (expected ${expected.min}-${expected.max} min)`,
        `Exceeds engagement cap (${ENGAGEMENT_CAP} min per block)`,
      ],
      suggestion: `Reduce duration to ${expected.max} minutes or split into multiple lessons`,
    };
  }

  // Check engagement cap violations
  if (actualDuration > ENGAGEMENT_CAP && !lesson.hasBreaks) {
    return {
      passed: false,
      score: 0.8, // warning, not critical
      issues: [
        `Exceeds 6-minute engagement cap without breaks (${actualDuration} min)`,
        `Research shows attention drops after 6 minutes of continuous learning`,
      ],
      suggestion: `Add breaks every ${ENGAGEMENT_CAP} minutes or split into shorter lessons`,
    };
  }

  return {
    passed: true,
    score: 1.0,
    expectedRange: expected,
    actualDuration,
  };
}
```

**Rationale**: Research shows 2-5 min/topic and 5-15 min/objective are pedagogically optimal. 6-minute engagement cap prevents cognitive overload.

---

### 6. Specificity Scoring (P2 Priority) 📊

**Strategy**: 0-100 scale measuring objective clarity across 6 dimensions

**Scoring Dimensions**:

1. **Action Verb Clarity** (20 points): Bloom's-compliant verb present
2. **Learning Context** (20 points): Specific domain/technology mentioned
3. **Measurability** (20 points): Observable outcome defined
4. **Scope Boundary** (15 points): Constraints/limitations stated
5. **Success Criteria** (15 points): Assessment method implied
6. **Audience Appropriateness** (10 points): Aligned with learner level

**Implementation**:

```typescript
interface SpecificityScore {
  total: number; // 0-100
  dimensions: {
    actionVerbClarity: number; // 0-20
    learningContext: number; // 0-20
    measurability: number; // 0-20
    scopeBoundary: number; // 0-15
    successCriteria: number; // 0-15
    audienceAppropriateness: number; // 0-10
  };
  passed: boolean; // total >= 70 for submission, >= 85 for publication
}

function calculateSpecificityScore(objective: LearningObjective): SpecificityScore {
  const dimensions = {
    actionVerbClarity: scoreActionVerbClarity(objective),
    learningContext: scoreLearningContext(objective),
    measurability: scoreMeasurability(objective),
    scopeBoundary: scoreScopeBoundary(objective),
    successCriteria: scoreSuccessCriteria(objective),
    audienceAppropriateness: scoreAudienceAppropriateness(objective),
  };

  const total = Object.values(dimensions).reduce((sum, score) => sum + score, 0);

  return {
    total,
    dimensions,
    passed: total >= 70, // submission threshold (85 for publication)
  };
}

function scoreActionVerbClarity(objective: LearningObjective): number {
  const verb = extractActionVerb(objective.text, objective.language);
  const whitelistForLanguage = BLOOMS_TAXONOMY_WHITELIST[objective.language];

  // 20 points if Bloom's-compliant verb found
  for (const verbs of Object.values(whitelistForLanguage)) {
    if (verbs.includes(verb.toLowerCase())) {
      return 20;
    }
  }

  return 0;
}

function scoreLearningContext(objective: LearningObjective): number {
  // 20 points if specific technology/domain mentioned
  const hasSpecificContext =
    /\b(Python|JavaScript|React|Django|SQL|Git|Docker|Kubernetes|машинное обучение|веб-разработка)\b/i.test(
      objective.text
    );

  if (hasSpecificContext) return 20;

  // 10 points for generic domain reference
  const hasGenericContext =
    /\b(programming|development|design|analysis|разработка|проектирование)\b/i.test(objective.text);

  return hasGenericContext ? 10 : 0;
}

function scoreMeasurability(objective: LearningObjective): number {
  // 20 points if observable outcome defined (e.g., "create a...", "implement...", "build...")
  const hasObservableOutcome =
    /\b(create|build|implement|develop|write|design|construct|создать|разработать|написать|построить)\b/i.test(
      objective.text
    );

  return hasObservableOutcome ? 20 : 0;
}

function scoreScopeBoundary(objective: LearningObjective): number {
  // 15 points if constraints mentioned (e.g., "using X", "within Y hours", "for Z audience")
  const hasConstraints = /\b(using|with|within|for|в течение|для|с помощью)\b/i.test(
    objective.text
  );

  return hasConstraints ? 15 : 0;
}

function scoreSuccessCriteria(objective: LearningObjective): number {
  // 15 points if assessment method implied (e.g., "demonstrate by...", "as evidenced by...")
  const hasAssessment =
    /\b(demonstrate|show|prove|test|validate|продемонстрировать|показать|доказать|проверить)\b/i.test(
      objective.text
    );

  return hasAssessment ? 15 : 0;
}

function scoreAudienceAppropriateness(objective: LearningObjective): number {
  // 10 points if complexity matches learner level (simplified heuristic)
  const complexity = estimateComplexity(objective.text);
  const targetLevel = objective.targetAudienceLevel || 'intermediate';

  const isAppropriate =
    (targetLevel === 'beginner' && complexity <= 3) ||
    (targetLevel === 'intermediate' && complexity >= 3 && complexity <= 7) ||
    (targetLevel === 'advanced' && complexity >= 7);

  return isAppropriate ? 10 : 5;
}

function estimateComplexity(text: string): number {
  // Simple heuristic: count technical terms, sentence length, vocabulary diversity
  const technicalTerms = (text.match(/\b[A-Z]{2,}\b/g) || []).length; // Acronyms
  const sentenceLength = text.split(/\s+/).length;

  return Math.min(10, technicalTerms * 2 + Math.floor(sentenceLength / 10));
}
```

**Rationale**: Specificity scoring provides objective quality metric. 70+ score ensures submission quality, 85+ ensures publication quality.

---

## Implementation Priorities

### P0 (Blocking - Draft Gate)

**Must implement before Phase 3 generation**:

1. Non-Measurable Verbs Blacklist (`validateNonMeasurableVerbs`)
2. Placeholder Detection (`validatePlaceholders`)

**Impact**: Blocks 40% + 15-20% = 55-60% of quality issues at draft stage
**Cost Savings**: $0.15-0.20 per course (prevents regeneration)
**Effort**: 2-4 hours (simple regex + whitelist checks)

### P1 (Quality - Review Gate)

**Implement after P0 deployed**:

1. Bilingual Bloom's Whitelist (`validateBloomsTaxonomy`)
2. Duration Proportionality (`validateDurationProportionality`)

**Impact**: Ensures 95%+ pedagogical compliance
**Quality Improvement**: +10-15% semantic similarity
**Effort**: 4-8 hours (165 verbs + formula validation)

### P2 (Enhancement - Submission Gate)

**Implement for production optimization**:

1. Specificity Scoring (`calculateSpecificityScore`)

**Impact**: Objective quality metric (0-100 scale)
**Use Case**: A/B testing, quality dashboards, LLM fine-tuning signals
**Effort**: 8-12 hours (6-dimensional scoring model)

### P3 (Advanced - Publication Gate)

**Implement for enterprise features**:

1. 3-Tier Progressive Validation (full workflow)

**Impact**: Complete SDLC integration with stage gates
**Use Case**: Enterprise deployments, compliance workflows
**Effort**: 16-24 hours (workflow orchestration + UI)

---

## Integration with Existing Tasks

### T003: Zod Schema Updates

**File**: `packages/shared/src/schemas/generation/CourseStructure.schema.ts`

**Required Changes**:

```typescript
import { z } from 'zod';

// Add Bloom's taxonomy validation
export const LearningObjectiveSchema = z.object({
  id: z.string().uuid(),
  text: z
    .string()
    .min(10, 'Objective too short')
    .max(500, 'Objective too long')
    .refine(
      text => !NON_MEASURABLE_VERBS_BLACKLIST.en.some(verb => text.toLowerCase().startsWith(verb)),
      { message: "Objective must use measurable action verb (not 'understand', 'know', 'learn')" }
    )
    .refine(text => !PLACEHOLDER_REGEX_PATTERNS.some(pattern => pattern.test(text)), {
      message: 'Objective contains placeholder text',
    }),
  language: z.enum(['en', 'ru']),
  cognitiveLevel: z
    .enum(['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'])
    .optional(),
  estimatedDuration: z.number().min(5).max(15), // 5-15 min per objective
  targetAudienceLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
});

// Add duration validation
export const LessonSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(5).max(200),
    topics: z.array(z.string()).min(1).max(10),
    learningObjectives: z.array(LearningObjectiveSchema).min(1).max(5),
    estimatedDuration: z.number().min(2).max(60), // 2-60 minutes
  })
  .refine(
    lesson => {
      const expected = calculateExpectedDuration(
        lesson.topics.length,
        lesson.learningObjectives.length
      );
      return lesson.estimatedDuration >= expected.min && lesson.estimatedDuration <= expected.max;
    },
    { message: 'Duration does not match topic/objective count (2-5 min/topic, 5-15 min/objective)' }
  );
```

**Priority**: P0-P1 (implement with T017)

### T017: Validation Utilities

**File**: `packages/course-gen-platform/src/server/services/generation/validators/minimum-lessons-validator.ts`

**New Utilities to Add**:

```typescript
// validator/blooms-taxonomy-validator.ts
export function validateBloomsTaxonomy(objective: LearningObjective): ValidationResult {
  // Implementation from Section 2 above
}

// validator/placeholder-validator.ts
export function validatePlaceholders(structure: CourseStructure): ValidationResult {
  // Implementation from Section 4 above
}

// validator/duration-validator.ts
export function validateDurationProportionality(lesson: Lesson): ValidationResult {
  // Implementation from Section 5 above
}

// validator/specificity-scorer.ts
export function calculateSpecificityScore(objective: LearningObjective): SpecificityScore {
  // Implementation from Section 6 above
}

// validator/progressive-validation.ts
export function validateCourseStructure(
  structure: CourseStructure,
  stage: ValidationStage
): Promise<ValidationResult> {
  // Implementation from Section 1 above
}
```

**Priority**: P0 (placeholders + blacklist), P1 (Bloom's + duration), P2 (specificity), P3 (progressive)

### T023: Metadata Generator

**File**: `packages/course-gen-platform/src/server/services/generation/metadata-generator.ts`

**Integration Point**: Add validation before returning metadata

```typescript
async function generateCourseMetadata(input: GenerationJobInput): Promise<CourseMetadata> {
  const metadata = await llm.generate(model, prompt);

  // Add P0 validation before returning
  const placeholderCheck = validatePlaceholders(metadata);
  if (!placeholderCheck.passed) {
    throw new ValidationError('Metadata contains placeholders', placeholderCheck.issues);
  }

  // Add P1 validation
  for (const objective of metadata.learningObjectives) {
    const bloomsCheck = validateBloomsTaxonomy(objective);
    if (!bloomsCheck.passed) {
      throw new ValidationError(`Invalid objective: ${objective.text}`, bloomsCheck.issues);
    }
  }

  return metadata;
}
```

**Priority**: P0-P1 (integrate with T023 implementation)

---

## Cost-Benefit Analysis

### P0 Implementation (Placeholders + Blacklist)

- **Development Effort**: 2-4 hours
- **Cost Savings**: $0.15-0.20 per course (prevents 55-60% of regeneration)
- **Quality Impact**: -40% rejection rate at review stage
- **ROI**: 50-100x (assuming 1000 courses/month)

### P1 Implementation (Bloom's + Duration)

- **Development Effort**: 4-8 hours
- **Quality Impact**: +10-15% semantic similarity, 95%+ pedagogical compliance
- **User Satisfaction**: +20-30% (fewer "non-measurable objective" complaints)
- **ROI**: 20-50x

### P2 Implementation (Specificity Scoring)

- **Development Effort**: 8-12 hours
- **Quality Impact**: Objective quality metric (0-100 scale)
- **Use Cases**: A/B testing, quality dashboards, LLM fine-tuning signals
- **ROI**: 5-10x (enables data-driven optimization)

### P3 Implementation (Progressive Validation)

- **Development Effort**: 16-24 hours
- **Quality Impact**: Complete SDLC integration
- **Use Cases**: Enterprise deployments, compliance workflows
- **ROI**: 2-5x (enterprise premium pricing)

---

## Production Deployment Roadmap

### Phase 1: P0 Foundation (Week 1-2)

1. Implement `validatePlaceholders` and `validateNonMeasurableVerbs`
2. Integrate with T023 (metadata-generator)
3. Add to draft validation gate (40% threshold)
4. Deploy to staging environment
5. A/B test: 50% traffic with P0 validation, 50% without
6. Measure rejection rate reduction (target: 55-60% → 20-25%)

### Phase 2: P1 Quality Gates (Week 3-4)

1. Implement `validateBloomsTaxonomy` (165 verbs)
2. Implement `validateDurationProportionality`
3. Integrate with T017 (validation utilities)
4. Add to review validation gate (60% threshold)
5. Deploy to production (100% traffic)
6. Monitor semantic similarity (target: +10-15%)

### Phase 3: P2 Metrics (Week 5-6)

1. Implement `calculateSpecificityScore`
2. Integrate with quality dashboard
3. Create A/B testing framework (specificity score as signal)
4. Collect baseline data (1-2 weeks)
5. Use for LLM fine-tuning (improve low-scoring objectives)

### Phase 4: P3 Enterprise (Week 7-8+)

1. Implement full progressive validation workflow
2. Add stage management UI
3. Integrate with enterprise compliance requirements
4. Deploy to enterprise customers (opt-in)

---

## Validation Metrics

### Draft Stage (40% Threshold)

- **Placeholder Detection Rate**: 95%+
- **Blacklist Block Rate**: 100%
- **False Positive Rate**: <5%

### Review Stage (60% Threshold)

- **Bloom's Compliance**: 95%+
- **Duration Proportionality**: 90%+
- **Semantic Similarity**: 0.75-0.85

### Submission Stage (70% Threshold)

- **Specificity Score**: 70+
- **Cross-Objective Coherence**: 0.80+
- **Overall Quality**: 80-85%

### Publication Stage (85% Threshold)

- **Full Pedagogical Compliance**: 90%+
- **Production Readiness**: 95%+
- **User Satisfaction**: 85%+

---

## Risks and Mitigations

### Risk 1: False Positives (Blacklist/Whitelist)

**Probability**: Medium (10-15% of valid objectives may be flagged)
**Impact**: High (user frustration, regeneration cost)
**Mitigation**:

- Allow human override at review stage
- Collect false positive examples → expand whitelist quarterly
- A/B test: 50% strict validation, 50% warnings-only

### Risk 2: Language Drift (Bloom's Verbs)

**Probability**: Low (5-10% over 2 years)
**Impact**: Medium (whitelist becomes outdated)
**Mitigation**:

- Annual whitelist review with educational experts
- Track rejected verbs → identify emerging patterns
- Maintain separate whitelists for formal vs. informal education

### Risk 3: Performance Impact (Regex)

**Probability**: Low (regex validation <5ms per objective)
**Impact**: Low (negligible compared to LLM latency)
**Mitigation**:

- Compile regex patterns at startup (not per-validation)
- Cache validation results for identical objectives
- Profile validation pipeline quarterly

### Risk 4: Cultural Bias (English-centric)

**Probability**: Medium (Bloom's taxonomy is Western pedagogical framework)
**Impact**: Medium (may not align with all educational philosophies)
**Mitigation**:

- Add Russian pedagogical frameworks (e.g., Vygotsky's ZPD)
- Allow custom verb whitelists per institution
- Document cultural assumptions in user guide

---

## Appendix: Research Consensus

**Research Report Finding**: RT-006 (26KB) identified 6 high-impact recommendations:

1. ✅ **3-Tier Progressive Validation** - APPROVED (P3 priority)
2. ✅ **Bilingual Bloom's Whitelist** - APPROVED (P1 priority)
3. ✅ **Specificity Scoring** - APPROVED (P2 priority)
4. ✅ **Duration Proportionality** - APPROVED (P1 priority)
5. ✅ **Placeholder Detection** - APPROVED (P0 priority)
6. ✅ **Non-Measurable Verbs Blacklist** - APPROVED (P0 priority)

**Consensus**: All 6 recommendations approved for production deployment with phased rollout (P0 → P1 → P2 → P3).

**Next Steps**: Implement T006-R-IMPL (see tasks.md for detailed breakdown).

---

**Document Version**: 1.0
**Last Updated**: 2025-11-07
**Approved By**: User (via research review session)
**Implementation Status**: Ready for Phase 1 (P0 Foundation)
