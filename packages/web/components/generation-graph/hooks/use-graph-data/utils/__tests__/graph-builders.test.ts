import { describe, it, expect } from 'vitest'
import { buildGraph } from '../graph-builders'

/**
 * Unit tests for graph-builders.ts
 *
 * Focus: Stage 1 data merging logic
 * Ensures that stage1CourseData (from courses table) is properly merged
 * with latestAttempt data (from generation_trace table).
 *
 * Critical fix: Prevents "initializationError" in UI when trace data
 * is incomplete (missing status field).
 */

describe('buildGraph - Stage 1 data merging', () => {
  it('should merge stage1CourseData with trace data for Stage 1', () => {
    const stage1CourseData = {
      inputData: {
        topic: 'Test Course Title',
        course_description: 'Test Description',
        language: 'ru',
        style: 'professional',
        target_audience: 'intermediate',
      },
      outputData: {
        courseId: 'course-123-uuid',
        ownerId: 'owner-456-uuid',
        status: 'ready' as const,
      },
    }

    // Create minimal mock parameters
    const mockParams = {
      parallelItems: new Map(),
      stageStatuses: {
        stage_1: 'completed' as const,
      },
      documentSteps: new Map(),
      hasDocuments: true,
      stage1CourseData,
      getTrace: (stageKey: string) => {
        if (stageKey === 'stage_1') {
          return {
            stage: 'stage_1',
            phase: 'complete',
            step_name: 'finish',
            input_data: {
              filename: 'test.docx',
              fileSize: 1000,
              mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            },
            output_data: {
              fileId: 'file-789-uuid',
              storagePath: 'uploads/org-id/course-id/file-id.docx',
            },
            created_at: '2026-02-05T03:12:06.981854+00',
            duration_ms: 100,
            tokens_used: 0,
            cost_usd: 0,
          }
        }
        return undefined
      },
      getAttempts: () => [
        {
          attemptNumber: 1,
          status: 'completed' as const,
          inputData: {
            filename: 'test.docx',
            fileSize: 1000,
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
          outputData: {
            fileId: 'file-789-uuid',
            storagePath: 'uploads/org-id/course-id/file-id.docx',
          },
        },
      ],
      getPhases: () => [],
      getExistingPos: () => ({ x: 0, y: 0 }),
      getModuleCollapsed: () => false,
      getStage2Collapsed: () => false,
    }

    const graph = buildGraph(mockParams)

    const stage1Node = graph.nodes.find((n) => n.id === 'stage_1')
    expect(stage1Node).toBeDefined()

    if (!stage1Node) {
      throw new Error('Stage 1 node not found')
    }

    // Verify merged input data
    expect(stage1Node.data.inputData).toBeDefined()
    expect(stage1Node.data.inputData).toMatchObject({
      // From stage1CourseData (courses table)
      topic: 'Test Course Title',
      course_description: 'Test Description',
      language: 'ru',
      style: 'professional',
      // From trace data (generation_trace table)
      filename: 'test.docx',
      fileSize: 1000,
    })

    // Verify merged output data - CRITICAL: status must be present!
    expect(stage1Node.data.outputData).toBeDefined()
    expect(stage1Node.data.outputData).toMatchObject({
      // From stage1CourseData (courses table) - IMPORTANT!
      courseId: 'course-123-uuid',
      status: 'ready', // <- This prevents "initializationError" in UI
      // From trace data (generation_trace table)
      fileId: 'file-789-uuid',
    })
  })

  it('should handle missing latestAttempt gracefully (no traces)', () => {
    const stage1CourseData = {
      inputData: {
        topic: 'Test Course',
        course_description: 'Description',
        language: 'ru',
        style: 'professional',
      },
      outputData: {
        courseId: 'course-123-uuid',
        status: 'ready' as const,
      },
    }

    const mockParams = {
      parallelItems: new Map(),
      stageStatuses: {
        stage_1: 'pending' as const,
      },
      documentSteps: new Map(),
      hasDocuments: false,
      stage1CourseData,
      getTrace: () => undefined,
      getAttempts: () => [], // No attempts/traces
      getPhases: () => [],
      getExistingPos: () => ({ x: 0, y: 0 }),
      getModuleCollapsed: () => false,
      getStage2Collapsed: () => false,
    }

    const graph = buildGraph(mockParams)
    const stage1Node = graph.nodes.find((n) => n.id === 'stage_1')

    expect(stage1Node).toBeDefined()
    if (!stage1Node) {
      throw new Error('Stage 1 node not found')
    }

    // Should fallback to stage1CourseData when no traces exist
    expect(stage1Node.data.outputData).toMatchObject({
      courseId: 'course-123-uuid',
      status: 'ready',
    })
  })

  it('should handle missing stage1CourseData gracefully (traces only)', () => {
    const mockParams = {
      parallelItems: new Map(),
      stageStatuses: {
        stage_1: 'completed' as const,
      },
      documentSteps: new Map(),
      hasDocuments: true,
      stage1CourseData: undefined, // No preloaded data
      getTrace: (stageKey: string) => {
        if (stageKey === 'stage_1') {
          return {
            stage: 'stage_1',
            output_data: { fileId: 'file-456' },
          }
        }
        return undefined
      },
      getAttempts: () => [
        {
          attemptNumber: 1,
          status: 'completed' as const,
          outputData: { fileId: 'file-456' },
        },
      ],
      getPhases: () => [],
      getExistingPos: () => ({ x: 0, y: 0 }),
      getModuleCollapsed: () => false,
      getStage2Collapsed: () => false,
    }

    const graph = buildGraph(mockParams)
    const stage1Node = graph.nodes.find((n) => n.id === 'stage_1')

    expect(stage1Node).toBeDefined()
    if (!stage1Node) {
      throw new Error('Stage 1 node not found')
    }

    // Should use trace data only when stage1CourseData is missing
    expect(stage1Node.data.outputData).toMatchObject({
      fileId: 'file-456',
    })
  })

  it('should prioritize trace data over stage1CourseData for conflicting fields', () => {
    const stage1CourseData = {
      inputData: {
        topic: 'Old Title',
        language: 'en',
      },
      outputData: {
        courseId: 'course-123',
        status: 'ready' as const,
        fileId: 'old-file-id', // Will be overwritten
      },
    }

    const mockParams = {
      parallelItems: new Map(),
      stageStatuses: {
        stage_1: 'completed' as const,
      },
      documentSteps: new Map(),
      hasDocuments: true,
      stage1CourseData,
      getTrace: (stageKey: string) => {
        if (stageKey === 'stage_1') {
          return {
            stage: 'stage_1',
            output_data: { fileId: 'new-file-id' },
          }
        }
        return undefined
      },
      getAttempts: () => [
        {
          attemptNumber: 1,
          status: 'completed' as const,
          inputData: {
            topic: 'New Title', // Should override
          },
          outputData: {
            fileId: 'new-file-id', // Should override
          },
        },
      ],
      getPhases: () => [],
      getExistingPos: () => ({ x: 0, y: 0 }),
      getModuleCollapsed: () => false,
      getStage2Collapsed: () => false,
    }

    const graph = buildGraph(mockParams)
    const stage1Node = graph.nodes.find((n) => n.id === 'stage_1')

    expect(stage1Node).toBeDefined()
    if (!stage1Node) {
      throw new Error('Stage 1 node not found')
    }

    // Trace data should win for conflicting fields
    expect(stage1Node.data.inputData).toMatchObject({
      topic: 'New Title', // From traces (overrides 'Old Title')
      language: 'en', // From stage1CourseData (no conflict)
    })

    expect(stage1Node.data.outputData).toMatchObject({
      courseId: 'course-123', // From stage1CourseData
      status: 'ready', // From stage1CourseData - CRITICAL!
      fileId: 'new-file-id', // From traces (overrides 'old-file-id')
    })
  })
})

describe('buildGraph - Stage 6 review-aware counters', () => {
  it('keeps review-required lessons out of completedLessons while preserving review flags', () => {
    const rebuiltGraph = buildGraph({
      parallelItems: new Map([
        [
          6,
          [
            {
              id: 'module_1',
              label: 'Модуль 1',
              status: 'pending' as const,
              type: 'module' as const,
              data: {
                moduleOrder: 1,
                totalLessons: 2,
                isCollapsed: false,
              },
            },
            {
              id: 'lesson_1_1',
              label: 'Урок 1',
              status: 'completed' as const,
              type: 'lesson' as const,
              parentId: 'module_1',
              data: { lessonOrder: 1 },
            },
            {
              id: 'lesson_1_2',
              label: 'Урок 2',
              status: 'review_required' as never,
              type: 'lesson' as const,
              parentId: 'module_1',
              data: { lessonOrder: 2 },
            },
          ],
        ],
      ]),
      stageStatuses: {
        stage_6: 'completed',
      },
      documentSteps: new Map(),
      hasDocuments: false,
      getTrace: () => undefined,
      getAttempts: () => [],
      getPhases: () => [],
      getExistingPos: () => ({ x: 0, y: 0 }),
      getModuleCollapsed: () => false,
      getStage2Collapsed: () => false,
    })

    const rebuiltStage6Node = rebuiltGraph.nodes.find((node) => node.id === 'stage_6')
    const rebuiltModuleNode = rebuiltGraph.nodes.find((node) => node.id === 'module_1')
    const rebuiltLessonNode = rebuiltGraph.nodes.find((node) => node.id === 'lesson_1_2')

    expect(rebuiltStage6Node?.data.outputData).toMatchObject({
      completedLessons: 1,
      readyLessons: 2,
      reviewRequiredLessons: 1,
      totalLessons: 2,
    })
    expect(rebuiltModuleNode?.data).toMatchObject({
      completedLessons: 1,
      readyLessons: 2,
      reviewRequiredLessons: 1,
      needsReview: true,
    })
    expect(rebuiltLessonNode?.data).toMatchObject({
      status: 'completed',
      needsReview: true,
    })
  })
})
