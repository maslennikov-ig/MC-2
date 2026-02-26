/**
 * Admin Generation Monitoring Router
 * @module server/routers/admin/generation-monitoring
 *
 * Provides admin procedures for monitoring and controlling course generation.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import type { CourseStructure, Language } from '@megacampus/shared-types';
import { JobType } from '@megacampus/shared-types';
import { addJob } from '../../../orchestrator/queue';
import { validateLocale } from '@/shared/validation';

export const generationMonitoringRouter = router({
  /**
   * Get generation trace logs
   */
  getGenerationTrace: adminProcedure
    .input(
      z.object({
        courseId: z.string().uuid(),
        lessonId: z.string().uuid().optional(),
        stage: z.string().optional(),
        phase: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      try {
        const supabase = getSupabaseAdmin();
        let query = supabase
          .from('generation_trace')
          .select(
            'id, course_id, lesson_id, stage, phase, step_name, model_used, tokens_used, cost_usd, duration_ms, retry_attempt, was_cached, quality_score, temperature, error_data, created_at',
            { count: 'exact' }
          )
          .eq('course_id', input.courseId)
          .order('created_at', { ascending: false });

        if (input.lessonId) query = query.eq('lesson_id', input.lessonId);
        if (input.stage) query = query.eq('stage', input.stage);
        if (input.phase) query = query.eq('phase', input.phase);

        query = query.range(input.offset, input.offset + input.limit - 1);

        const { data, count, error } = await query;

        if (error) throw error;

        return {
          traces: data || [],
          totalCount: count || 0,
        };
      } catch (error) {
        logger.error({ error, input }, 'Failed to fetch generation traces');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch traces',
        });
      }
    }),

  /**
   * Get comprehensive course generation details
   */
  getCourseGenerationDetails: adminProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const supabase = getSupabaseAdmin();

        // Parallel queries for better performance
        const [courseRes, historyRes, lessonsRes, tracesRes] = await Promise.all([
          supabase.from('courses').select('*').eq('id', input.courseId).single(),
          supabase
            .from('generation_status_history')
            .select('*')
            .eq('course_id', input.courseId)
            .order('changed_at', { ascending: false }),
          supabase
            .from('lessons')
            .select(
              'id, title, order_index, lesson_type, status, created_at, lesson_contents(id, status, generation_attempt, created_at)'
            )
            .eq('course_id', input.courseId)
            .order('order_index', { ascending: true }),
          supabase
            .from('generation_trace')
            .select(
              'id, stage, phase, step_name, model_used, lesson_id, tokens_used, cost_usd, duration_ms, error_data, retry_attempt, quality_score, created_at'
            )
            .eq('course_id', input.courseId)
            .order('created_at', { ascending: false })
            .limit(20),
        ]);

        if (courseRes.error) throw courseRes.error;

        return {
          course: courseRes.data,
          history: historyRes.data || [],
          lessons: lessonsRes.data || [],
          recentTraces: tracesRes.data || [],
        };
      } catch (error) {
        logger.error({ error, courseId: input.courseId }, 'Failed to fetch generation details');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch generation details',
        });
      }
    }),

  /**
   * Trigger Stage 6 for a specific lesson
   */
  triggerStage6ForLesson: adminProcedure
    .input(z.object({ lessonId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      try {
        const supabase = getSupabaseAdmin();

        const { data: lesson } = await supabase
          .from('lessons')
          .select('*, courses(id, organization_id, user_id, course_structure, language)')
          .eq('id', input.lessonId)
          .single();

        if (!lesson || !lesson.courses) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Lesson not found' });
        }

        // Type assertion for joined course
        const courses = lesson.courses as unknown as {
          id: string;
          organization_id: string;
          user_id: string;
          course_structure: CourseStructure | null;
          language: string | null;
        };

        const courseStructure = courses.course_structure;
        interface LessonSpec {
          lesson_id: string;
          title: string;
          lesson_objectives?: string[];
          key_topics?: string[];
          sections: Array<{ title: string } & Record<string, unknown>>;
          metadata: Record<string, unknown>;
          [key: string]: unknown;
        }
        let lessonSpec: LessonSpec | null = null;

        if (courseStructure && courseStructure.sections) {
          for (const section of courseStructure.sections) {
            const found = section.lessons.find(l => l.lesson_title === lesson.title);
            if (found) {
              lessonSpec = {
                lesson_id: lesson.id,
                title: lesson.title,
                lesson_objectives: found.lesson_objectives || [],
                key_topics: found.key_topics || [],
                sections: [],
                metadata: {},
              };
              break;
            }
          }
        }

        if (!lessonSpec) {
          lessonSpec = {
            lesson_id: lesson.id,
            title: lesson.title,
            sections: [],
            metadata: {},
          };
        }

        const language = (courses.language || 'en') as Language;

        logger.info(
          {
            lessonId: input.lessonId,
            courseId: courses.id,
            language,
            triggeredBy: 'admin',
          },
          'Admin triggered Stage 6 generation'
        );

        await addJob(JobType.LESSON_CONTENT, {
          jobType: JobType.LESSON_CONTENT,
          organizationId: courses.organization_id,
          courseId: courses.id,
          userId: courses.user_id,
          createdAt: new Date().toISOString(),
          lessonSpec: lessonSpec,
          ragChunks: [],
          ragContextId: null,
          language,
          locale: validateLocale(language),
        });

        return { success: true, message: 'Lesson generation queued' };
      } catch (error) {
        logger.error({ error, lessonId: input.lessonId }, 'Failed to trigger Stage 6');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to trigger lesson generation',
        });
      }
    }),

  /**
   * Regenerate lesson with user refinement
   */
  regenerateLessonWithRefinement: adminProcedure
    .input(
      z.object({
        lessonId: z.string().uuid(),
        refinementType: z.enum(['fix', 'add', 'simplify', 'restructure', 'custom']),
        userInstructions: z.string().min(10).max(1000),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const supabase = getSupabaseAdmin();

        const { data: currentContent } = await supabase
          .from('lesson_contents')
          .select('id, generation_attempt')
          .eq('lesson_id', input.lessonId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        const nextAttempt = (currentContent?.generation_attempt || 0) + 1;

        const { error: updateError } = await supabase
          .from('lesson_contents')
          .update({
            status: 'pending',
            generation_attempt: nextAttempt,
            user_refinement_prompt: input.userInstructions,
            parent_content_id: currentContent?.id,
            updated_at: new Date().toISOString(),
          })
          .eq('lesson_id', input.lessonId);

        if (updateError) throw updateError;

        const { data: lesson } = await supabase
          .from('lessons')
          .select('*, courses(id, organization_id, user_id, language)')
          .eq('id', input.lessonId)
          .single();

        if (lesson && lesson.courses) {
          const courses = lesson.courses as unknown as {
            id: string;
            organization_id: string;
            user_id: string;
            language: string | null;
          };
          const language = (courses.language || 'en') as Language;

          logger.info(
            {
              lessonId: input.lessonId,
              courseId: courses.id,
              language,
              refinementType: input.refinementType,
              triggeredBy: 'admin',
            },
            'Admin triggered lesson regeneration with refinement'
          );

          await addJob(JobType.LESSON_CONTENT, {
            jobType: JobType.LESSON_CONTENT,
            organizationId: courses.organization_id,
            courseId: courses.id,
            userId: courses.user_id,
            createdAt: new Date().toISOString(),
            lessonSpec: {
              lesson_id: lesson.id,
              title: lesson.title,
              sections: [],
              metadata: {
                userRefinementPrompt: input.userInstructions,
              },
            },
            ragChunks: [],
            ragContextId: null,
            language,
            locale: validateLocale(language),
          });
        }

        return { success: true, attempt: nextAttempt };
      } catch (error) {
        logger.error({ error, input }, 'Failed to regenerate lesson');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to regenerate lesson',
        });
      }
    }),

  /**
   * Get generation history
   */
  getGenerationHistory: adminProcedure
    .input(
      z.object({
        organizationId: z.string().uuid().optional(),
        status: z
          .enum([
            'pending',
            'stage_2_init',
            'stage_2_processing',
            'stage_2_complete',
            'stage_2_awaiting_approval',
            'stage_3_init',
            'stage_3_summarizing',
            'stage_3_complete',
            'stage_3_awaiting_approval',
            'stage_4_init',
            'stage_4_analyzing',
            'stage_4_complete',
            'stage_4_awaiting_approval',
            'stage_5_init',
            'stage_5_generating',
            'stage_5_complete',
            'stage_5_awaiting_approval',
            'finalizing',
            'completed',
            'failed',
            'cancelled',
          ])
          .optional(),
        language: z.enum(['ru', 'en']).optional(),
        search: z
          .string()
          .max(100)
          .regex(/^[a-zA-Z0-9_\-. ]*$/, 'Invalid search characters')
          .optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      try {
        const supabase = getSupabaseAdmin();

        // Build query with specific columns, user join and organization
        let query = supabase
          .from('courses')
          .select(
            `
            id,
            slug,
            generation_code,
            title,
            generation_status,
            language,
            difficulty,
            generation_started_at,
            generation_completed_at,
            created_at,
            error_message,
            user_id,
            organizations!inner(slug)
          `,
            { count: 'exact' }
          )
          .not('generation_status', 'is', null)
          .order('created_at', { ascending: false });

        if (input.organizationId) query = query.eq('organization_id', input.organizationId);
        if (input.status) query = query.eq('generation_status', input.status);
        if (input.language) query = query.eq('language', input.language);

        // Enhanced search: search across generation_code and title
        // Safe: search is Zod-validated against /^[a-zA-Z0-9_\-. ]*$/ regex
        if (input.search) {
          query = query.or(`title.ilike.%${input.search}%,generation_code.ilike.%${input.search}%`);
        }

        query = query.range(input.offset, input.offset + input.limit - 1);

        const { data, count, error } = await query;

        if (error) throw error;

        // Fetch user emails for all courses
        const { data: users } = await supabase.auth.admin.listUsers();

        const userEmailMap = new Map(users?.users.map(u => [u.id, u.email || 'Unknown']) || []);

        // Combine course data with user emails and org_slug
        const coursesWithUsers = (data || []).map(course => {
          // Extract org_slug from joined organizations
          const orgData = course.organizations as { slug: string } | null;
          const { organizations: _orgs, ...courseWithoutOrg } = course;
          return {
            ...courseWithoutOrg,
            org_slug: orgData?.slug || 'default-organization',
            user_email: userEmailMap.get(course.user_id) || 'Unknown',
          };
        });

        return {
          courses: coursesWithUsers,
          totalCount: count || 0,
        };
      } catch (error) {
        logger.error({ error, input }, 'Failed to fetch generation history');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch history',
        });
      }
    }),

  /**
   * Export trace data
   */
  exportTraceData: adminProcedure
    .input(
      z.object({
        courseId: z.string().uuid(),
        format: z.enum(['json', 'csv']),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase
          .from('generation_trace')
          .select(
            'id, course_id, lesson_id, stage, phase, step_name, model_used, tokens_used, cost_usd, duration_ms, retry_attempt, was_cached, quality_score, temperature, error_data, input_data, output_data, created_at'
          )
          .eq('course_id', input.courseId)
          .order('created_at', { ascending: true });

        if (!data || data.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'No traces found' });
        }

        return {
          data,
          filename: `traces-${input.courseId}.${input.format}`,
        };
      } catch (error) {
        logger.error({ error, input }, 'Failed to export traces');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to export traces',
        });
      }
    }),

  /**
   * Get audit summary for a course — aggregated stats, model/stage/lesson breakdowns
   */
  getAuditSummary: adminProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const supabase = getSupabaseAdmin();

        const [rpcRes, courseRes, lessonsRes, lessonTracesRes] = await Promise.all([
          supabase.rpc('get_audit_summary', { p_course_id: input.courseId }),
          supabase
            .from('courses')
            .select(
              'title, generation_status, generation_started_at, generation_completed_at, generation_code'
            )
            .eq('id', input.courseId)
            .single(),
          supabase
            .from('lessons')
            .select('id, title, order_index')
            .eq('course_id', input.courseId)
            .order('order_index', { ascending: true }),
          // Lightweight query for lesson breakdown — only stage_6 with lesson_id
          supabase
            .from('generation_trace')
            .select('lesson_id, model_used, tokens_used, cost_usd, error_data')
            .eq('course_id', input.courseId)
            .eq('stage', 'stage_6')
            .not('lesson_id', 'is', null)
            .limit(5_000),
        ]);

        if (courseRes.error) throw courseRes.error;
        if (rpcRes.error) throw rpcRes.error;

        const rpcData = rpcRes.data as unknown as {
          totals: {
            traceCount: number;
            totalCost: number;
            totalTokens: number;
            errorCount: number;
            retryCount: number;
          };
          stageBreakdown: Array<{
            stage: string;
            calls: number;
            tokens: number;
            cost: number;
            duration: number;
            errors: number;
          }>;
          modelBreakdown: Array<{ model: string; calls: number; tokens: number; cost: number }>;
          filterOptions: { stages: string[]; phases: string[]; models: string[] };
        };

        const lessons = lessonsRes.data || [];
        const lessonMap = new Map(lessons.map(l => [l.id, l.title]));

        // Per-lesson breakdown from stage_6 traces
        const lessonTraces = lessonTracesRes.data || [];
        const lessonAggMap = new Map<
          string,
          {
            lessonTitle: string;
            calls: number;
            tokens: number;
            cost: number;
            models: Set<string>;
            errors: number;
          }
        >();
        for (const t of lessonTraces) {
          const lid = t.lesson_id!;
          const entry = lessonAggMap.get(lid) || {
            lessonTitle: lessonMap.get(lid) || lid,
            calls: 0,
            tokens: 0,
            cost: 0,
            models: new Set<string>(),
            errors: 0,
          };
          entry.calls++;
          entry.tokens += t.tokens_used || 0;
          entry.cost += t.cost_usd || 0;
          if (t.model_used) entry.models.add(t.model_used);
          if (t.error_data) entry.errors++;
          lessonAggMap.set(lid, entry);
        }
        const lessonBreakdown = Array.from(lessonAggMap.entries()).map(([lessonId, stats]) => ({
          lessonId,
          lessonTitle: stats.lessonTitle,
          calls: stats.calls,
          tokens: stats.tokens,
          cost: stats.cost,
          models: Array.from(stats.models),
          errors: stats.errors,
        }));

        // Build lesson filter options from traces that have lesson_id
        const tracedLessonIds = new Set(
          lessonTraces.map(t => t.lesson_id).filter(Boolean) as string[]
        );
        const lessonsWithTraces = lessons.filter(l => tracedLessonIds.has(l.id));

        return {
          course: courseRes.data,
          totals: rpcData.totals,
          stageBreakdown: rpcData.stageBreakdown,
          modelBreakdown: rpcData.modelBreakdown,
          lessonBreakdown,
          filterOptions: {
            ...rpcData.filterOptions,
            lessons: lessonsWithTraces,
          },
        };
      } catch (error) {
        logger.error({ error, courseId: input.courseId }, 'Failed to fetch audit summary');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch audit summary',
        });
      }
    }),

  /**
   * Get filtered traces for audit table (lightweight — no large text fields)
   */
  getAuditTraces: adminProcedure
    .input(
      z.object({
        courseId: z.string().uuid(),
        stage: z.string().optional(),
        phase: z.string().optional(),
        modelUsed: z.string().optional(),
        lessonId: z.string().uuid().optional(),
        hasError: z.boolean().optional(),
        hasRetry: z.boolean().optional(),
        search: z
          .string()
          .max(100)
          .regex(/^[a-zA-Z0-9_\-. ]*$/, 'Invalid search characters')
          .optional(),
        sortBy: z
          .enum(['created_at', 'tokens_used', 'cost_usd', 'duration_ms', 'stage', 'model_used'])
          .default('created_at'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      try {
        const supabase = getSupabaseAdmin();

        let query = supabase
          .from('generation_trace')
          .select(
            'id, stage, phase, step_name, model_used, lesson_id, tokens_used, cost_usd, duration_ms, error_data, retry_attempt, quality_score, temperature, was_cached, created_at',
            { count: 'exact' }
          )
          .eq('course_id', input.courseId)
          .order(input.sortBy, { ascending: input.sortOrder === 'asc' });

        if (input.stage) query = query.eq('stage', input.stage);
        if (input.phase) query = query.eq('phase', input.phase);
        if (input.modelUsed) query = query.eq('model_used', input.modelUsed);
        if (input.lessonId) query = query.eq('lesson_id', input.lessonId);
        if (input.hasError) query = query.not('error_data', 'is', null);
        if (input.hasRetry) query = query.gt('retry_attempt', 0);
        if (input.search) {
          query = query.or(`phase.ilike.%${input.search}%,step_name.ilike.%${input.search}%`);
        }

        query = query.range(input.offset, input.offset + input.limit - 1);

        const { data, count, error } = await query;
        if (error) throw error;

        return {
          traces: data || [],
          totalCount: count || 0,
        };
      } catch (error) {
        logger.error({ error, courseId: input.courseId }, 'Failed to fetch audit traces');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch audit traces',
        });
      }
    }),

  /**
   * Get full trace detail by ID (for audit detail sheet)
   */
  getAuditTraceDetail: adminProcedure
    .input(
      z.object({
        traceId: z.string().uuid(),
        courseId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('generation_trace')
          .select(
            'id, stage, phase, step_name, model_used, lesson_id, tokens_used, cost_usd, duration_ms, quality_score, temperature, retry_attempt, was_cached, error_data, input_data, output_data, prompt_text, completion_text, created_at'
          )
          .eq('id', input.traceId)
          .eq('course_id', input.courseId)
          .single();

        if (error) throw error;
        return data;
      } catch (error) {
        logger.error({ error, traceId: input.traceId }, 'Failed to fetch trace detail');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch trace detail',
        });
      }
    }),

  /**
   * Finalize course generation
   *
   * Transitions course from 'stage_5_complete' (paused) to 'completed'.
   */
  finalizeCourse: adminProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      try {
        const supabase = getSupabaseAdmin();

        // 1. Update to finalizing
        await supabase
          .from('courses')
          .update({ generation_status: 'finalizing' })
          .eq('id', input.courseId);

        // 2. Update to completed and published
        const { error } = await supabase
          .from('courses')
          .update({
            generation_status: 'completed',
            status: 'published',
            generation_completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.courseId);

        if (error) throw error;

        return { success: true };
      } catch (error) {
        logger.error({ error, courseId: input.courseId }, 'Failed to finalize course');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to finalize course',
        });
      }
    }),
});

export type GenerationMonitoringRouter = typeof generationMonitoringRouter;
