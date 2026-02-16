/**
 * Prompt Contract Validation Tests
 * @module tests/unit/shared/prompts/prompt-contract-validation
 *
 * Validates that prompt contracts match actual prompt templates, ensuring
 * compile-time type safety between PromptVariableMap and PROMPT_REGISTRY.
 *
 * ## What This Test Suite Validates
 *
 * 1. **No Unresolved Placeholders** (20 prompts)
 *    - Renders each prompt with mock variables from metadata
 *    - Checks for remaining {{placeholder}} patterns
 *    - Filters out whitelisted technical templates (Helm, Go, Jinja2)
 *    - Filters out Mustache control structures ({{#section}}, {{/section}})
 *
 * 2. **PromptVariableMap Coverage** (10 typed prompts)
 *    - Verifies each key in PromptVariableMap exists in PROMPT_REGISTRY
 *    - Ensures no orphaned TypeScript interfaces
 *
 * 3. **Variable Contract Validation** (10 typed prompts)
 *    - Compares TypeScript interface keys vs prompt metadata variables
 *    - Catches mismatches where interface doesn't match actual prompt
 *
 * ## Test Coverage
 *
 * - T041: Contract tests (prompt variable validation)
 * - FR-018: Prompt versioning system validation
 * - RT-008: Template whitelist validation
 *
 * ## Test Strategy
 *
 * This is a **contract test** that validates compile-time type safety guarantees.
 * It does NOT test runtime behavior (that's covered by integration tests).
 *
 * When adding a new prompt to PromptVariableMap:
 * 1. Add prompt to PROMPT_REGISTRY with metadata
 * 2. Add TypeScript interface in prompt-contracts.ts
 * 3. Add mapping to PromptVariableMap
 * 4. Add validation test in this file (copy existing pattern)
 * 5. Run tests to verify contract
 */

import { describe, it, expect } from 'vitest';
import { PROMPT_REGISTRY } from '@/shared/prompts/prompt-registry';
import type { PromptVariableMap } from '@/shared/prompts/prompt-contracts';
import { filterWhitelistedTemplates } from '@/shared/validation/template-whitelist';
import type { PromptVariable } from '@megacampus/shared-types';

// ============================================================================
// HELPER: Render template with mock variables
// ============================================================================

/**
 * Renders a prompt template with mock variable values.
 * Simple Mustache-style replacement: {{varName}} → mock value
 *
 * @param template - Prompt template string with {{placeholder}} patterns
 * @param variables - Variable metadata from PROMPT_REGISTRY
 * @returns Rendered template with all variables substituted
 */
function renderTemplateWithMockVars(template: string, variables: PromptVariable[]): string {
  let rendered = template;

  for (const variable of variables) {
    const placeholder = `{{${variable.name}}}`;
    const mockValue = `test_value_${variable.name}`;

    // Replace all occurrences of this placeholder
    rendered = rendered.split(placeholder).join(mockValue);
  }

  return rendered;
}

/**
 * Extracts remaining unresolved placeholders from rendered template.
 * Filters out whitelisted technical templates (Helm, Go, Jinja2, etc.)
 * and Mustache control structures ({{#section}}, {{/section}}).
 *
 * @param rendered - Rendered template text
 * @returns Array of unresolved {{ }} patterns (excluding whitelisted and Mustache controls)
 */
function extractUnresolvedPlaceholders(rendered: string): string[] {
  // Find all {{ }} patterns
  const allMatches = rendered.match(/\{\{[^}]+\}\}/g) || [];

  // Filter out:
  // 1. Mustache control structures: {{#section}}, {{/section}}, {{^section}}, {{>partial}}
  // 2. Whitelisted technical templates (Helm, Go, Jinja2)
  const nonControlMatches = allMatches.filter(match => !/^\{\{[#/^>]/.test(match));

  // Apply whitelist filtering
  return filterWhitelistedTemplates(nonControlMatches);
}

// ============================================================================
// HELPER: Extract TypeScript interface variable names
// ============================================================================

/**
 * Gets the keys from a TypeScript interface by creating a typed mock object.
 * This ensures type safety between PromptVariableMap and actual prompts.
 *
 * @param mockFactory - Factory function that creates a typed mock object
 * @returns Array of variable names (interface keys)
 *
 * @example
 * const vars = getInterfaceKeys((key) => ({
 *   courseTitle: key,
 *   targetAudience: key,
 * }));
 * // Returns: ['courseTitle', 'targetAudience']
 */
function getInterfaceKeys<T>(mockFactory: (key: string) => T): string[] {
  const MARKER = '__INTERFACE_KEY__';
  const mockObj = mockFactory(MARKER);
  return Object.keys(mockObj);
}

// ============================================================================
// TESTS: Template Rendering (No Unresolved Placeholders)
// ============================================================================

describe('Prompt Contract Validation', () => {
  describe('Template rendering — no unresolved placeholders', () => {
    // Get all prompts from registry
    const allPrompts = Array.from(PROMPT_REGISTRY.values());

    // Test each prompt individually
    for (const prompt of allPrompts) {
      it(`should render ${prompt.promptKey} without unresolved placeholders`, () => {
        // Render template with mock variables
        const rendered = renderTemplateWithMockVars(prompt.promptTemplate, prompt.variables);

        // Extract unresolved placeholders (excluding whitelisted technical templates)
        const unresolvedPlaceholders = extractUnresolvedPlaceholders(rendered);

        // Assert no unresolved placeholders remain
        if (unresolvedPlaceholders.length > 0) {
          throw new Error(
            `Found ${unresolvedPlaceholders.length} unresolved placeholder(s) in ${prompt.promptKey}:\n` +
              unresolvedPlaceholders.map(p => `  - ${p}`).join('\n') +
              '\n\nThese placeholders are not in the variables metadata and were not whitelisted as technical templates.'
          );
        }

        expect(unresolvedPlaceholders).toHaveLength(0);
      });
    }

    it('should have at least 20 prompts in registry (sanity check)', () => {
      // Ensure registry is populated
      expect(allPrompts.length).toBeGreaterThanOrEqual(20);
    });
  });

  // ============================================================================
  // TESTS: PromptVariableMap Coverage
  // ============================================================================

  describe('PromptVariableMap covers all active prompts', () => {
    const promptVariableMapKeys: Array<keyof PromptVariableMap> = [
      'stage3_classification_comparative',
      'stage3_classification_independent',
      'stage4_phase1_classification_system',
      'stage4_phase1_classification_user',
      'stage4_phase2_scope_system',
      'stage4_phase2_scope_user',
      'stage4_phase3_expert',
      'stage4_phase4_synthesis_system',
      'stage4_phase4_synthesis_user',
      'stage5_batch_section_generator',
      'stage6_serial_generator',
      'stage6_single_call_generator',
      'stage7_card_course',
      'stage7_card_lesson',
      'stage7_cover_user',
    ];

    for (const key of promptVariableMapKeys) {
      it(`should have ${key} in PROMPT_REGISTRY`, () => {
        const prompt = PROMPT_REGISTRY.get(key);

        expect(prompt).toBeDefined();
        expect(prompt?.promptKey).toBe(key);
      });
    }

    it('should have exactly 15 typed prompts in PromptVariableMap', () => {
      // Ensure all typed prompts are accounted for
      expect(promptVariableMapKeys).toHaveLength(15);
    });
  });

  // ============================================================================
  // TESTS: Required Variables Match TypeScript Interfaces
  // ============================================================================

  describe('PromptVariableMap required variables match metadata', () => {
    /**
     * Helper to validate that a prompt's required variables match its TypeScript interface.
     *
     * Strategy: Check ALL variables actually used in template (via placeholders),
     * not just those marked required=true. This catches variables that are
     * semantically required but incorrectly marked optional in metadata.
     *
     * @param promptKey - Prompt key in PROMPT_REGISTRY
     * @param interfaceKeys - Variable names from TypeScript interface
     */
    function validateRequiredVariables(promptKey: string, interfaceKeys: string[]): void {
      const prompt = PROMPT_REGISTRY.get(promptKey);

      if (!prompt) {
        throw new Error(`Prompt ${promptKey} not found in PROMPT_REGISTRY`);
      }

      // Extract all variable names actually used in template
      // This includes both required and optional variables
      const templateVarNames = prompt.variables.map(v => v.name);

      // Sort both arrays for comparison
      const sortedTemplateVars = [...templateVarNames].sort();
      const sortedInterface = [...interfaceKeys].sort();

      // Check if they match
      expect(sortedInterface).toEqual(sortedTemplateVars);
    }

    it('stage3_classification_comparative variables match interface', () => {
      const interfaceKeys = getInterfaceKeys(key => ({
        maxImportant: key,
        totalDocuments: key,
        courseTitle: key,
        courseDescription: key,
        documentDescriptions: key,
      }));

      validateRequiredVariables('stage3_classification_comparative', interfaceKeys);
    });

    it('stage3_classification_independent variables match interface', () => {
      const interfaceKeys = getInterfaceKeys(key => ({
        courseTitle: key,
        courseDescription: key,
        filename: key,
        mimeType: key,
        fileSize: key,
        contentPreview: key,
      }));

      validateRequiredVariables('stage3_classification_independent', interfaceKeys);
    });

    it('stage4_phase1_classification_system variables match interface', () => {
      const interfaceKeys = getInterfaceKeys(key => ({
        outputLanguage: key,
        outputLanguageUpper: key,
        schemaDescription: key,
      }));

      validateRequiredVariables('stage4_phase1_classification_system', interfaceKeys);
    });

    it('stage4_phase1_classification_user variables match interface', () => {
      const interfaceKeys = getInterfaceKeys(key => ({
        topic: key,
        outputLanguage: key,
        outputLanguageUpper: key,
        targetAudience: key,
        lessonDurationMinutes: key,
        courseDescriptionContext: key,
        documentContext: key,
        clarifyingContext: key,
      }));

      validateRequiredVariables('stage4_phase1_classification_user', interfaceKeys);
    });

    it('stage4_phase2_scope_system variables match interface', () => {
      const interfaceKeys = getInterfaceKeys(key => ({
        outputLanguage: key,
        outputLanguageUpper: key,
        schemaDescription: key,
        minLessonsRule: key,
      }));

      validateRequiredVariables('stage4_phase2_scope_system', interfaceKeys);
    });

    it('stage4_phase2_scope_user variables match interface', () => {
      const interfaceKeys = getInterfaceKeys(key => ({
        topic: key,
        outputLanguageUpper: key,
        category: key,
        complexity: key,
        targetAudience: key,
        keyConcepts: key,
        overlapFeedbackSection: key,
        courseDescriptionContext: key,
        learningOutcomesContext: key,
        documentsContext: key,
        clarifyingContext: key,
        sizeSection: key,
        sizeConstraintNote: key,
        sectionsRange: key,
        sectionsSuffix: key,
        sizeSpecificNotes: key,
        targetSectionsHint: key,
      }));

      validateRequiredVariables('stage4_phase2_scope_user', interfaceKeys);
    });

    it('stage4_phase3_expert variables match interface', () => {
      const interfaceKeys = getInterfaceKeys(key => ({
        outputLanguage: key,
        outputLanguageUpper: key,
        schemaDescription: key,
        topic: key,
        category: key,
        categoryConfidence: key,
        complexity: key,
        informationCompleteness: key,
        targetAudience: key,
        totalLessons: key,
        estimatedHours: key,
        lessonDurationMinutes: key,
        totalSections: key,
        documentContext: key,
        clarifyingContext: key,
      }));

      validateRequiredVariables('stage4_phase3_expert', interfaceKeys);
    });

    it('stage4_phase4_synthesis_system variables match interface', () => {
      const interfaceKeys = getInterfaceKeys(() => ({}));

      validateRequiredVariables('stage4_phase4_synthesis_system', interfaceKeys);
    });

    it('stage4_phase4_synthesis_user variables match interface', () => {
      const interfaceKeys = getInterfaceKeys(key => ({
        outputLanguage: key,
        outputLanguageUpper: key,
        schemaDescription: key,
        topic: key,
        language: key,
        category: key,
        totalLessons: key,
        totalSections: key,
        documentCount: key,
        researchFlagsSection: key,
        phase1KeyConcepts: key,
        phase2SectionsBreakdown: key,
        phase3ProgressionLogic: key,
        documentSummariesSection: key,
        clarifyingContext: key,
      }));

      validateRequiredVariables('stage4_phase4_synthesis_user', interfaceKeys);
    });

    it('stage5_batch_section_generator variables match interface', () => {
      const interfaceKeys = getInterfaceKeys(key => ({
        courseTitle: key,
        language: key,
        stylePrompt: key,
        style: key,
        targetAudienceLine: key,
        userContext: key,
        courseStructureMapSection: key,
        previousSectionsDigestSection: key,
        sectionNumber: key,
        sectionTitle: key,
        learningObjectives: key,
        keyTopics: key,
        estimatedLessons: key,
        analysisContext: key,
        constraintsSection: key,
        schemaDescription: key,
        lessonGuidance: key,
        ragToolInfo: key,
        outputFormat: key,
      }));

      validateRequiredVariables('stage5_batch_section_generator', interfaceKeys);
    });

    it('stage6_serial_generator variables match interface', () => {
      const interfaceKeys = getInterfaceKeys(key => ({
        lessonTitle: key,
        targetAudience: key,
        tone: key,
        difficulty: key,
        sectionTitle: key,
        contentArchetype: key,
        depth: key,
        depthGuidance: key,
        keyPoints: key,
        requiredKeywords: key,
        prohibitedTerms: key,
        outputLanguage: key,
        ragContext: key,
        previousContext: key,
        interLessonContext: key,
        stylePrompt: key,
      }));

      validateRequiredVariables('stage6_serial_generator', interfaceKeys);
    });

    it('stage6_single_call_generator variables match interface', () => {
      const interfaceKeys = getInterfaceKeys(key => ({
        lessonTitle: key,
        lessonDescription: key,
        durationMinutes: key,
        targetWordCount: key,
        targetAudience: key,
        tone: key,
        difficulty: key,
        learningObjectives: key,
        sectionsList: key,
        hookStrategy: key,
        hookTopic: key,
        ragContext: key,
        interLessonContext: key,
        generationGuidance: key,
        stylePrompt: key,
        outputLanguage: key,
        introductionHeader: key,
        summaryHeader: key,
        exercisesHeader: key,
        exerciseLabel: key,
        taskLabel: key,
        scenarioLabel: key,
        yourAnswerLabel: key,
        hintLabel: key,
        sampleAnswerLabel: key,
        digestHeader: key,
        sectionsWordBudget: key,
      }));

      validateRequiredVariables('stage6_single_call_generator', interfaceKeys);
    });

    it('stage7_card_course variables match interface', () => {
      const interfaceKeys = getInterfaceKeys(key => ({
        courseTitle: key,
        courseTopic: key,
        languageContext: key,
        colorScheme: key,
        aesthetic: key,
        visualElements: key,
        mood: key,
      }));

      validateRequiredVariables('stage7_card_course', interfaceKeys);
    });

    it('stage7_card_lesson variables match interface', () => {
      const interfaceKeys = getInterfaceKeys(key => ({
        lessonTitle: key,
        objectivesSummary: key,
        courseTitle: key,
        courseTopic: key,
        colorScheme: key,
        aesthetic: key,
        visualElements: key,
        mood: key,
      }));

      validateRequiredVariables('stage7_card_lesson', interfaceKeys);
    });

    it('stage7_cover_user variables match interface', () => {
      const interfaceKeys = getInterfaceKeys(key => ({
        lessonTitle: key,
        courseSubject: key,
        keywords: key,
        languageContext: key,
        styleHint: key,
        colorScheme: key,
        aesthetic: key,
        visualElements: key,
        mood: key,
      }));

      validateRequiredVariables('stage7_cover_user', interfaceKeys);
    });
  });

  // ============================================================================
  // TESTS: Template Whitelist Integration
  // ============================================================================

  describe('Template whitelist integration', () => {
    it('should correctly filter Helm templates from unresolved placeholders', () => {
      // Simulate a template with both unresolved and whitelisted patterns
      const testTemplate = `
        Use {{UNRESOLVED_VAR}} here.
        Kubernetes config: {{ .Values.serviceName }}
        Another unresolved: {{MISSING_VAR}}
        Helm function: {{ quote .Values.name }}
      `;

      const matches = testTemplate.match(/\{\{[^}]+\}\}/g) || [];
      const unresolved = filterWhitelistedTemplates(matches);

      // Should only include UNRESOLVED_VAR and MISSING_VAR
      expect(unresolved).toHaveLength(2);
      expect(unresolved).toContain('{{UNRESOLVED_VAR}}');
      expect(unresolved).toContain('{{MISSING_VAR}}');

      // Should NOT include Helm patterns
      expect(unresolved).not.toContain('{{ .Values.serviceName }}');
      expect(unresolved).not.toContain('{{ quote .Values.name }}');
    });

    it('should handle templates with no placeholders', () => {
      const testTemplate = 'Plain text with no placeholders';
      const unresolved = extractUnresolvedPlaceholders(testTemplate);

      expect(unresolved).toHaveLength(0);
    });

    it('should handle templates with only whitelisted patterns', () => {
      const testTemplate = `
        {{ .Values.name }}
        {{ if .Values.enabled }}
        {{ range .Values.items }}
        {{ request.object.metadata.name }}
      `;
      const unresolved = extractUnresolvedPlaceholders(testTemplate);

      expect(unresolved).toHaveLength(0);
    });
  });
});
