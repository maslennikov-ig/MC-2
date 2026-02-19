/**
 * Prompt Variable Contracts - Compile-time type safety for PromptService
 * @module shared/prompts/prompt-contracts
 *
 * Maps each active prompt key to its expected variables interface.
 * Used by renderPrompt<K>() to enforce correct variables at compile time.
 *
 * When adding a new prompt that uses renderPrompt(), add its key and
 * variable interface here to get type checking.
 */

// ============================================================================
// STAGE 3: Classification
// ============================================================================

export interface Stage3ClassificationComparativeVars {
  maxImportant: string;
  totalDocuments: string;
  courseTitle: string;
  courseDescription: string;
  documentDescriptions: string;
}

export interface Stage3ClassificationIndependentVars {
  courseTitle: string;
  courseDescription: string;
  filename: string;
  mimeType: string;
  fileSize: string;
  contentPreview: string;
}

// ============================================================================
// STAGE 4: Analysis
// ============================================================================

export interface Stage4Phase1ClassificationSystemVars {
  outputLanguage: string;
  outputLanguageUpper: string;
  schemaDescription: string;
}

export interface Stage4Phase1ClassificationUserVars {
  topic: string;
  outputLanguage: string;
  outputLanguageUpper: string;
  targetAudience: string;
  lessonDurationMinutes: string;
  courseDescriptionContext: string;
  documentContext: string;
  clarifyingContext: string;
}

export interface Stage4Phase2ScopeSystemVars {
  outputLanguage: string;
  outputLanguageUpper: string;
  schemaDescription: string;
  minLessonsRule: string;
}

export interface Stage4Phase2ScopeUserVars {
  topic: string;
  outputLanguageUpper: string;
  category: string;
  complexity: string;
  targetAudience: string;
  keyConcepts: string;
  overlapFeedbackSection: string;
  courseDescriptionContext: string;
  learningOutcomesContext: string;
  documentsContext: string;
  clarifyingContext: string;
  sizeSection: string;
  sizeConstraintNote: string;
  sectionsRange: string;
  sectionsSuffix: string;
  sizeSpecificNotes: string;
  targetSectionsHint: string;
}

export interface Stage4Phase3ExpertVars {
  outputLanguage: string;
  outputLanguageUpper: string;
  schemaDescription: string;
  topic: string;
  category: string;
  categoryConfidence: string;
  complexity: string;
  informationCompleteness: string;
  targetAudience: string;
  totalLessons: string;
  estimatedHours: string;
  lessonDurationMinutes: string;
  totalSections: string;
  documentContext: string;
  clarifyingContext: string;
}

export interface Stage4Phase4SynthesisSystemVars {
  [key: string]: never;
}

export interface Stage4Phase4SynthesisUserVars {
  outputLanguage: string;
  outputLanguageUpper: string;
  schemaDescription: string;
  topic: string;
  language: string;
  category: string;
  totalLessons: string;
  totalSections: string;
  documentCount: string;
  researchFlagsSection: string;
  phase1KeyConcepts: string;
  phase2SectionsBreakdown: string;
  phase3ProgressionLogic: string;
  documentSummariesSection: string;
  clarifyingContext: string;
}

// ============================================================================
// STAGE 5: Structure Generation
// ============================================================================

export interface Stage5BatchSectionGeneratorVars {
  courseTitle: string;
  language: string;
  stylePrompt: string;
  style: string;
  targetAudienceLine: string;
  userContext: string;
  courseStructureMapSection: string;
  previousSectionsDigestSection: string;
  sectionNumber: string;
  sectionTitle: string;
  learningObjectives: string;
  keyTopics: string;
  estimatedLessons: string;
  analysisContext: string;
  constraintsSection: string;
  schemaDescription: string;
  lessonGuidance: string;
  ragToolInfo: string;
  outputFormat: string;
}

// ============================================================================
// STAGE 6: Lesson Content
// ============================================================================

export interface Stage6SerialGeneratorVars {
  lessonTitle: string;
  targetAudience: string;
  tone: string;
  difficulty: string;
  sectionTitle: string;
  contentArchetype: string;
  depth: string;
  depthGuidance: string;
  keyPoints: string;
  requiredKeywords: string;
  prohibitedTerms: string;
  outputLanguage: string;
  ragContext: string;
  previousContext: string;
  interLessonContext: string;
  stylePrompt: string;
}

export interface Stage6SingleCallGeneratorVars {
  lessonTitle: string;
  lessonDescription: string;
  durationMinutes: string;
  targetWordCount: string;
  targetAudience: string;
  tone: string;
  difficulty: string;
  learningObjectives: string;
  sectionsList: string;
  hookStrategy: string;
  hookTopic: string;
  ragContext: string;
  interLessonContext: string;
  generationGuidance: string;
  stylePrompt: string;
  outputLanguage: string;
  introductionHeader: string;
  exercisesHeader: string;
  exerciseLabel: string;
  taskLabel: string;
  scenarioLabel: string;
  yourAnswerLabel: string;
  hintLabel: string;
  sampleAnswerLabel: string;
  digestHeader: string;
  sectionsWordBudget: string;
}

// ============================================================================
// STAGE 7: Enrichments
// ============================================================================

export interface Stage7CardCourseVars {
  courseTitle: string;
  courseTopic: string;
  languageContext: string;
  colorScheme: string;
  aesthetic: string;
  visualElements: string;
  mood: string;
}

export interface Stage7CardLessonVars {
  lessonTitle: string;
  objectivesSummary: string;
  courseTitle: string;
  courseTopic: string;
  colorScheme: string;
  aesthetic: string;
  visualElements: string;
  mood: string;
}

export interface Stage7CoverUserVars {
  lessonTitle: string;
  courseSubject: string;
  keywords: string;
  languageContext: string;
  styleHint: string;
  colorScheme: string;
  aesthetic: string;
  visualElements: string;
  mood: string;
}

// ============================================================================
// PROMPT VARIABLE MAP — Central type registry
// ============================================================================

/**
 * Maps each active prompt key to its expected variables type.
 *
 * To add a new prompt:
 * 1. Define its variables interface above
 * 2. Add the mapping here
 * 3. TypeScript will enforce correct variables at all callsites
 */
export interface PromptVariableMap {
  stage3_classification_comparative: Stage3ClassificationComparativeVars;
  stage3_classification_independent: Stage3ClassificationIndependentVars;
  stage4_phase1_classification_system: Stage4Phase1ClassificationSystemVars;
  stage4_phase1_classification_user: Stage4Phase1ClassificationUserVars;
  stage4_phase2_scope_system: Stage4Phase2ScopeSystemVars;
  stage4_phase2_scope_user: Stage4Phase2ScopeUserVars;
  stage4_phase3_expert: Stage4Phase3ExpertVars;
  stage4_phase4_synthesis_system: Stage4Phase4SynthesisSystemVars;
  stage4_phase4_synthesis_user: Stage4Phase4SynthesisUserVars;
  stage5_batch_section_generator: Stage5BatchSectionGeneratorVars;
  stage6_serial_generator: Stage6SerialGeneratorVars;
  stage6_single_call_generator: Stage6SingleCallGeneratorVars;
  stage7_card_course: Stage7CardCourseVars;
  stage7_card_lesson: Stage7CardLessonVars;
  stage7_cover_user: Stage7CoverUserVars;
}

/**
 * Union type of all typed prompt keys
 */
export type PromptKey = keyof PromptVariableMap;
