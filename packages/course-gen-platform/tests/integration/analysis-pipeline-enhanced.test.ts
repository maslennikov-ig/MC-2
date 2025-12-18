/**
 * Stage 4 Analysis Pipeline Enhanced Schema Integration Test (Task A24)
 *
 * Test Objective: Validate new schema fields added in Analyze Enhancement (A14-A20)
 * without making real LLM API calls.
 *
 * New Fields Tested:
 * 1. pedagogical_patterns (Phase 1) - primary_strategy, theory_practice_ratio, assessment_types, key_patterns
 * 2. generation_guidance (Phase 4) - tone, use_analogies, include_visuals, exercise_types, etc.
 * 3. document_relevance_mapping (Phase 6) - section_id → {primary_documents, key_search_terms, expected_topics}
 * 4. Enhanced sections_breakdown - section_id, estimated_duration_hours, difficulty, prerequisites
 *
 * Test Strategy:
 * - Mock all LLM calls to avoid API costs and external dependencies
 * - Focus on schema validation and data flow through phases
 * - Test orchestrator assembly logic with mocked phase outputs
 * - Validate new fields are properly assembled and validated
 * - Test backward compatibility (old schema still works)
 * - Test error handling (Phase 6 failure graceful degradation)
 *
 * Reference: Task A24 in Analyze Enhancement feature
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { assembleAnalysisResult } from '../../src/orchestrator/services/analysis/phase-5-assembly';
import type {
  Phase1Output,
  Phase2Output,
  Phase3Output,
  Phase4Output,
  AnalysisResult,
} from '@megacampus/shared-types/analysis-result';
import type { Phase6Output } from '../../src/orchestrator/services/analysis/phase-6-rag-planning';

// ============================================================================
// Mock Phase Outputs
// ============================================================================

/**
 * Mock Phase 1 output WITH pedagogical_patterns (new field)
 */
function getMockPhase1OutputWithPatterns(): Phase1Output {
  return {
    course_category: {
      primary: 'professional',
      confidence: 0.92,
      reasoning: 'Course focuses on procurement law for government specialists',
      secondary: null,
    },
    contextual_language: {
      why_matters_context: 'Understanding procurement law is critical for compliance and avoiding legal issues',
      motivators: 'Government procurement specialists need this knowledge to make informed decisions and avoid costly mistakes',
      experience_prompt: 'You will learn practical skills for navigating complex procurement regulations',
      problem_statement_context: 'Many procurement specialists struggle with understanding the legal framework',
      knowledge_bridge: 'Build on your existing procurement experience by mastering the legal foundations',
      practical_benefit_focus: 'Apply procurement law principles to real-world contract negotiations and compliance checks',
    },
    topic_analysis: {
      determined_topic: 'Procurement Law Fundamentals for Government Specialists',
      information_completeness: 85,
      complexity: 'medium',
      reasoning: 'Topic is well-defined with clear scope for government procurement context',
      target_audience: 'intermediate',
      missing_elements: ['Recent case studies', 'International comparison'],
      key_concepts: ['Contract law basics', 'Federal procurement regulations', 'Compliance requirements'],
      domain_keywords: ['procurement', 'government contracts', 'legal compliance', 'tender process', 'contract law'],
    },
    // NEW FIELD: pedagogical_patterns
    pedagogical_patterns: {
      primary_strategy: 'problem-based learning',
      theory_practice_ratio: '30:70',
      assessment_types: ['quizzes', 'projects', 'peer-review'],
      key_patterns: ['build incrementally', 'learn by case analysis', 'apply to real scenarios'],
    },
    phase_metadata: {
      duration_ms: 5200,
      model_used: 'openai/gpt-oss-20b',
      tokens: { input: 1200, output: 800, total: 2000 },
      quality_score: 0.88,
      retry_count: 0,
    },
  };
}

/**
 * Mock Phase 1 output WITHOUT pedagogical_patterns (backward compatibility)
 */
function getMockPhase1OutputLegacy(): Phase1Output {
  const phase1 = getMockPhase1OutputWithPatterns();
  delete phase1.pedagogical_patterns;
  return phase1;
}

/**
 * Mock Phase 2 output WITH enhanced section fields (section_id, estimated_duration_hours, difficulty, prerequisites)
 */
function getMockPhase2OutputWithEnhancements(): Phase2Output {
  return {
    recommended_structure: {
      estimated_content_hours: 12,
      scope_reasoning: 'Course covers all essential procurement law topics for government specialists',
      lesson_duration_minutes: 15,
      calculation_explanation: '12 hours of content divided into 15-minute lessons = 48 lessons total',
      total_lessons: 48,
      total_sections: 4,
      scope_warning: null,
      sections_breakdown: [
        {
          area: 'Introduction to Procurement Law',
          estimated_lessons: 10,
          importance: 'core',
          learning_objectives: [
            'Understand legal framework for government procurement',
            'Identify key regulations and compliance requirements',
          ],
          key_topics: ['Legal foundations', 'Regulatory framework', 'Compliance basics'],
          pedagogical_approach: 'Introduction with case studies and regulatory examples',
          difficulty_progression: 'gradual',
          // NEW FIELDS
          section_id: '1',
          estimated_duration_hours: 2.5,
          difficulty: 'beginner',
          prerequisites: [],
        },
        {
          area: 'Contract Formation and Execution',
          estimated_lessons: 14,
          importance: 'core',
          learning_objectives: [
            'Master contract formation principles',
            'Execute procurement contracts correctly',
          ],
          key_topics: ['Contract law', 'Tender process', 'Bid evaluation', 'Contract execution'],
          pedagogical_approach: 'Hands-on practice with real contract templates',
          difficulty_progression: 'gradual',
          // NEW FIELDS
          section_id: '2',
          estimated_duration_hours: 3.5,
          difficulty: 'intermediate',
          prerequisites: ['1'], // Depends on Section 1
        },
        {
          area: 'Compliance and Risk Management',
          estimated_lessons: 12,
          importance: 'core',
          learning_objectives: [
            'Identify compliance risks in procurement',
            'Implement risk mitigation strategies',
          ],
          key_topics: ['Compliance monitoring', 'Risk assessment', 'Audit preparation', 'Legal remedies'],
          pedagogical_approach: 'Problem-solving with compliance scenarios',
          difficulty_progression: 'steep',
          // NEW FIELDS
          section_id: '3',
          estimated_duration_hours: 3.0,
          difficulty: 'intermediate',
          prerequisites: ['1', '2'], // Depends on Sections 1 and 2
        },
        {
          area: 'Advanced Topics and Case Studies',
          estimated_lessons: 12,
          importance: 'important',
          learning_objectives: [
            'Apply procurement law to complex scenarios',
            'Analyze real-world case studies',
          ],
          key_topics: ['International procurement', 'Dispute resolution', 'Recent court cases', 'Policy updates'],
          pedagogical_approach: 'Case study analysis and peer discussion',
          difficulty_progression: 'flat',
          // NEW FIELDS
          section_id: '4',
          estimated_duration_hours: 3.0,
          difficulty: 'advanced',
          prerequisites: ['3'], // Depends on Section 3
        },
      ],
    },
    phase_metadata: {
      duration_ms: 8500,
      model_used: 'openai/gpt-oss-20b',
      tokens: { input: 2500, output: 1800, total: 4300 },
      quality_score: 0.85,
      retry_count: 0,
      repair_metadata: {
        layer_used: 'none',
        repair_attempts: 0,
        models_tried: ['openai/gpt-oss-20b'],
      },
    },
  };
}

/**
 * Mock Phase 2 output WITHOUT enhanced section fields (backward compatibility)
 */
function getMockPhase2OutputLegacy(): Phase2Output {
  const phase2 = getMockPhase2OutputWithEnhancements();
  // Remove new fields from all sections
  phase2.recommended_structure.sections_breakdown.forEach(section => {
    delete section.section_id;
    delete section.estimated_duration_hours;
    delete section.difficulty;
    delete section.prerequisites;
  });
  return phase2;
}

/**
 * Mock Phase 3 output
 */
function getMockPhase3Output(): Phase3Output {
  return {
    pedagogical_strategy: {
      teaching_style: 'mixed',
      assessment_approach: 'Combination of quizzes, case analysis, and practical projects',
      practical_focus: 'high',
      progression_logic: 'Start with legal foundations, progress to practical application, culminate in complex case studies',
      interactivity_level: 'high',
    },
    expansion_areas: [
      {
        area: 'International Procurement Standards',
        priority: 'important',
        specific_requirements: ['Compare EU vs US procurement law', 'WTO agreements overview'],
        estimated_lessons: 5,
      },
    ],
    research_flags: [
      {
        topic: 'Federal Acquisition Regulation (FAR) updates 2025',
        reason: 'regulation_updates',
        context: 'FAR regulations are updated annually and need current version verification',
      },
    ],
    phase_metadata: {
      duration_ms: 12000,
      model_used: 'openai/gpt-oss-120b',
      tokens: { input: 3500, output: 2200, total: 5700 },
      quality_score: 0.92,
      retry_count: 0,
    },
  };
}

/**
 * Mock Phase 4 output WITH generation_guidance (new field)
 */
function getMockPhase4OutputWithGuidance(): Phase4Output {
  return {
    scope_instructions: 'Focus on practical application of procurement law with real-world examples and case studies. Emphasize regulatory compliance and legal frameworks in government procurement context.',
    // NEW FIELD: generation_guidance
    generation_guidance: {
      tone: 'conversational but precise',
      use_analogies: true,
      specific_analogies: [
        'procurement process as assembly line with quality checks',
        'contract formation as building blocks',
      ],
      avoid_jargon: ['legalese', 'overly technical terms without explanation'],
      include_visuals: ['flowcharts', 'code examples', 'diagrams'],
      exercise_types: ['coding', 'analysis', 'interpretation'],
      contextual_language_hints: 'Audience has intermediate procurement experience but limited legal background',
      real_world_examples: [
        'Government contract bid evaluation',
        'Compliance audit preparation',
        'Dispute resolution scenarios',
      ],
    },
    content_strategy: 'expand_and_enhance',
    phase_metadata: {
      duration_ms: 6800,
      model_used: 'openai/gpt-oss-20b',
      tokens: { input: 1800, output: 1200, total: 3000 },
      quality_score: 0.87,
      retry_count: 0,
      document_count: 3,
    },
  };
}

/**
 * Mock Phase 4 output WITHOUT generation_guidance (backward compatibility)
 */
function getMockPhase4OutputLegacy(): Phase4Output {
  const phase4 = getMockPhase4OutputWithGuidance();
  delete phase4.generation_guidance;
  return phase4;
}

/**
 * Mock Phase 6 output WITH document_relevance_mapping (new phase)
 */
function getMockPhase6Output(): Phase6Output {
  return {
    document_relevance_mapping: {
      '1': {
        primary_documents: ['doc_uuid_1', 'doc_uuid_2'],
        key_search_terms: [
          'procurement law basics',
          'regulatory framework',
          'compliance requirements',
          'legal foundations',
        ],
        expected_topics: [
          'Federal Acquisition Regulation overview',
          'Procurement law structure',
          'Basic compliance principles',
        ],
        document_processing_methods: {
          doc_uuid_1: 'hierarchical',
          doc_uuid_2: 'full_text',
        },
      },
      '2': {
        primary_documents: ['doc_uuid_1', 'doc_uuid_3'],
        key_search_terms: [
          'contract formation',
          'tender process',
          'bid evaluation',
          'contract execution',
          'procurement contracts',
        ],
        expected_topics: [
          'Contract law principles',
          'Tender documentation',
          'Bid evaluation criteria',
        ],
        document_processing_methods: {
          doc_uuid_1: 'hierarchical',
          doc_uuid_3: 'full_text',
        },
      },
      '3': {
        primary_documents: ['doc_uuid_2', 'doc_uuid_3'],
        key_search_terms: [
          'compliance monitoring',
          'risk assessment',
          'audit preparation',
          'legal remedies',
        ],
        expected_topics: [
          'Compliance best practices',
          'Risk mitigation strategies',
          'Audit requirements',
        ],
        document_processing_methods: {
          doc_uuid_2: 'full_text',
          doc_uuid_3: 'hierarchical',
        },
      },
      '4': {
        primary_documents: ['doc_uuid_3'],
        key_search_terms: [
          'international procurement',
          'dispute resolution',
          'case studies',
          'policy updates',
          'court cases',
        ],
        expected_topics: [
          'International procurement standards',
          'Dispute resolution mechanisms',
          'Recent case law',
        ],
        document_processing_methods: {
          doc_uuid_3: 'hierarchical',
        },
      },
    },
    phase_metadata: {
      duration_ms: 4200,
      model_used: 'openai/gpt-oss-20b',
      tokens: { input: 1500, output: 900, total: 2400 },
      quality_score: 0.84,
      retry_count: 0,
    },
  };
}

/**
 * Mock Phase 2 output with CIRCULAR PREREQUISITES (invalid)
 * Section 2 depends on 3, Section 3 depends on 4, Section 4 depends on 2
 */
function getMockPhase2OutputWithCircularPrereqs(): Phase2Output {
  const phase2 = getMockPhase2OutputWithEnhancements();
  // Create circular dependency: 2 → 3 → 4 → 2
  phase2.recommended_structure.sections_breakdown[1].prerequisites = ['3']; // Section 2 depends on 3
  phase2.recommended_structure.sections_breakdown[2].prerequisites = ['4']; // Section 3 depends on 4
  phase2.recommended_structure.sections_breakdown[3].prerequisites = ['2']; // Section 4 depends on 2 (CIRCULAR!)
  return phase2;
}

// ============================================================================
// Test Suites
// ============================================================================

describe('Integration: Analysis Pipeline with Enhanced Schema', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Pipeline Execution with New Fields', () => {
    /**
     * Test 1: Validate pedagogical_patterns field (Phase 1 enhancement)
     */
    it('should generate analysis with pedagogical_patterns (Phase 1 enhancement)', async () => {
      const phase1 = getMockPhase1OutputWithPatterns();
      const phase2 = getMockPhase2OutputWithEnhancements();
      const phase3 = getMockPhase3Output();
      const phase4 = getMockPhase4OutputWithGuidance();
      const phase6 = getMockPhase6Output();

      const result = await assembleAnalysisResult({
        course_id: 'test-course-uuid',
        language: 'en',
        topic: 'Procurement Law Fundamentals',
        answers: null,
        document_summaries: null,
        phase1_output: phase1,
        phase2_output: phase2,
        phase3_output: phase3,
        phase4_output: phase4,
        phase6_output: phase6,
        total_duration_ms: 36700,
        total_tokens: { input: 10500, output: 6900, total: 17400 },
        total_cost_usd: 0.0348,
      });

      // Validate pedagogical_patterns exists and has correct structure
      expect(result.pedagogical_patterns).toBeDefined();
      expect(result.pedagogical_patterns?.primary_strategy).toBe('problem-based learning');
      expect(result.pedagogical_patterns?.theory_practice_ratio).toBe('30:70');
      expect(result.pedagogical_patterns?.assessment_types).toEqual([
        'quizzes',
        'projects',
        'peer-review',
      ]);
      expect(result.pedagogical_patterns?.key_patterns).toHaveLength(3);
      expect(result.pedagogical_patterns?.key_patterns).toContain('build incrementally');
    });

    /**
     * Test 2: Validate generation_guidance field (Phase 4 enhancement)
     */
    it('should generate analysis with generation_guidance (Phase 4 enhancement)', async () => {
      const phase1 = getMockPhase1OutputWithPatterns();
      const phase2 = getMockPhase2OutputWithEnhancements();
      const phase3 = getMockPhase3Output();
      const phase4 = getMockPhase4OutputWithGuidance();
      const phase6 = getMockPhase6Output();

      const result = await assembleAnalysisResult({
        course_id: 'test-course-uuid',
        language: 'en',
        topic: 'Procurement Law Fundamentals',
        answers: null,
        document_summaries: null,
        phase1_output: phase1,
        phase2_output: phase2,
        phase3_output: phase3,
        phase4_output: phase4,
        phase6_output: phase6,
        total_duration_ms: 36700,
        total_tokens: { input: 10500, output: 6900, total: 17400 },
        total_cost_usd: 0.0348,
      });

      // Validate generation_guidance exists and has correct structure
      expect(result.generation_guidance).toBeDefined();
      expect(result.generation_guidance?.tone).toBe('conversational but precise');
      expect(result.generation_guidance?.use_analogies).toBe(true);
      expect(result.generation_guidance?.specific_analogies).toHaveLength(2);
      expect(result.generation_guidance?.avoid_jargon).toContain('legalese');
      expect(result.generation_guidance?.include_visuals).toContain('flowcharts');
      expect(result.generation_guidance?.exercise_types).toContain('analysis');
      expect(result.generation_guidance?.contextual_language_hints).toContain('intermediate procurement experience');
      expect(result.generation_guidance?.real_world_examples).toHaveLength(3);
    });

    /**
     * Test 3: Validate document_relevance_mapping field (Phase 6 new phase)
     */
    it('should generate analysis with document_relevance_mapping when documents exist (Phase 6)', async () => {
      const phase1 = getMockPhase1OutputWithPatterns();
      const phase2 = getMockPhase2OutputWithEnhancements();
      const phase3 = getMockPhase3Output();
      const phase4 = getMockPhase4OutputWithGuidance();
      const phase6 = getMockPhase6Output();

      const result = await assembleAnalysisResult({
        course_id: 'test-course-uuid',
        language: 'en',
        topic: 'Procurement Law Fundamentals',
        answers: null,
        document_summaries: null,
        phase1_output: phase1,
        phase2_output: phase2,
        phase3_output: phase3,
        phase4_output: phase4,
        phase6_output: phase6,
        total_duration_ms: 36700,
        total_tokens: { input: 10500, output: 6900, total: 17400 },
        total_cost_usd: 0.0348,
      });

      // Validate document_relevance_mapping exists and has correct structure
      expect(result.document_relevance_mapping).toBeDefined();
      expect(Object.keys(result.document_relevance_mapping!)).toHaveLength(4); // 4 sections

      // Validate Section 1 mapping
      const section1Mapping = result.document_relevance_mapping!['1'];
      expect(section1Mapping).toBeDefined();
      expect(section1Mapping.primary_documents).toEqual(['doc_uuid_1', 'doc_uuid_2']);
      expect(section1Mapping.key_search_terms).toHaveLength(4);
      expect(section1Mapping.key_search_terms).toContain('procurement law basics');
      expect(section1Mapping.expected_topics).toHaveLength(3);
      expect(section1Mapping.document_processing_methods).toHaveProperty('doc_uuid_1', 'hierarchical');
      expect(section1Mapping.document_processing_methods).toHaveProperty('doc_uuid_2', 'full_text');

      // Validate Section 2 mapping
      const section2Mapping = result.document_relevance_mapping!['2'];
      expect(section2Mapping.key_search_terms).toContain('contract formation');
      expect(section2Mapping.expected_topics).toContain('Contract law principles');
    });

    /**
     * Test 4: Validate enhanced sections_breakdown fields (Phase 2 enhancement)
     */
    it('should generate enhanced sections_breakdown with new optional fields (Phase 2 enhancement)', async () => {
      const phase1 = getMockPhase1OutputWithPatterns();
      const phase2 = getMockPhase2OutputWithEnhancements();
      const phase3 = getMockPhase3Output();
      const phase4 = getMockPhase4OutputWithGuidance();
      const phase6 = getMockPhase6Output();

      const result = await assembleAnalysisResult({
        course_id: 'test-course-uuid',
        language: 'en',
        topic: 'Procurement Law Fundamentals',
        answers: null,
        document_summaries: null,
        phase1_output: phase1,
        phase2_output: phase2,
        phase3_output: phase3,
        phase4_output: phase4,
        phase6_output: phase6,
        total_duration_ms: 36700,
        total_tokens: { input: 10500, output: 6900, total: 17400 },
        total_cost_usd: 0.0348,
      });

      const sections = result.recommended_structure.sections_breakdown;

      // Validate Section 1 enhanced fields
      expect(sections[0].section_id).toBe('1');
      expect(sections[0].estimated_duration_hours).toBe(2.5);
      expect(sections[0].difficulty).toBe('beginner');
      expect(sections[0].prerequisites).toEqual([]);

      // Validate Section 2 enhanced fields (depends on Section 1)
      expect(sections[1].section_id).toBe('2');
      expect(sections[1].estimated_duration_hours).toBe(3.5);
      expect(sections[1].difficulty).toBe('intermediate');
      expect(sections[1].prerequisites).toEqual(['1']);

      // Validate Section 3 enhanced fields (depends on Sections 1 and 2)
      expect(sections[2].section_id).toBe('3');
      expect(sections[2].estimated_duration_hours).toBe(3.0);
      expect(sections[2].difficulty).toBe('intermediate');
      expect(sections[2].prerequisites).toEqual(['1', '2']);

      // Validate Section 4 enhanced fields (depends on Section 3)
      expect(sections[3].section_id).toBe('4');
      expect(sections[3].estimated_duration_hours).toBe(3.0);
      expect(sections[3].difficulty).toBe('advanced');
      expect(sections[3].prerequisites).toEqual(['3']);
    });

    /**
     * Test 5: Backward compatibility - old schema still works (no new fields)
     */
    it('should maintain backward compatibility with old schema (no new fields)', async () => {
      const phase1 = getMockPhase1OutputLegacy(); // No pedagogical_patterns
      const phase2 = getMockPhase2OutputLegacy(); // No enhanced section fields
      const phase3 = getMockPhase3Output();
      const phase4 = getMockPhase4OutputLegacy(); // No generation_guidance
      const phase6 = null; // No Phase 6

      const result = await assembleAnalysisResult({
        course_id: 'test-course-uuid',
        language: 'en',
        topic: 'Procurement Law Fundamentals',
        answers: null,
        document_summaries: null,
        phase1_output: phase1,
        phase2_output: phase2,
        phase3_output: phase3,
        phase4_output: phase4,
        phase6_output: phase6,
        total_duration_ms: 32500,
        total_tokens: { input: 9000, output: 6000, total: 15000 },
        total_cost_usd: 0.03,
      });

      // Validate old schema fields still work
      expect(result.course_category).toBeDefined();
      expect(result.recommended_structure).toBeDefined();
      expect(result.pedagogical_strategy).toBeDefined();
      expect(result.scope_instructions).toBeDefined();

      // Validate new fields are undefined (backward compatibility)
      expect(result.pedagogical_patterns).toBeUndefined();
      expect(result.generation_guidance).toBeUndefined();
      expect(result.document_relevance_mapping).toBeUndefined();

      // Validate sections don't have enhanced fields
      const sections = result.recommended_structure.sections_breakdown;
      expect(sections[0].section_id).toBeUndefined();
      expect(sections[0].estimated_duration_hours).toBeUndefined();
      expect(sections[0].difficulty).toBeUndefined();
      expect(sections[0].prerequisites).toBeUndefined();
    });

    /**
     * Test 6: Coexistence of old and new fields (scope_instructions + generation_guidance)
     */
    it('should allow coexistence of scope_instructions and generation_guidance', async () => {
      const phase1 = getMockPhase1OutputWithPatterns();
      const phase2 = getMockPhase2OutputWithEnhancements();
      const phase3 = getMockPhase3Output();
      const phase4 = getMockPhase4OutputWithGuidance(); // Has BOTH scope_instructions and generation_guidance
      const phase6 = getMockPhase6Output();

      const result = await assembleAnalysisResult({
        course_id: 'test-course-uuid',
        language: 'en',
        topic: 'Procurement Law Fundamentals',
        answers: null,
        document_summaries: null,
        phase1_output: phase1,
        phase2_output: phase2,
        phase3_output: phase3,
        phase4_output: phase4,
        phase6_output: phase6,
        total_duration_ms: 36700,
        total_tokens: { input: 10500, output: 6900, total: 17400 },
        total_cost_usd: 0.0348,
      });

      // Both fields should coexist
      expect(result.scope_instructions).toBeDefined();
      expect(result.scope_instructions).toContain('practical application');
      expect(result.generation_guidance).toBeDefined();
      expect(result.generation_guidance?.tone).toBe('conversational but precise');
    });
  });

  describe('Phase 6 RAG Planning', () => {
    /**
     * Test 7: Phase 6 generates document_relevance_mapping for course with documents
     */
    it('should generate document_relevance_mapping for course with documents (Phase 6 success)', async () => {
      const phase1 = getMockPhase1OutputWithPatterns();
      const phase2 = getMockPhase2OutputWithEnhancements();
      const phase3 = getMockPhase3Output();
      const phase4 = getMockPhase4OutputWithGuidance();
      const phase6 = getMockPhase6Output();

      const result = await assembleAnalysisResult({
        course_id: 'test-course-uuid',
        language: 'en',
        topic: 'Procurement Law Fundamentals',
        answers: null,
        document_summaries: ['Doc summary 1', 'Doc summary 2', 'Doc summary 3'],
        phase1_output: phase1,
        phase2_output: phase2,
        phase3_output: phase3,
        phase4_output: phase4,
        phase6_output: phase6,
        total_duration_ms: 36700,
        total_tokens: { input: 10500, output: 6900, total: 17400 },
        total_cost_usd: 0.0348,
      });

      // Validate mapping exists
      expect(result.document_relevance_mapping).toBeDefined();
      expect(Object.keys(result.document_relevance_mapping!)).toHaveLength(4);

      // Validate each section has proper mapping structure
      for (const sectionId of ['1', '2', '3', '4']) {
        const mapping = result.document_relevance_mapping![sectionId];
        expect(mapping).toBeDefined();
        expect(Array.isArray(mapping.primary_documents)).toBe(true);
        expect(Array.isArray(mapping.key_search_terms)).toBe(true);
        expect(mapping.key_search_terms.length).toBeGreaterThanOrEqual(3);
        expect(mapping.key_search_terms.length).toBeLessThanOrEqual(10);
        expect(Array.isArray(mapping.expected_topics)).toBe(true);
        expect(mapping.expected_topics.length).toBeGreaterThanOrEqual(2);
        expect(mapping.expected_topics.length).toBeLessThanOrEqual(8);
        expect(typeof mapping.document_processing_methods).toBe('object');
      }
    });

    /**
     * Test 8: Phase 6 skipped for course without documents
     */
    it('should skip Phase 6 for course without documents (phase6_output = null)', async () => {
      const phase1 = getMockPhase1OutputWithPatterns();
      const phase2 = getMockPhase2OutputWithEnhancements();
      const phase3 = getMockPhase3Output();
      const phase4 = getMockPhase4OutputWithGuidance();
      const phase6 = null; // Phase 6 skipped (no documents)

      const result = await assembleAnalysisResult({
        course_id: 'test-course-uuid',
        language: 'en',
        topic: 'Procurement Law Fundamentals',
        answers: null,
        document_summaries: null, // No documents
        phase1_output: phase1,
        phase2_output: phase2,
        phase3_output: phase3,
        phase4_output: phase4,
        phase6_output: phase6,
        total_duration_ms: 32500,
        total_tokens: { input: 9000, output: 6000, total: 15000 },
        total_cost_usd: 0.03,
      });

      // Validate document_relevance_mapping is undefined (Phase 6 skipped)
      expect(result.document_relevance_mapping).toBeUndefined();
    });

    /**
     * Test 9: Phase 6 failure graceful degradation (degradation to NAIVE mode)
     */
    it('should handle Phase 6 failure gracefully (phase6_output = null, documents exist)', async () => {
      const phase1 = getMockPhase1OutputWithPatterns();
      const phase2 = getMockPhase2OutputWithEnhancements();
      const phase3 = getMockPhase3Output();
      const phase4 = getMockPhase4OutputWithGuidance();
      const phase6 = null; // Phase 6 failed (returned null)

      const result = await assembleAnalysisResult({
        course_id: 'test-course-uuid',
        language: 'en',
        topic: 'Procurement Law Fundamentals',
        answers: null,
        document_summaries: ['Doc summary 1', 'Doc summary 2'], // Documents exist, but Phase 6 failed
        phase1_output: phase1,
        phase2_output: phase2,
        phase3_output: phase3,
        phase4_output: phase4,
        phase6_output: phase6,
        total_duration_ms: 32500,
        total_tokens: { input: 9000, output: 6000, total: 15000 },
        total_cost_usd: 0.03,
      });

      // Validate document_relevance_mapping is undefined (Phase 6 failed, degraded to NAIVE mode)
      expect(result.document_relevance_mapping).toBeUndefined();

      // Validate other fields are still present (graceful degradation)
      expect(result.pedagogical_patterns).toBeDefined();
      expect(result.generation_guidance).toBeDefined();
      expect(result.recommended_structure).toBeDefined();
    });
  });

  describe('Validation and Assembly', () => {
    /**
     * Test 10: Validate pedagogical_patterns structure (theory_practice_ratio sums to 100)
     */
    it('should validate pedagogical_patterns structure (theory_practice_ratio sums to 100)', async () => {
      const phase1 = getMockPhase1OutputWithPatterns();
      const phase2 = getMockPhase2OutputWithEnhancements();
      const phase3 = getMockPhase3Output();
      const phase4 = getMockPhase4OutputWithGuidance();

      const result = await assembleAnalysisResult({
        course_id: 'test-course-uuid',
        language: 'en',
        topic: 'Procurement Law Fundamentals',
        answers: null,
        document_summaries: null,
        phase1_output: phase1,
        phase2_output: phase2,
        phase3_output: phase3,
        phase4_output: phase4,
        phase6_output: null,
        total_duration_ms: 32500,
        total_tokens: { input: 9000, output: 6000, total: 15000 },
        total_cost_usd: 0.03,
      });

      // Extract theory_practice_ratio
      const ratio = result.pedagogical_patterns?.theory_practice_ratio;
      expect(ratio).toBe('30:70');

      // Validate format and sum
      const [theory, practice] = ratio!.split(':').map(Number);
      expect(theory + practice).toBe(100);
    });

    /**
     * Test 11: Validate generation_guidance structure (all required fields)
     */
    it('should validate generation_guidance structure (all required fields present)', async () => {
      const phase1 = getMockPhase1OutputWithPatterns();
      const phase2 = getMockPhase2OutputWithEnhancements();
      const phase3 = getMockPhase3Output();
      const phase4 = getMockPhase4OutputWithGuidance();

      const result = await assembleAnalysisResult({
        course_id: 'test-course-uuid',
        language: 'en',
        topic: 'Procurement Law Fundamentals',
        answers: null,
        document_summaries: null,
        phase1_output: phase1,
        phase2_output: phase2,
        phase3_output: phase3,
        phase4_output: phase4,
        phase6_output: null,
        total_duration_ms: 32500,
        total_tokens: { input: 9000, output: 6000, total: 15000 },
        total_cost_usd: 0.03,
      });

      const guidance = result.generation_guidance;
      expect(guidance).toBeDefined();

      // Validate required fields
      expect(guidance?.tone).toBeDefined();
      expect(guidance?.use_analogies).toBeDefined();
      expect(Array.isArray(guidance?.avoid_jargon)).toBe(true);
      expect(Array.isArray(guidance?.include_visuals)).toBe(true);
      expect(guidance?.include_visuals.length).toBeGreaterThan(0);
      expect(Array.isArray(guidance?.exercise_types)).toBe(true);
      expect(guidance?.exercise_types.length).toBeGreaterThan(0);
      expect(guidance?.contextual_language_hints).toBeDefined();
      expect(typeof guidance?.contextual_language_hints).toBe('string');
    });

    /**
     * Test 12: Validate document_relevance_mapping structure (key_search_terms count)
     */
    it('should validate document_relevance_mapping structure (key_search_terms 3-10 items)', async () => {
      const phase1 = getMockPhase1OutputWithPatterns();
      const phase2 = getMockPhase2OutputWithEnhancements();
      const phase3 = getMockPhase3Output();
      const phase4 = getMockPhase4OutputWithGuidance();
      const phase6 = getMockPhase6Output();

      const result = await assembleAnalysisResult({
        course_id: 'test-course-uuid',
        language: 'en',
        topic: 'Procurement Law Fundamentals',
        answers: null,
        document_summaries: ['Doc 1', 'Doc 2'],
        phase1_output: phase1,
        phase2_output: phase2,
        phase3_output: phase3,
        phase4_output: phase4,
        phase6_output: phase6,
        total_duration_ms: 36700,
        total_tokens: { input: 10500, output: 6900, total: 17400 },
        total_cost_usd: 0.0348,
      });

      const mapping = result.document_relevance_mapping;
      expect(mapping).toBeDefined();

      // Validate each section has 3-10 key_search_terms
      for (const sectionId of Object.keys(mapping!)) {
        const sectionMapping = mapping![sectionId];
        expect(sectionMapping.key_search_terms.length).toBeGreaterThanOrEqual(3);
        expect(sectionMapping.key_search_terms.length).toBeLessThanOrEqual(10);
      }
    });

    /**
     * Test 13: Detect circular dependencies in prerequisites (DFS cycle detection)
     */
    it('should detect circular dependencies in prerequisites (DFS cycle detection)', async () => {
      const phase1 = getMockPhase1OutputWithPatterns();
      const phase2 = getMockPhase2OutputWithCircularPrereqs(); // Section 2 → 3 → 4 → 2 (circular!)
      const phase3 = getMockPhase3Output();
      const phase4 = getMockPhase4OutputWithGuidance();

      // Expect assembleAnalysisResult to throw error due to circular prerequisites
      await expect(
        assembleAnalysisResult({
          course_id: 'test-course-uuid',
          language: 'en',
          topic: 'Procurement Law Fundamentals',
          answers: null,
          document_summaries: null,
          phase1_output: phase1,
          phase2_output: phase2,
          phase3_output: phase3,
          phase4_output: phase4,
          phase6_output: null,
          total_duration_ms: 32500,
          total_tokens: { input: 9000, output: 6000, total: 15000 },
          total_cost_usd: 0.03,
        })
      ).rejects.toThrow(/circular dependency/i);
    });

    /**
     * Test 14: Validate minimum 10 lessons constraint (FR-015)
     */
    it('should enforce minimum 10 lessons constraint (FR-015)', async () => {
      const phase1 = getMockPhase1OutputWithPatterns();
      const phase2 = getMockPhase2OutputWithEnhancements();
      // Modify phase2 to have only 8 lessons (violation of FR-015)
      phase2.recommended_structure.total_lessons = 8;
      const phase3 = getMockPhase3Output();
      const phase4 = getMockPhase4OutputWithGuidance();

      // Expect assembleAnalysisResult to throw error due to minimum lessons violation
      await expect(
        assembleAnalysisResult({
          course_id: 'test-course-uuid',
          language: 'en',
          topic: 'Procurement Law Fundamentals',
          answers: null,
          document_summaries: null,
          phase1_output: phase1,
          phase2_output: phase2,
          phase3_output: phase3,
          phase4_output: phase4,
          phase6_output: null,
          total_duration_ms: 32500,
          total_tokens: { input: 9000, output: 6000, total: 15000 },
          total_cost_usd: 0.03,
        })
      ).rejects.toThrow(/minimum required.*10/i);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    /**
     * Test 15: Handle invalid theory_practice_ratio format
     */
    it('should reject invalid theory_practice_ratio format (not XX:YY)', async () => {
      const phase1 = getMockPhase1OutputWithPatterns();
      // Invalid format: "30-70" instead of "30:70"
      phase1.pedagogical_patterns!.theory_practice_ratio = '30-70';
      const phase2 = getMockPhase2OutputWithEnhancements();
      const phase3 = getMockPhase3Output();
      const phase4 = getMockPhase4OutputWithGuidance();

      await expect(
        assembleAnalysisResult({
          course_id: 'test-course-uuid',
          language: 'en',
          topic: 'Procurement Law Fundamentals',
          answers: null,
          document_summaries: null,
          phase1_output: phase1,
          phase2_output: phase2,
          phase3_output: phase3,
          phase4_output: phase4,
          phase6_output: null,
          total_duration_ms: 32500,
          total_tokens: { input: 9000, output: 6000, total: 15000 },
          total_cost_usd: 0.03,
        })
      ).rejects.toThrow(/theory_practice_ratio/i);
    });

    /**
     * Test 16: Handle invalid theory_practice_ratio sum (not 100)
     */
    it('should reject theory_practice_ratio that does not sum to 100', async () => {
      const phase1 = getMockPhase1OutputWithPatterns();
      // Invalid sum: 40 + 50 = 90 (not 100)
      phase1.pedagogical_patterns!.theory_practice_ratio = '40:50';
      const phase2 = getMockPhase2OutputWithEnhancements();
      const phase3 = getMockPhase3Output();
      const phase4 = getMockPhase4OutputWithGuidance();

      await expect(
        assembleAnalysisResult({
          course_id: 'test-course-uuid',
          language: 'en',
          topic: 'Procurement Law Fundamentals',
          answers: null,
          document_summaries: null,
          phase1_output: phase1,
          phase2_output: phase2,
          phase3_output: phase3,
          phase4_output: phase4,
          phase6_output: null,
          total_duration_ms: 32500,
          total_tokens: { input: 9000, output: 6000, total: 15000 },
          total_cost_usd: 0.03,
        })
      ).rejects.toThrow(/sum to 100/i);
    });

    /**
     * Test 17: Handle empty include_visuals array (validation should fail)
     */
    it('should reject generation_guidance with empty include_visuals array', async () => {
      const phase1 = getMockPhase1OutputWithPatterns();
      const phase2 = getMockPhase2OutputWithEnhancements();
      const phase3 = getMockPhase3Output();
      const phase4 = getMockPhase4OutputWithGuidance();
      // Empty include_visuals array
      phase4.generation_guidance!.include_visuals = [];

      await expect(
        assembleAnalysisResult({
          course_id: 'test-course-uuid',
          language: 'en',
          topic: 'Procurement Law Fundamentals',
          answers: null,
          document_summaries: null,
          phase1_output: phase1,
          phase2_output: phase2,
          phase3_output: phase3,
          phase4_output: phase4,
          phase6_output: null,
          total_duration_ms: 32500,
          total_tokens: { input: 9000, output: 6000, total: 15000 },
          total_cost_usd: 0.03,
        })
      ).rejects.toThrow(/include_visuals/i);
    });

    /**
     * Test 18: Handle key_search_terms count < 3 (validation should fail)
     */
    it('should reject document_relevance_mapping with key_search_terms count < 3', async () => {
      const phase1 = getMockPhase1OutputWithPatterns();
      const phase2 = getMockPhase2OutputWithEnhancements();
      const phase3 = getMockPhase3Output();
      const phase4 = getMockPhase4OutputWithGuidance();
      const phase6 = getMockPhase6Output();
      // Set Section 1 key_search_terms to only 2 items (< 3 minimum)
      phase6.document_relevance_mapping['1'].key_search_terms = ['term1', 'term2'];

      await expect(
        assembleAnalysisResult({
          course_id: 'test-course-uuid',
          language: 'en',
          topic: 'Procurement Law Fundamentals',
          answers: null,
          document_summaries: ['Doc 1'],
          phase1_output: phase1,
          phase2_output: phase2,
          phase3_output: phase3,
          phase4_output: phase4,
          phase6_output: phase6,
          total_duration_ms: 36700,
          total_tokens: { input: 10500, output: 6900, total: 17400 },
          total_cost_usd: 0.0348,
        })
      ).rejects.toThrow(/key_search_terms.*3-10/i);
    });
  });
});
