/**
 * Unit tests for Dependency Graph Builder (T044)
 *
 * Tests the buildDependencyGraphWithAnalysis function that creates
 * dependency graphs from AnalysisResult and CourseStructure.
 */

import { describe, it, expect } from 'vitest';
import { buildDependencyGraphWithAnalysis } from '@/shared/regeneration/dependency-graph-builder';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';
import type { CourseStructure } from '@megacampus/shared-types/generation-result';

// ============================================================================
// Mock Data
// ============================================================================

const mockAnalysisResult: AnalysisResult = {
  course_category: {
    primary: 'professional',
    confidence: 0.9,
    reasoning: 'Test reasoning',
  },
  contextual_language: {
    why_matters_context: 'Test context',
    motivators: 'Test motivators',
    experience_prompt: 'Test experience',
    problem_statement_context: 'Test problem',
    knowledge_bridge: 'Test bridge',
    practical_benefit_focus: 'Test benefit',
  },
  topic_analysis: {
    determined_topic: 'Introduction to TypeScript',
    information_completeness: 90,
    complexity: 'medium',
    reasoning: 'Test reasoning',
    target_audience: 'intermediate',
    missing_elements: null,
    key_concepts: ['Types', 'Interfaces', 'Generics'],
    domain_keywords: ['typescript', 'types', 'interfaces', 'generics', 'static typing'],
  },
  recommended_structure: {
    estimated_content_hours: 10,
    scope_reasoning: 'Test scope',
    lesson_duration_minutes: 15,
    calculation_explanation: 'Test calculation',
    total_lessons: 10,
    total_sections: 2,
    scope_warning: null,
    sections_breakdown: [],
  },
  pedagogical_strategy: {
    teaching_style: 'hands-on',
    assessment_approach: 'Project-based',
    practical_focus: 'high',
    progression_logic: 'Incremental complexity',
    interactivity_level: 'high',
  },
  pedagogical_patterns: {
    primary_strategy: 'problem-based learning',
    theory_practice_ratio: '30:70',
    assessment_types: ['coding', 'projects'],
    key_patterns: ['build incrementally', 'learn by refactoring'],
  },
  generation_guidance: {
    tone: 'conversational but precise',
    use_analogies: true,
    specific_analogies: ['assembly line for data flow'],
    avoid_jargon: ['monads', 'functors'],
    include_visuals: ['code examples', 'diagrams'],
    exercise_types: ['coding', 'debugging'],
    contextual_language_hints: 'Assume basic programming knowledge',
    real_world_examples: ['Web development', 'API design'],
  },
  content_strategy: 'create_from_scratch',
  document_relevance_mapping: {},
  expansion_areas: null,
  research_flags: [],
  metadata: {
    analysis_version: 'v1.0.0',
    total_duration_ms: 5000,
    phase_durations_ms: { phase_1: 2000, phase_2: 3000 },
    model_usage: { phase_1: 'openai/gpt-4', phase_2: 'openai/gpt-4' },
    total_tokens: { input: 1000, output: 500, total: 1500 },
    total_cost_usd: 0.05,
    retry_count: 0,
    quality_scores: { phase_1: 0.9, phase_2: 0.85 },
    created_at: '2025-12-06T12:00:00Z',
  },
};

const mockCourseStructure: CourseStructure = {
  course_title: 'TypeScript Fundamentals',
  course_description: 'Learn TypeScript from scratch',
  course_overview: 'A comprehensive introduction to TypeScript',
  target_audience: 'Developers with JavaScript experience',
  estimated_duration_hours: 10,
  difficulty_level: 'intermediate',
  prerequisites: ['JavaScript basics', 'Programming fundamentals'],
  learning_outcomes: [
    {
      id: 'lo-1',
      text: 'Explain TypeScript type system',
      language: 'en',
      cognitiveLevel: 'understand',
      estimatedDuration: 10,
      targetAudienceLevel: 'intermediate',
    },
    {
      id: 'lo-2',
      text: 'Apply types in real-world scenarios',
      language: 'en',
      cognitiveLevel: 'apply',
      estimatedDuration: 12,
      targetAudienceLevel: 'intermediate',
    },
    {
      id: 'lo-3',
      text: 'Design type-safe applications',
      language: 'en',
      cognitiveLevel: 'create',
      estimatedDuration: 15,
      targetAudienceLevel: 'intermediate',
    },
  ],
  assessment_strategy: {
    quiz_per_section: true,
    final_exam: false,
    practical_projects: 3,
    assessment_description: 'Hands-on coding exercises and projects',
  },
  course_tags: ['typescript', 'programming', 'web development', 'types', 'javascript'],
  sections: [
    {
      section_number: 1,
      section_title: 'TypeScript Basics',
      section_description: 'Introduction to TypeScript fundamentals',
      learning_objectives: ['Understand TypeScript syntax', 'Use basic types'],
      estimated_duration_minutes: 75,
      lessons: [
        {
          lesson_number: 1,
          lesson_title: 'Getting Started with TypeScript',
          lesson_objectives: ['Set up TypeScript', 'Write first TypeScript program'],
          key_topics: ['Installation', 'Configuration', 'First program'],
          estimated_duration_minutes: 15,
          practical_exercises: [
            {
              exercise_type: 'hands-on lab',
              exercise_title: 'Install and configure TypeScript',
              exercise_description: 'Set up a TypeScript development environment',
            },
            {
              exercise_type: 'coding exercise',
              exercise_title: 'Hello TypeScript',
              exercise_description: 'Write your first TypeScript program',
            },
            {
              exercise_type: 'self-assessment',
              exercise_title: 'Check your understanding',
              exercise_description: 'Review setup steps and verify installation',
            },
          ],
        },
        {
          lesson_number: 2,
          lesson_title: 'Basic Types',
          lesson_objectives: ['Identify primitive types', 'Use type annotations'],
          key_topics: ['string', 'number', 'boolean', 'type annotations'],
          estimated_duration_minutes: 20,
          practical_exercises: [
            {
              exercise_type: 'coding exercise',
              exercise_title: 'Type annotations practice',
              exercise_description: 'Add type annotations to variables',
            },
            {
              exercise_type: 'debugging',
              exercise_title: 'Fix type errors',
              exercise_description: 'Debug common type annotation mistakes',
            },
            {
              exercise_type: 'quiz',
              exercise_title: 'Type system quiz',
              exercise_description: 'Test your knowledge of primitive types',
            },
          ],
        },
      ],
    },
    {
      section_number: 2,
      section_title: 'Advanced Types',
      section_description: 'Deep dive into advanced TypeScript types',
      learning_objectives: ['Master interfaces', 'Apply generics'],
      estimated_duration_minutes: 60,
      lessons: [
        {
          lesson_number: 3,
          lesson_title: 'Interfaces and Type Aliases',
          lesson_objectives: ['Define interfaces', 'Create type aliases'],
          key_topics: ['Interfaces', 'Type aliases', 'Object types'],
          estimated_duration_minutes: 20,
          practical_exercises: [
            {
              exercise_type: 'coding exercise',
              exercise_title: 'Define custom types',
              exercise_description: 'Create interfaces for domain objects',
            },
            {
              exercise_type: 'case study',
              exercise_title: 'Refactor to use interfaces',
              exercise_description: 'Improve code quality with proper typing',
            },
            {
              exercise_type: 'peer review',
              exercise_title: 'Review type definitions',
              exercise_description: 'Evaluate interface design choices',
            },
          ],
        },
      ],
    },
  ],
};

// ============================================================================
// Tests
// ============================================================================

describe('buildDependencyGraphWithAnalysis', () => {
  it('should create nodes for course-level analysis fields', () => {
    const graph = buildDependencyGraphWithAnalysis(mockAnalysisResult, mockCourseStructure);

    expect(graph.nodesMap.has('course.learning_objectives')).toBe(true);
    expect(graph.nodesMap.has('course.key_concepts')).toBe(true);
    expect(graph.nodesMap.has('course.pedagogical_strategy')).toBe(true);
  });

  it('should create nodes for all sections', () => {
    const graph = buildDependencyGraphWithAnalysis(mockAnalysisResult, mockCourseStructure);

    expect(graph.nodesMap.has('section.0')).toBe(true);
    expect(graph.nodesMap.has('section.1')).toBe(true);
    expect(graph.nodesMap.has('section.0.learning_objectives')).toBe(true);
    expect(graph.nodesMap.has('section.0.title')).toBe(true);
  });

  it('should create nodes for all lessons', () => {
    const graph = buildDependencyGraphWithAnalysis(mockAnalysisResult, mockCourseStructure);

    expect(graph.nodesMap.has('section.0.lesson.0')).toBe(true);
    expect(graph.nodesMap.has('section.0.lesson.1')).toBe(true);
    expect(graph.nodesMap.has('section.1.lesson.0')).toBe(true);
  });

  it('should link course learning objectives to section learning objectives', () => {
    const graph = buildDependencyGraphWithAnalysis(mockAnalysisResult, mockCourseStructure);

    const courseLO = graph.nodesMap.get('course.learning_objectives');
    const sectionLO = graph.nodesMap.get('section.0.learning_objectives');

    expect(courseLO?.dependents).toContain('section.0.learning_objectives');
    expect(sectionLO?.dependsOn).toContain('course.learning_objectives');
  });

  it('should link course key concepts to all lessons', () => {
    const graph = buildDependencyGraphWithAnalysis(mockAnalysisResult, mockCourseStructure);

    const keyConcepts = graph.nodesMap.get('course.key_concepts');

    expect(keyConcepts?.dependents).toContain('section.0.lesson.0');
    expect(keyConcepts?.dependents).toContain('section.0.lesson.1');
    expect(keyConcepts?.dependents).toContain('section.1.lesson.0');
  });

  it('should link course pedagogical strategy to all lessons', () => {
    const graph = buildDependencyGraphWithAnalysis(mockAnalysisResult, mockCourseStructure);

    const pedStrategy = graph.nodesMap.get('course.pedagogical_strategy');

    expect(pedStrategy?.dependents).toContain('section.0.lesson.0');
    expect(pedStrategy?.dependents).toContain('section.0.lesson.1');
    expect(pedStrategy?.dependents).toContain('section.1.lesson.0');
  });

  it('should link section learning objectives to lesson learning objectives', () => {
    const graph = buildDependencyGraphWithAnalysis(mockAnalysisResult, mockCourseStructure);

    const sectionLO = graph.nodesMap.get('section.0.learning_objectives');
    const lessonLO = graph.nodesMap.get('lesson.0.0.learning_objectives');

    expect(sectionLO?.dependents).toContain('lesson.0.0.learning_objectives');
    expect(lessonLO?.dependsOn).toContain('section.0.learning_objectives');
  });

  it('should link section title to lessons in that section', () => {
    const graph = buildDependencyGraphWithAnalysis(mockAnalysisResult, mockCourseStructure);

    const sectionTitle = graph.nodesMap.get('section.0.title');

    expect(sectionTitle?.dependents).toContain('section.0.lesson.0');
    expect(sectionTitle?.dependents).toContain('section.0.lesson.1');
    expect(sectionTitle?.dependents).not.toContain('section.1.lesson.0');
  });

  it('should create sequential lesson dependencies', () => {
    const graph = buildDependencyGraphWithAnalysis(mockAnalysisResult, mockCourseStructure);

    const lesson1 = graph.nodesMap.get('section.0.lesson.0');
    const lesson2 = graph.nodesMap.get('section.0.lesson.1');

    expect(lesson1?.dependents).toContain('section.0.lesson.1');
    expect(lesson2?.dependsOn).toContain('section.0.lesson.0');
  });

  it('should get upstream dependencies using BFS', () => {
    const graph = buildDependencyGraphWithAnalysis(mockAnalysisResult, mockCourseStructure);

    const upstream = graph.getUpstream('lesson.0.0.learning_objectives');

    // Should include section LO and course LO
    const upstreamIds = upstream.map((n) => n.id);
    expect(upstreamIds).toContain('section.0.learning_objectives');
    expect(upstreamIds).toContain('course.learning_objectives');
  });

  it('should get downstream dependents using BFS', () => {
    const graph = buildDependencyGraphWithAnalysis(mockAnalysisResult, mockCourseStructure);

    const downstream = graph.getDownstream('course.key_concepts');

    // Should include all lessons
    // Note: May include transitive dependencies through sequential lesson links
    expect(downstream.length).toBeGreaterThanOrEqual(3);
    const downstreamIds = downstream.map((n) => n.id);
    expect(downstreamIds).toContain('section.0.lesson.0');
    expect(downstreamIds).toContain('section.0.lesson.1');
    expect(downstreamIds).toContain('section.1.lesson.0');
  });

  it('should calculate affected count correctly', () => {
    const graph = buildDependencyGraphWithAnalysis(mockAnalysisResult, mockCourseStructure);

    // Course key concepts affects all lessons (at least 3 direct dependencies)
    const affectedCount = graph.getAffectedCount('course.key_concepts');
    expect(affectedCount).toBeGreaterThanOrEqual(3);

    // Section 0 title affects only lessons in section 0 (at least 2 direct dependencies)
    const section0TitleAffected = graph.getAffectedCount('section.0.title');
    expect(section0TitleAffected).toBeGreaterThanOrEqual(2);
  });

  it('should return empty arrays for non-existent nodes', () => {
    const graph = buildDependencyGraphWithAnalysis(mockAnalysisResult, mockCourseStructure);

    const upstream = graph.getUpstream('non-existent-node');
    const downstream = graph.getDownstream('non-existent-node');

    expect(upstream).toEqual([]);
    expect(downstream).toEqual([]);
    expect(graph.getAffectedCount('non-existent-node')).toBe(0);
  });

  it('should include both nodes and edges arrays for compatibility', () => {
    const graph = buildDependencyGraphWithAnalysis(mockAnalysisResult, mockCourseStructure);

    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it('should include PARENT_OF edges for hierarchical structure', () => {
    const graph = buildDependencyGraphWithAnalysis(mockAnalysisResult, mockCourseStructure);

    const parentEdges = graph.edges.filter((e) => e.type === 'PARENT_OF');
    expect(parentEdges.length).toBeGreaterThan(0);

    // Check course → section edge
    const courseSectionEdge = parentEdges.find(
      (e) => e.from === 'course' && e.to === 'section.0'
    );
    expect(courseSectionEdge).toBeDefined();
  });

  it('should include PREREQUISITE_FOR edges for dependencies', () => {
    const graph = buildDependencyGraphWithAnalysis(mockAnalysisResult, mockCourseStructure);

    const prereqEdges = graph.edges.filter((e) => e.type === 'PREREQUISITE_FOR');
    expect(prereqEdges.length).toBeGreaterThan(0);

    // Check course LO → section LO edge
    const courseLOEdge = prereqEdges.find(
      (e) => e.from === 'course.learning_objectives' && e.to === 'section.0.learning_objectives'
    );
    expect(courseLOEdge).toBeDefined();
  });

  it('should prevent circular dependencies in BFS traversal', () => {
    const graph = buildDependencyGraphWithAnalysis(mockAnalysisResult, mockCourseStructure);

    // Even if we had circular deps, BFS should handle visited set properly
    const upstream = graph.getUpstream('lesson.0.0.learning_objectives');
    const downstream = graph.getDownstream('course.learning_objectives');

    // Should not hang or throw - just return finite results
    expect(upstream.length).toBeGreaterThan(0);
    expect(downstream.length).toBeGreaterThan(0);
    expect(upstream.length).toBeLessThan(100); // Sanity check
    expect(downstream.length).toBeLessThan(100); // Sanity check
  });

  it('should have correct node types', () => {
    const graph = buildDependencyGraphWithAnalysis(mockAnalysisResult, mockCourseStructure);

    const courseNode = graph.nodesMap.get('course');
    const sectionNode = graph.nodesMap.get('section.0');
    const lessonNode = graph.nodesMap.get('section.0.lesson.0');

    expect(courseNode?.type).toBe('course');
    expect(sectionNode?.type).toBe('section');
    expect(lessonNode?.type).toBe('lesson');
  });

  it('should have human-readable labels', () => {
    const graph = buildDependencyGraphWithAnalysis(mockAnalysisResult, mockCourseStructure);

    const courseNode = graph.nodesMap.get('course');
    const lessonNode = graph.nodesMap.get('section.0.lesson.0');

    expect(courseNode?.label).toBe('TypeScript Fundamentals');
    expect(lessonNode?.label).toBe('Getting Started with TypeScript');
  });
});
