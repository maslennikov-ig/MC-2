'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabase/browser-client';
import { logger } from '@/lib/client-logger';
import type { Database } from '@/types/database.generated';
import type {
  ModuleDashboardData,
  ModuleDashboardAggregates,
  LessonMatrixRow,
  MicroStepperState,
  Stage6NodeName,
  Stage6NodeStatus,
  CourseStructure,
} from '@megacampus/shared-types';

/**
 * Metadata structure from lesson_contents.metadata JSONB column
 */
interface LessonMetadata {
  cost_usd?: number;
  quality_score?: number;
  generation_duration_ms?: number;
  total_tokens?: number;
  [key: string]: unknown;
}

/**
 * Type alias for lesson_contents table row
 */
type LessonContentRow = Database['public']['Tables']['lesson_contents']['Row'];

/**
 * Safely parse metadata from Json type
 */
function parseMetadata(metadata: Database['public']['Tables']['lesson_contents']['Row']['metadata']): LessonMetadata | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  return metadata as LessonMetadata;
}

/**
 * Hook return type
 */
export interface UseModuleDashboardDataReturn {
  /** Aggregated module dashboard data */
  data: ModuleDashboardData | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Manual refetch function */
  refetch: () => void;
}

/**
 * Hook options
 */
export interface UseModuleDashboardDataOptions {
  /** Module ID (e.g., "module_1") - null when not viewing a module */
  moduleId: string | null;
  /** Course ID */
  courseId: string;
  /** Course structure from courses.course_structure */
  courseStructure?: CourseStructure | null;
  /** Enable realtime subscriptions */
  enableRealtime?: boolean;
  /** Whether hook should fetch data */
  enabled?: boolean;
}

/**
 * Map database status to Stage6NodeStatus
 */
function mapLessonStatus(status: string): 'pending' | 'active' | 'completed' | 'error' {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'completed';
    case 'generating':
    case 'active':
      return 'active';
    case 'failed':
    case 'error':
      return 'error';
    case 'pending':
    default:
      return 'pending';
  }
}

/**
 * Extract pipeline state from generation_trace or metadata
 *
 * FUTURE: When generation_trace JSONB column is added to lesson_contents,
 * parse it to extract detailed pipeline node states.
 * For now, we derive state from status column only.
 */
function extractPipelineState(
  status: string,
  _metadata: LessonMetadata | null
): MicroStepperState {
  const lessonStatus = mapLessonStatus(status);

  // Default pipeline: all nodes pending
  const nodes: Array<{ node: Stage6NodeName; status: Stage6NodeStatus }> = [
    { node: 'planner', status: 'pending' },
    { node: 'expander', status: 'pending' },
    { node: 'assembler', status: 'pending' },
    { node: 'smoother', status: 'pending' },
    { node: 'judge', status: 'pending' },
  ];

  // Map overall lesson status to pipeline state
  if (lessonStatus === 'completed') {
    // All nodes completed
    nodes.forEach((node) => {
      node.status = 'completed';
    });
  } else if (lessonStatus === 'active') {
    // First node active, rest pending (simplified)
    nodes[0].status = 'active';
  } else if (lessonStatus === 'error') {
    // First node error, rest pending (simplified)
    nodes[0].status = 'error';
  }

  return { nodes };
}

/**
 * Calculate aggregated metrics from lesson rows
 */
function calculateAggregates(
  lessons: LessonMatrixRow[]
): ModuleDashboardAggregates {
  const totalLessons = lessons.length;
  const completedLessons = lessons.filter((l) => l.status === 'completed').length;
  const activeLessons = lessons.filter((l) => l.status === 'active').length;
  const errorLessons = lessons.filter((l) => l.status === 'error').length;
  const pendingLessons = lessons.filter((l) => l.status === 'pending').length;

  // Sum total cost
  const totalCostUsd = lessons.reduce((sum, l) => sum + l.costUsd, 0);

  // Calculate average quality score (only from completed lessons)
  const completedWithQuality = lessons.filter(
    (l) => l.status === 'completed' && l.qualityScore !== null
  );
  const avgQualityScore =
    completedWithQuality.length > 0
      ? completedWithQuality.reduce((sum, l) => sum + (l.qualityScore || 0), 0) /
        completedWithQuality.length
      : null;

  // Sum total duration (only completed lessons)
  const totalDurationMs = lessons.reduce(
    (sum, l) => sum + (l.durationMs || 0),
    0
  );

  // Estimate time remaining
  // Average duration per completed lesson × number of pending/active lessons
  const completedWithDuration = lessons.filter(
    (l) => l.status === 'completed' && l.durationMs !== null && l.durationMs > 0
  );
  const avgDurationPerLesson =
    completedWithDuration.length > 0
      ? completedWithDuration.reduce((sum, l) => sum + (l.durationMs || 0), 0) /
        completedWithDuration.length
      : null;

  const remainingLessons = pendingLessons + activeLessons;
  const estimatedTimeRemainingMs =
    avgDurationPerLesson !== null && remainingLessons > 0
      ? avgDurationPerLesson * remainingLessons
      : null;

  return {
    totalLessons,
    completedLessons,
    activeLessons,
    errorLessons,
    pendingLessons,
    totalCostUsd,
    avgQualityScore,
    totalDurationMs,
    estimatedTimeRemainingMs,
  };
}

/**
 * Determine overall module status from lessons
 */
function getModuleStatus(
  lessons: LessonMatrixRow[]
): 'pending' | 'active' | 'completed' | 'error' {
  if (lessons.length === 0) return 'pending';

  if (lessons.some((l) => l.status === 'error')) return 'error';
  if (lessons.some((l) => l.status === 'active')) return 'active';
  if (lessons.every((l) => l.status === 'completed')) return 'completed';

  return 'pending';
}

/**
 * Hook for fetching and aggregating module dashboard data
 *
 * Combines course structure with lesson_contents data to build a complete
 * module dashboard view. Supports realtime updates via Supabase subscriptions.
 *
 * Data flow:
 * 1. Extract module metadata from course_structure
 * 2. Find all lessons belonging to this module
 * 3. Query lesson_contents for each lesson
 * 4. Aggregate metrics (cost, quality, duration)
 * 5. Subscribe to realtime updates
 *
 * @param options - Hook options
 * @returns Dashboard data, loading state, error, and refetch function
 *
 * @example
 * ```tsx
 * function ModuleDashboard({ moduleId, courseId, courseStructure }) {
 *   const { data, isLoading, error, refetch } = useModuleDashboardData({
 *     moduleId,
 *     courseId,
 *     courseStructure,
 *     enableRealtime: true,
 *   });
 *
 *   if (isLoading) return <Skeleton />;
 *   if (error) return <ErrorMessage error={error} />;
 *   if (!data) return <EmptyState />;
 *
 *   return <ModuleDashboardView data={data} />;
 * }
 * ```
 */
export function useModuleDashboardData({
  moduleId,
  courseId,
  courseStructure: externalCourseStructure,
  enableRealtime = true,
  enabled = true,
}: UseModuleDashboardDataOptions): UseModuleDashboardDataReturn {
  const [data, setData] = useState<ModuleDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [internalCourseStructure, setInternalCourseStructure] = useState<CourseStructure | null>(null);

  // Track current fetch to avoid race conditions
  const fetchIdRef = useRef(0);
  const supabase = getSupabaseClient();

  // Use external courseStructure if provided, otherwise use internal
  const courseStructure = externalCourseStructure ?? internalCourseStructure;

  // Skip hook if disabled or missing moduleId
  const shouldFetch = enabled && !!moduleId;

  // Fetch courseStructure from database if not provided externally
  useEffect(() => {
    if (!shouldFetch || !courseId || externalCourseStructure) return;

    logger.debug('[useModuleDashboardData] Fetching course structure', { courseId, moduleId });

    const fetchCourseStructure = async () => {
      try {
        const { data: courseData, error: courseError } = await supabase
          .from('courses')
          .select('course_structure')
          .eq('id', courseId)
          .single();

        if (courseError) throw courseError;

        if (courseData?.course_structure) {
          logger.debug('[useModuleDashboardData] Course structure loaded', {
            courseId,
            sectionsCount: (courseData.course_structure as CourseStructure)?.sections?.length,
          });
          setInternalCourseStructure(courseData.course_structure as CourseStructure);
        } else {
          logger.warn('[useModuleDashboardData] Course structure is empty', { courseId });
        }
      } catch (err) {
        console.error('[useModuleDashboardData] Course structure fetch error:', err);
        logger.error('Failed to fetch course structure', { courseId, error: err });
      }
    };

    fetchCourseStructure();
  }, [shouldFetch, courseId, externalCourseStructure, supabase, moduleId]);

  /**
   * Get expected lesson count for this module from course structure
   * Used for displaying lessons that don't have content yet
   */
  const getLessonCountForModule = useCallback(
    (modId: string): number => {
      if (!courseStructure?.sections) return 0;

      // Extract module number from moduleId (e.g., "module_1" -> 1)
      const moduleNumber = parseInt(modId.replace('module_', ''), 10);
      if (isNaN(moduleNumber)) return 0;

      // Find the corresponding section (moduleNumber is 1-based)
      const sectionIndex = moduleNumber - 1;
      const section = courseStructure.sections[sectionIndex];

      return section?.lessons?.length ?? 0;
    },
    [courseStructure]
  );

  /**
   * Fetch lesson content data from database
   *
   * Data flow:
   * 1. Get section UUID from sections table (by course_id and order_index)
   * 2. Get lesson UUIDs from lessons table (by section_id)
   * 3. Get lesson contents from lesson_contents table (by lesson UUIDs)
   */
  const fetchLessonData = useCallback(async () => {
    logger.debug('[useModuleDashboardData] fetchLessonData called', {
      shouldFetch,
      courseId: courseId || 'undefined',
      moduleId: moduleId || 'undefined',
      hasCourseStructure: !!courseStructure,
      sectionsCount: courseStructure?.sections?.length ?? 0,
    });

    if (!shouldFetch || !courseId || !moduleId || !courseStructure) {
      setData(null);
      setIsLoading(false);
      return;
    }

    const fetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      // Extract module metadata from course structure
      const moduleNumber = parseInt(moduleId.replace('module_', ''), 10);
      if (isNaN(moduleNumber)) {
        throw new Error(`Invalid module ID: ${moduleId}`);
      }

      const sectionIndex = moduleNumber - 1;
      const section = courseStructure.sections?.[sectionIndex];

      logger.debug('[useModuleDashboardData] Looking for section', {
        moduleId,
        moduleNumber,
        sectionIndex,
        availableSections: courseStructure.sections?.length ?? 0,
        foundSection: !!section,
      });

      if (!section) {
        throw new Error(`Module ${moduleNumber} not found in course structure (sections: ${courseStructure.sections?.length ?? 0})`);
      }

      const moduleTitle = section.section_title || `Модуль ${moduleNumber}`;
      const expectedLessonCount = getLessonCountForModule(moduleId);

      if (expectedLessonCount === 0) {
        // Empty module - return empty dashboard
        setData({
          moduleId,
          moduleNumber,
          title: moduleTitle,
          status: 'pending',
          lessons: [],
          aggregates: {
            totalLessons: 0,
            completedLessons: 0,
            activeLessons: 0,
            errorLessons: 0,
            pendingLessons: 0,
            totalCostUsd: 0,
            avgQualityScore: null,
            totalDurationMs: 0,
            estimatedTimeRemainingMs: null,
          },
        });
        setIsLoading(false);
        return;
      }

      // Step 1: Get section UUID from sections table
      const { data: sectionData, error: sectionError } = await supabase
        .from('sections')
        .select('id, title')
        .eq('course_id', courseId)
        .eq('order_index', moduleNumber) // order_index is 1-based
        .single();

      if (fetchId !== fetchIdRef.current) return;

      if (sectionError || !sectionData) {
        logger.warn('[useModuleDashboardData] Section not found in database, returning empty data', {
          moduleNumber,
          courseId,
          error: sectionError?.message,
        });
        // Section not yet created in DB - show pending state with expected lessons
        const pendingLessons: LessonMatrixRow[] = Array.from({ length: expectedLessonCount }, (_, idx) => ({
          lessonId: `${moduleNumber}.${idx + 1}`,
          lessonNumber: idx + 1,
          title: section.lessons?.[idx]?.lesson_title || `Урок ${idx + 1}`,
          status: 'pending' as const,
          pipelineState: extractPipelineState('pending', null),
          qualityScore: null,
          costUsd: 0,
          durationMs: null,
          retryCount: 0,
          canRetry: false,
        }));

        setData({
          moduleId,
          moduleNumber,
          title: moduleTitle,
          status: 'pending',
          lessons: pendingLessons,
          aggregates: calculateAggregates(pendingLessons),
        });
        setIsLoading(false);
        return;
      }

      const sectionId = sectionData.id;

      // Step 2: Get lessons from lessons table
      const { data: lessonsData, error: lessonsError } = await supabase
        .from('lessons')
        .select('id, title, order_index')
        .eq('section_id', sectionId)
        .order('order_index', { ascending: true });

      if (fetchId !== fetchIdRef.current) return;

      if (lessonsError) {
        throw new Error(`Failed to fetch lessons: ${lessonsError.message}`);
      }

      const lessons = lessonsData || [];
      const lessonIds = lessons.map(l => l.id);

      logger.debug('[useModuleDashboardData] Fetched lessons from DB', {
        sectionId,
        lessonsCount: lessons.length,
        lessonIds,
      });

      // Step 3: Get lesson contents (only if we have lessons)
      let lessonContents: LessonContentRow[] = [];
      if (lessonIds.length > 0) {
        const { data: contentsData, error: contentsError } = await supabase
          .from('lesson_contents')
          .select('*')
          .eq('course_id', courseId)
          .in('lesson_id', lessonIds);

        if (fetchId !== fetchIdRef.current) return;

        if (contentsError) {
          throw new Error(`Failed to fetch lesson contents: ${contentsError.message}`);
        }

        lessonContents = contentsData || [];
      }

      // Build lesson matrix rows
      // Use lessons from DB if available, otherwise use expected count from course structure
      const lessonRows: LessonMatrixRow[] = [];

      if (lessons.length > 0) {
        // Use actual lessons from database
        for (const lesson of lessons) {
          const contentRow = lessonContents.find(c => c.lesson_id === lesson.id);
          const lessonNumber = lesson.order_index;
          const lessonTitle = lesson.title || section.lessons?.[lessonNumber - 1]?.lesson_title || `Урок ${lessonNumber}`;
          const lessonLabel = `${moduleNumber}.${lessonNumber}`;

          if (!contentRow) {
            lessonRows.push({
              lessonId: lessonLabel,
              lessonNumber,
              title: lessonTitle,
              status: 'pending' as const,
              pipelineState: extractPipelineState('pending', null),
              qualityScore: null,
              costUsd: 0,
              durationMs: null,
              retryCount: 0,
              canRetry: false,
            });
          } else {
            const status = mapLessonStatus(contentRow.status);
            const metadata = parseMetadata(contentRow.metadata);
            const pipelineState = extractPipelineState(contentRow.status, metadata);

            lessonRows.push({
              lessonId: lessonLabel,
              lessonNumber,
              title: lessonTitle,
              status,
              pipelineState,
              qualityScore: metadata?.quality_score ?? null,
              costUsd: metadata?.cost_usd ?? 0,
              durationMs: metadata?.generation_duration_ms ?? null,
              retryCount: contentRow.generation_attempt > 1 ? contentRow.generation_attempt - 1 : 0,
              canRetry: status === 'error',
            });
          }
        }
      } else {
        // No lessons in DB yet - show pending based on course structure
        for (let idx = 0; idx < expectedLessonCount; idx++) {
          const lessonNumber = idx + 1;
          const lessonTitle = section.lessons?.[idx]?.lesson_title || `Урок ${lessonNumber}`;
          const lessonLabel = `${moduleNumber}.${lessonNumber}`;

          lessonRows.push({
            lessonId: lessonLabel,
            lessonNumber,
            title: lessonTitle,
            status: 'pending' as const,
            pipelineState: extractPipelineState('pending', null),
            qualityScore: null,
            costUsd: 0,
            durationMs: null,
            retryCount: 0,
            canRetry: false,
          });
        }
      }

      // Calculate aggregates
      const aggregates = calculateAggregates(lessonRows);

      // Determine module status
      const moduleStatus = getModuleStatus(lessonRows);

      const dashboardData: ModuleDashboardData = {
        moduleId,
        moduleNumber,
        title: moduleTitle,
        status: moduleStatus,
        lessons: lessonRows,
        aggregates,
      };

      setData(dashboardData);

      logger.debug('Module dashboard data fetched', {
        moduleId,
        courseId,
        lessonsCount: lessonRows.length,
        status: moduleStatus,
      });
    } catch (err) {
      // Skip if a newer fetch was started
      if (fetchId !== fetchIdRef.current) return;

      const fetchError = err instanceof Error ? err : new Error('Ошибка загрузки данных');
      setError(fetchError);
      setData(null);

      // Log the actual error for debugging
      console.error('[useModuleDashboardData] Fetch error:', err);
      logger.error('Failed to fetch module dashboard data', {
        moduleId: moduleId || 'undefined',
        courseId: courseId || 'undefined',
        error: fetchError.message,
        stack: fetchError.stack,
      });
    } finally {
      // Skip if a newer fetch was started
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [shouldFetch, courseId, moduleId, courseStructure, getLessonCountForModule, supabase]);

  // Fetch on mount and when dependencies change
  useEffect(() => {
    fetchLessonData();
  }, [fetchLessonData]);

  // Set up realtime subscription
  useEffect(() => {
    if (!enableRealtime || !courseId || !moduleId) return;

    const expectedLessonCount = getLessonCountForModule(moduleId);
    if (expectedLessonCount === 0) return;

    logger.debug('Setting up realtime subscription for module', {
      moduleId,
      courseId,
      lessonCount: expectedLessonCount,
    });

    // Subscribe to changes in lesson_contents for this module
    const channel = supabase
      .channel(`module_dashboard:${moduleId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'lesson_contents',
          filter: `course_id=eq.${courseId}`,
        },
        (payload) => {
          const newRow = payload.new as Partial<LessonContentRow> | undefined;
          const oldRow = payload.old as Partial<LessonContentRow> | undefined;

          logger.debug('Realtime update received', {
            event: payload.eventType,
            lessonId: newRow?.lesson_id || oldRow?.lesson_id,
          });

          // Refetch data on any change
          fetchLessonData();
        }
      )
      .subscribe();

    return () => {
      logger.debug('Unsubscribing from realtime channel', { moduleId });
      channel.unsubscribe();
    };
  }, [enableRealtime, courseId, moduleId, getLessonCountForModule, fetchLessonData, supabase]);

  // Refetch function for manual refresh
  const refetch = useCallback(() => {
    fetchLessonData();
  }, [fetchLessonData]);

  return {
    data,
    isLoading,
    error,
    refetch,
  };
}
