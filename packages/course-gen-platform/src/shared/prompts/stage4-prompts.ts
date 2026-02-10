/**
 * Stage 4 Hardcoded Prompts - Educational Analysis (4 prompts)
 * @module shared/prompts/stage4-prompts
 *
 * Stage 4: Educational Analysis - Multi-phase course analysis
 * - Phase 1: Classification (category, language, topics)
 * - Phase 2: Scope (hours, lessons, sections)
 * - Phase 3: Expert (pedagogical strategy, expansion areas)
 * - Phase 4: Synthesis (generation guidance)
 */

import type { HardcodedPrompt } from './types.js';

// ============================================================================
// STAGE 4 PROMPTS (4 total)
// ============================================================================

export const stage4Prompts: HardcodedPrompt[] = [
  {
    stage: 'stage_4',
    promptKey: 'stage4_phase1_classification',
    promptName: 'Stage 4 Phase 1 - Course Classification',
    promptDescription:
      'Performs course categorization (6 categories), contextual language generation, and topic analysis. Always outputs in target course language.',
    promptTemplate: `You are an expert curriculum architect with 15+ years of experience in adult education (andragogy).

Your task is to analyze course topics and classify them into one of 6 categories, generate contextual motivational language, and perform topic analysis.

CRITICAL RULES:
1. ALL output MUST be in {{outputLanguage}} (the course target language is {{outputLanguage}})
2. You MUST respond with valid JSON matching the Phase1Output schema
3. Use category-specific templates for contextual language
4. Ensure all character length constraints are met
5. Extract 3-10 key concepts and 5-15 domain keywords

CATEGORIES (with examples):
- professional: Business skills, technical training, certifications (e.g., "Project Management", "Python Programming")
- personal: Self-help, life skills, wellness (e.g., "Time Management", "Healthy Cooking")
- creative: Art, music, design, writing (e.g., "Digital Art", "Creative Writing")
- hobby: Leisure activities, crafts, games (e.g., "Chess", "Photography")
- spiritual: Meditation, mindfulness, philosophy (e.g., "Mindfulness", "Stoic Philosophy")
- academic: Formal education subjects (e.g., "Calculus", "World History")

TOPIC: {{topic}}
TARGET LANGUAGE FOR COURSE: {{outputLanguage}} (ALL text content MUST be in {{outputLanguage}})
{{userRequirements}}{{documentContext}}

Analyze this topic and provide comprehensive classification and topic analysis.`,
    variables: [
      {
        name: 'outputLanguage',
        description: 'Target language for course content (English, Russian, etc.)',
        required: true,
        example: 'Russian',
      },
      {
        name: 'topic',
        description: 'Course topic to analyze',
        required: true,
        example: 'React Hooks fundamentals',
      },
      {
        name: 'documentContext',
        description: 'Optional document summaries context',
        required: false,
        example: '\n\nDOCUMENT SUMMARIES:\n[Document 1]\n...',
      },
    ],
  },
  {
    stage: 'stage_4',
    promptKey: 'stage4_phase2_scope',
    promptName: 'Stage 4 Phase 2 - Scope Analysis',
    promptDescription:
      'Estimates course scope: total content hours (0.5-200h), lesson count (minimum 10), sections breakdown (1-30 sections).',
    promptTemplate: `You are a curriculum scope analyst with expertise in estimating course structure.

Your task is to analyze the course topic and classify output to estimate:
1. Total content hours (0.5-200h)
2. Lesson count (MINIMUM 10 lessons enforced)
3. Sections breakdown (1-30 sections)

CRITICAL RULES:
1. ALL output MUST be in {{outputLanguage}}
2. You MUST respond with valid JSON matching the Phase2Output schema
3. Ensure minimum 10 lessons constraint (FR-015)
4. Each lesson is {{lessonDurationMinutes}} minutes

CONTEXT FROM PHASE 1:
Topic: {{topic}}
Category: {{category}}
Complexity: {{complexity}}
Target Audience: {{targetAudience}}
Information Completeness: {{informationCompleteness}}%

{{userRequirements}}{{documentContext}}

Estimate the course scope and generate detailed structure recommendations.`,
    variables: [
      {
        name: 'outputLanguage',
        description: 'Target language for course content',
        required: true,
        example: 'Russian',
      },
      {
        name: 'lessonDurationMinutes',
        description: 'Duration of each lesson in minutes',
        required: true,
        example: '15',
      },
      {
        name: 'topic',
        description: 'Course topic',
        required: true,
        example: 'React Hooks fundamentals',
      },
      {
        name: 'category',
        description: 'Course category from Phase 1',
        required: true,
        example: 'professional',
      },
      {
        name: 'complexity',
        description: 'Course complexity from Phase 1',
        required: true,
        example: 'intermediate',
      },
      {
        name: 'targetAudience',
        description: 'Target audience from Phase 1',
        required: true,
        example: 'intermediate',
      },
      {
        name: 'informationCompleteness',
        description: 'Information completeness percentage from Phase 1',
        required: true,
        example: '85',
      },
      {
        name: 'userRequirements',
        description: 'Optional user requirements',
        required: false,
      },
      {
        name: 'documentContext',
        description: 'Optional document summaries',
        required: false,
      },
    ],
  },
  {
    stage: 'stage_4',
    promptKey: 'stage4_phase3_expert',
    promptName: 'Stage 4 Phase 3 - Deep Expert Analysis',
    promptDescription:
      'Designs pedagogical strategy (teaching style, assessment, progression), identifies expansion areas, detects research flags. Always uses 120B model.',
    promptTemplate: `You are a senior curriculum architect with 20+ years of experience in adult education (andragogy) and instructional design.

CRITICAL RULES:
1. ALL your response MUST be in {{outputLanguage}}
2. You MUST respond with valid JSON matching the Phase3Output schema

CONTEXT FROM PREVIOUS PHASES:
TOPIC: {{topic}}
TARGET LANGUAGE: {{outputLanguage}}

CATEGORY: {{category}} (confidence: {{categoryConfidence}})
COMPLEXITY: {{complexity}}
INFORMATION COMPLETENESS: {{informationCompleteness}}%
TARGET AUDIENCE: {{targetAudience}}

SCOPE:
- Total lessons: {{totalLessons}}
- Estimated hours: {{estimatedHours}}h
- Lesson duration: {{lessonDurationMinutes}} minutes
- Total sections: {{totalSections}}

{{userRequirements}}{{documentContext}}

===== YOUR TASKS =====

TASK 1: DESIGN PEDAGOGICAL STRATEGY

Design a comprehensive pedagogical strategy:
1. assessment_approach: Describe how learners demonstrate understanding (min 50 chars)
2. progression_logic: Explain how difficulty increases across lessons (min 100 chars)

TASK 2: IDENTIFY EXPANSION AREAS (if information_completeness < 80%)

If information is incomplete, identify areas that need expansion:
- area: Topic area name
- priority: critical, important, or nice-to-have
- specific_requirements: List of specific requirements
- estimated_lessons: Number of lessons needed`,
    variables: [
      {
        name: 'outputLanguage',
        description: 'Target language for course content',
        required: true,
        example: 'Russian',
      },
      {
        name: 'topic',
        description: 'Course topic',
        required: true,
      },
      {
        name: 'category',
        description: 'Course category from Phase 1',
        required: true,
      },
      {
        name: 'categoryConfidence',
        description: 'Category confidence score',
        required: true,
      },
      {
        name: 'complexity',
        description: 'Course complexity',
        required: true,
      },
      {
        name: 'informationCompleteness',
        description: 'Information completeness percentage',
        required: true,
      },
      {
        name: 'targetAudience',
        description: 'Target audience level',
        required: true,
      },
      {
        name: 'totalLessons',
        description: 'Total number of lessons from Phase 2',
        required: true,
      },
      {
        name: 'estimatedHours',
        description: 'Estimated content hours from Phase 2',
        required: true,
      },
      {
        name: 'lessonDurationMinutes',
        description: 'Lesson duration in minutes',
        required: true,
      },
      {
        name: 'totalSections',
        description: 'Total number of sections from Phase 2',
        required: true,
      },
      {
        name: 'userRequirements',
        description: 'Optional user requirements',
        required: false,
      },
      {
        name: 'documentContext',
        description: 'Optional document summaries',
        required: false,
      },
    ],
  },
  {
    stage: 'stage_4',
    promptKey: 'stage4_phase4_synthesis',
    promptName: 'Stage 4 Phase 4 - Document Synthesis',
    promptDescription:
      'Synthesizes all analysis phases into clear generation instructions for Stage 5. Adaptive model: <3 docs → 20B, ≥3 docs → 120B.',
    promptTemplate: `You are a curriculum synthesis expert. Your task is to combine all analysis phases and document summaries into clear generation instructions.

CRITICAL RULES:
1. ALL output MUST be in {{outputLanguage}}
2. generation_guidance: Structured guidance for Stage 5 Generation (tone, analogies, exercises)

CONTEXT:
Topic: {{topic}}
Documents: {{documentCount}} documents
{{phase1Summary}}
{{phase2Summary}}
{{phase3Summary}}
{{documentSummaries}}

Synthesize all information into generation_guidance: structured guidance for content generation (tone, analogies, exercises, visuals)`,
    variables: [
      {
        name: 'outputLanguage',
        description: 'Target language for course content',
        required: true,
      },
      {
        name: 'topic',
        description: 'Course topic',
        required: true,
      },
      {
        name: 'documentCount',
        description: 'Number of documents analyzed',
        required: true,
      },
      {
        name: 'phase1Summary',
        description: 'Summary of Phase 1 classification results',
        required: true,
      },
      {
        name: 'phase2Summary',
        description: 'Summary of Phase 2 scope analysis',
        required: true,
      },
      {
        name: 'phase3Summary',
        description: 'Summary of Phase 3 expert analysis',
        required: true,
      },
      {
        name: 'documentSummaries',
        description: 'Formatted document summaries',
        required: false,
      },
    ],
  },
];
