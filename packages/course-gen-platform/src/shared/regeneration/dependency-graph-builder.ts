/**
 * Dependency Graph Builder
 * @module shared/regeneration/dependency-graph-builder
 *
 * Builds dependency graphs from CourseStructure and AnalysisResult to track relationships between:
 * - Course → Sections → Lessons
 * - Lessons → Learning Objectives (ALIGNS_TO)
 * - Assessments → Learning Objectives (ASSESSES)
 * - Analysis data → Course structure (PREREQUISITE_FOR)
 *
 * Used for:
 * - Impact analysis before edits (US7, US8)
 * - Stale data detection after parent changes
 * - Cascade updates with preview
 */

import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';
import type { CourseStructure, DependencyGraph, DependencyNode, DependencyEdge } from '@megacampus/shared-types';

/**
 * Builds a dependency graph from a CourseStructure
 *
 * @param structure - The course structure containing sections and lessons
 * @returns Dependency graph with nodes and edges
 *
 * @example
 * const graph = buildDependencyGraph(courseStructure);
 * const { upstream, downstream } = getUpstream(graph, 'section.0.lesson.1');
 */
export function buildDependencyGraph(structure: CourseStructure): DependencyGraph {
  const nodes: DependencyNode[] = [];
  const edges: DependencyEdge[] = [];

  // Root course node
  nodes.push({
    id: 'course',
    type: 'course',
    label: structure.course_title || 'Course',
    parentId: null,
  });

  // Process sections
  structure.sections.forEach((section, sectionIndex) => {
    const sectionId = `section.${sectionIndex}`;

    nodes.push({
      id: sectionId,
      type: 'section',
      label: section.section_title || `Section ${sectionIndex + 1}`,
      parentId: 'course',
      learningObjectiveIds: section.learning_objectives,
    });

    edges.push({
      from: 'course',
      to: sectionId,
      type: 'PARENT_OF',
    });

    // Process lessons within section
    section.lessons.forEach((lesson, lessonIndex) => {
      const lessonId = `section.${sectionIndex}.lesson.${lessonIndex}`;

      nodes.push({
        id: lessonId,
        type: 'lesson',
        label: lesson.lesson_title || `Lesson ${sectionIndex + 1}.${lessonIndex + 1}`,
        parentId: sectionId,
        learningObjectiveIds: lesson.lesson_objectives,
      });

      edges.push({
        from: sectionId,
        to: lessonId,
        type: 'PARENT_OF',
      });

      // Create edges for learning objective alignments
      if (lesson.lesson_objectives && lesson.lesson_objectives.length > 0) {
        lesson.lesson_objectives.forEach((loId: string) => {
          edges.push({
            from: lessonId,
            to: loId,
            type: 'ALIGNS_TO',
          });
        });
      }
    });
  });

  return { nodes, edges };
}

/**
 * Gets upstream dependencies (parents, ancestors) for a given node
 *
 * @param graph - The dependency graph
 * @param nodeId - The target node ID (e.g., "section.0.lesson.1")
 * @returns Array of upstream nodes with their paths
 */
export function getUpstream(graph: DependencyGraph, nodeId: string): Array<{ id: string; label: string; path: string }> {
  const upstream: Array<{ id: string; label: string; path: string }> = [];
  const visited = new Set<string>();

  function traverseUp(currentNodeId: string, path: string[] = []): void {
    if (visited.has(currentNodeId)) return;
    visited.add(currentNodeId);

    // Find all edges pointing TO the current node (parents)
    const parentEdges = graph.edges.filter((edge) => edge.to === currentNodeId && edge.type === 'PARENT_OF');

    parentEdges.forEach((edge) => {
      const parentNode = graph.nodes.find((n) => n.id === edge.from);
      if (parentNode) {
        const newPath = [parentNode.id, ...path];
        upstream.push({
          id: parentNode.id,
          label: parentNode.label,
          path: newPath.join(' > '),
        });
        // Recursively traverse up
        traverseUp(parentNode.id, newPath);
      }
    });
  }

  traverseUp(nodeId);
  return upstream;
}

/**
 * Gets downstream dependencies (children, descendants) for a given node
 *
 * @param graph - The dependency graph
 * @param nodeId - The target node ID (e.g., "section.0")
 * @returns Array of downstream nodes with their paths
 */
export function getDownstream(graph: DependencyGraph, nodeId: string): Array<{ id: string; label: string; path: string }> {
  const downstream: Array<{ id: string; label: string; path: string }> = [];
  const visited = new Set<string>();

  function traverseDown(currentNodeId: string, path: string[] = []): void {
    if (visited.has(currentNodeId)) return;
    visited.add(currentNodeId);

    // Find all edges starting FROM the current node (children)
    const childEdges = graph.edges.filter((edge) => edge.from === currentNodeId && edge.type === 'PARENT_OF');

    childEdges.forEach((edge) => {
      const childNode = graph.nodes.find((n) => n.id === edge.to);
      if (childNode) {
        const newPath = [...path, childNode.id];
        downstream.push({
          id: childNode.id,
          label: childNode.label,
          path: newPath.join(' > '),
        });
        // Recursively traverse down
        traverseDown(childNode.id, newPath);
      }
    });
  }

  traverseDown(nodeId);
  return downstream;
}

/**
 * Converts a block path (e.g., "section.0.learning_objectives") to a node ID
 *
 * @param blockPath - Path like "section.0.lesson.1.title" or "section.0.learning_objectives"
 * @returns Node ID like "section.0.lesson.1" or "section.0"
 */
export function blockPathToNodeId(blockPath: string): string {
  // Extract the structural path (remove field names)
  const parts = blockPath.split('.');
  const structuralParts: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    // Keep only numeric indices and structural keywords
    if (part === 'section' || part === 'lesson' || !isNaN(Number(part))) {
      structuralParts.push(part);
    } else {
      // Stop when we hit a field name
      break;
    }
  }

  return structuralParts.join('.');
}

/**
 * Gets a human-readable label for a block path
 *
 * @param graph - The dependency graph
 * @param blockPath - The block path
 * @returns Human-readable label
 */
export function getNodeLabel(graph: DependencyGraph, blockPath: string): string {
  const nodeId = blockPathToNodeId(blockPath);
  const node = graph.nodes.find((n) => n.id === nodeId);

  if (!node) {
    return blockPath; // Fallback to the path itself
  }

  // Extract field name if present
  const fieldName = blockPath.replace(nodeId, '').replace(/^\./, '');

  if (fieldName) {
    return `${node.label} > ${fieldName}`;
  }

  return node.label;
}

// ============================================================================
// EXTENDED DEPENDENCY GRAPH WITH ANALYSIS RESULT (T044)
// ============================================================================

/**
 * Extended dependency node with dependency tracking
 *
 * This extends the base DependencyNode to track both upstream dependencies
 * (what this node depends on) and downstream dependents (what depends on this node).
 */
interface DependencyNodeExtended extends DependencyNode {
  /** IDs of nodes this depends on (upstream) */
  dependsOn: string[];
  /** IDs of nodes that depend on this (downstream) */
  dependents: string[];
}

/**
 * Extended dependency graph with traversal methods
 *
 * This interface provides a graph object with built-in traversal methods
 * as required by T044 specification.
 */
export interface DependencyGraphExtended extends DependencyGraph {
  /** Extended nodes with dependency tracking */
  nodesMap: Map<string, DependencyNodeExtended>;

  /**
   * Get all upstream dependencies (nodes this depends on)
   * Uses BFS traversal to find all transitive dependencies
   */
  getUpstream(nodeId: string): DependencyNodeExtended[];

  /**
   * Get all downstream dependents (nodes that depend on this)
   * Uses BFS traversal to find all transitive dependents
   */
  getDownstream(nodeId: string): DependencyNodeExtended[];

  /**
   * Get count of downstream nodes affected by changes to this node
   */
  getAffectedCount(nodeId: string): number;
}

/**
 * Builds an extended dependency graph from AnalysisResult and CourseStructure
 *
 * This implementation follows the dependency rules from data-model.md:
 *
 * 1. Course Level (Stage 4 AnalysisResult):
 *    - course_learning_objectives → All sections and lessons depend on it
 *    - topic_analysis.key_concepts → All lessons depend on it
 *    - pedagogical_strategy → All lessons depend on it
 *
 * 2. Section Level (Stage 5 CourseStructure.sections[]):
 *    - section_learning_objectives → All lessons in that section depend on it
 *    - section_title → Lessons in section depend on it (for naming consistency)
 *
 * 3. Lesson Level (Stage 5 CourseStructure.sections[].lessons[]):
 *    - Lessons can depend on previous lessons in the same section (sequential)
 *    - lesson_learning_objectives depends on parent section LOs
 *
 * @param analysisResult - Stage 4 analysis result (course-level data)
 * @param structure - Stage 5 course structure (sections, lessons)
 * @returns Extended dependency graph with nodes, edges, and traversal methods
 *
 * @example
 * const graph = buildDependencyGraphWithAnalysis(analysisResult, courseStructure);
 * const upstream = graph.getUpstream('section.0.lesson.1');
 * const affectedCount = graph.getAffectedCount('course.learning_objectives');
 */
export function buildDependencyGraphWithAnalysis(
  _analysisResult: AnalysisResult,
  structure: CourseStructure
): DependencyGraphExtended {
  const nodes: DependencyNode[] = [];
  const edges: DependencyEdge[] = [];
  const nodesMap = new Map<string, DependencyNodeExtended>();

  // NOTE: analysisResult parameter is currently unused but required by T044 spec.
  // Future enhancements may use analysis data to create conditional dependencies
  // based on actual course_learning_objectives, key_concepts, etc.
  // For now, we create conceptual nodes for these fields without reading the actual data.

  // -------------------------------------------------------------------------
  // Step 1: Create all nodes
  // -------------------------------------------------------------------------

  // Course-level nodes (from AnalysisResult)
  createExtendedCourseNode(
    nodesMap,
    'course.learning_objectives',
    'Course Learning Objectives'
  );

  createExtendedCourseNode(
    nodesMap,
    'course.key_concepts',
    'Course Key Concepts'
  );

  createExtendedCourseNode(
    nodesMap,
    'course.pedagogical_strategy',
    'Course Pedagogical Strategy'
  );

  // Root course node (for hierarchical structure)
  createExtendedCourseNode(nodesMap, 'course', structure.course_title || 'Course');

  // Process sections
  structure.sections.forEach((section, sectionIndex) => {
    const sectionId = `section.${sectionIndex}`;

    // Section node
    createExtendedSectionNode(
      nodesMap,
      sectionId,
      section.section_title || `Section ${sectionIndex + 1}`,
      'course'
    );

    // Section learning objectives
    createExtendedSectionNode(
      nodesMap,
      `section.${sectionIndex}.learning_objectives`,
      `Section ${sectionIndex + 1}: Learning Objectives`,
      sectionId
    );

    // Section title
    createExtendedSectionNode(
      nodesMap,
      `section.${sectionIndex}.title`,
      `Section ${sectionIndex + 1}: Title`,
      sectionId
    );

    // Process lessons within section
    section.lessons.forEach((lesson, lessonIndex) => {
      const lessonId = `section.${sectionIndex}.lesson.${lessonIndex}`;

      // Lesson node
      createExtendedLessonNode(
        nodesMap,
        lessonId,
        lesson.lesson_title || `Lesson ${sectionIndex + 1}.${lessonIndex + 1}`,
        sectionId
      );

      // Lesson learning objectives
      createExtendedLessonNode(
        nodesMap,
        `lesson.${sectionIndex}.${lessonIndex}.learning_objectives`,
        `Section ${sectionIndex + 1}, Lesson ${lessonIndex + 1}: Learning Objectives`,
        lessonId
      );
    });
  });

  // -------------------------------------------------------------------------
  // Step 2: Build dependency edges
  // -------------------------------------------------------------------------

  // Rule 1: Course learning objectives → All section learning objectives
  structure.sections.forEach((_, sectionIndex) => {
    const sectionLOId = `section.${sectionIndex}.learning_objectives`;
    addExtendedDependencyEdge(nodesMap, edges, 'course.learning_objectives', sectionLOId);
  });

  // Rule 2: Course key concepts → All lessons
  structure.sections.forEach((section, sectionIndex) => {
    section.lessons.forEach((_, lessonIndex) => {
      const lessonId = `section.${sectionIndex}.lesson.${lessonIndex}`;
      addExtendedDependencyEdge(nodesMap, edges, 'course.key_concepts', lessonId);
    });
  });

  // Rule 3: Course pedagogical strategy → All lessons
  structure.sections.forEach((section, sectionIndex) => {
    section.lessons.forEach((_, lessonIndex) => {
      const lessonId = `section.${sectionIndex}.lesson.${lessonIndex}`;
      addExtendedDependencyEdge(nodesMap, edges, 'course.pedagogical_strategy', lessonId);
    });
  });

  // Rule 4: Section learning objectives → All lessons in that section
  structure.sections.forEach((section, sectionIndex) => {
    const sectionLOId = `section.${sectionIndex}.learning_objectives`;
    section.lessons.forEach((_, lessonIndex) => {
      const lessonLOId = `lesson.${sectionIndex}.${lessonIndex}.learning_objectives`;
      addExtendedDependencyEdge(nodesMap, edges, sectionLOId, lessonLOId);
    });
  });

  // Rule 5: Section title → Lessons in section (for naming consistency)
  structure.sections.forEach((section, sectionIndex) => {
    const sectionTitleId = `section.${sectionIndex}.title`;
    section.lessons.forEach((_, lessonIndex) => {
      const lessonId = `section.${sectionIndex}.lesson.${lessonIndex}`;
      addExtendedDependencyEdge(nodesMap, edges, sectionTitleId, lessonId);
    });
  });

  // Rule 6: Sequential lesson dependencies (lesson N → lesson N+1)
  structure.sections.forEach((section, sectionIndex) => {
    section.lessons.forEach((_, lessonIndex) => {
      if (lessonIndex > 0) {
        const prevLessonId = `section.${sectionIndex}.lesson.${lessonIndex - 1}`;
        const currLessonId = `section.${sectionIndex}.lesson.${lessonIndex}`;
        addExtendedDependencyEdge(nodesMap, edges, prevLessonId, currLessonId);
      }
    });
  });

  // Hierarchical edges (PARENT_OF) for compatibility with existing code
  structure.sections.forEach((section, sectionIndex) => {
    const sectionId = `section.${sectionIndex}`;
    edges.push({
      from: 'course',
      to: sectionId,
      type: 'PARENT_OF',
    });

    section.lessons.forEach((_, lessonIndex) => {
      const lessonId = `section.${sectionIndex}.lesson.${lessonIndex}`;
      edges.push({
        from: sectionId,
        to: lessonId,
        type: 'PARENT_OF',
      });
    });
  });

  // -------------------------------------------------------------------------
  // Step 3: Convert map to array for compatibility
  // -------------------------------------------------------------------------

  nodesMap.forEach((node) => {
    nodes.push({
      id: node.id,
      type: node.type,
      label: node.label,
      parentId: node.parentId,
      learningObjectiveIds: node.learningObjectiveIds,
      lastModified: node.lastModified,
    });
  });

  // -------------------------------------------------------------------------
  // Step 4: Return graph with traversal methods
  // -------------------------------------------------------------------------

  return {
    nodes,
    edges,
    nodesMap,

    getUpstream(nodeId: string): DependencyNodeExtended[] {
      const node = nodesMap.get(nodeId);
      if (!node) return [];

      // BFS traversal to collect all upstream dependencies
      const visited = new Set<string>();
      const queue: string[] = [nodeId];
      const result: DependencyNodeExtended[] = [];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const currentNode = nodesMap.get(currentId);
        if (!currentNode) continue;

        // Add dependencies to queue and result (exclude self)
        for (const depId of currentNode.dependsOn) {
          if (!visited.has(depId)) {
            queue.push(depId);
            const depNode = nodesMap.get(depId);
            if (depNode) result.push(depNode);
          }
        }
      }

      return result;
    },

    getDownstream(nodeId: string): DependencyNodeExtended[] {
      const node = nodesMap.get(nodeId);
      if (!node) return [];

      // BFS traversal to collect all downstream dependents
      const visited = new Set<string>();
      const queue: string[] = [nodeId];
      const result: DependencyNodeExtended[] = [];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const currentNode = nodesMap.get(currentId);
        if (!currentNode) continue;

        // Add dependents to queue and result (exclude self)
        for (const depId of currentNode.dependents) {
          if (!visited.has(depId)) {
            queue.push(depId);
            const depNode = nodesMap.get(depId);
            if (depNode) result.push(depNode);
          }
        }
      }

      return result;
    },

    getAffectedCount(nodeId: string): number {
      return this.getDownstream(nodeId).length;
    },
  };
}

// ============================================================================
// HELPER FUNCTIONS FOR EXTENDED GRAPH
// ============================================================================

/**
 * Create a course-level node for extended graph
 */
function createExtendedCourseNode(
  nodesMap: Map<string, DependencyNodeExtended>,
  id: string,
  label: string
): void {
  nodesMap.set(id, {
    id,
    type: 'course',
    label,
    parentId: null,
    dependsOn: [],
    dependents: [],
  });
}

/**
 * Create a section-level node for extended graph
 */
function createExtendedSectionNode(
  nodesMap: Map<string, DependencyNodeExtended>,
  id: string,
  label: string,
  parentId: string | null
): void {
  nodesMap.set(id, {
    id,
    type: 'section',
    label,
    parentId,
    dependsOn: [],
    dependents: [],
  });
}

/**
 * Create a lesson-level node for extended graph
 */
function createExtendedLessonNode(
  nodesMap: Map<string, DependencyNodeExtended>,
  id: string,
  label: string,
  parentId: string
): void {
  nodesMap.set(id, {
    id,
    type: 'lesson',
    label,
    parentId,
    dependsOn: [],
    dependents: [],
  });
}

/**
 * Add a dependency edge from fromId to toId for extended graph
 * (fromId → toId means toId depends on fromId)
 */
function addExtendedDependencyEdge(
  nodesMap: Map<string, DependencyNodeExtended>,
  edges: DependencyEdge[],
  fromId: string,
  toId: string
): void {
  const fromNode = nodesMap.get(fromId);
  const toNode = nodesMap.get(toId);

  if (!fromNode || !toNode) {
    console.warn(`[DependencyGraph] Cannot add edge: ${fromId} → ${toId} (node not found)`);
    return;
  }

  // Add edge to edges array
  edges.push({
    from: fromId,
    to: toId,
    type: 'PREREQUISITE_FOR',
  });

  // Add toId to fromNode's dependents
  if (!fromNode.dependents.includes(toId)) {
    fromNode.dependents.push(toId);
  }

  // Add fromId to toNode's dependsOn
  if (!toNode.dependsOn.includes(fromId)) {
    toNode.dependsOn.push(fromId);
  }
}
