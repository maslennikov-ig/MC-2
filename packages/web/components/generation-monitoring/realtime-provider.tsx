'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from 'react';
import { useSupabase } from '@/lib/supabase/browser-client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { CourseStatus } from '@/types/course-generation';
import { useGenerationStore } from '@/stores/useGenerationStore';

// Conditional logging - only in development
const isDev = process.env.NODE_ENV === 'development';
const log = (...args: unknown[]): void => {
  if (isDev) console.log('[RealtimeProvider]', ...args);
};

// Lightweight trace for graph rendering (no heavy JSONB)
// Uses idx_trace_skeleton for Index-Only Scan
export type SkeletonTrace = {
  id: string;
  course_id: string;
  lesson_id?: string;
  stage: 'stage_1' | 'stage_2' | 'stage_3' | 'stage_4' | 'stage_5' | 'stage_6';
  phase: string;
  step_name: string;
  duration_ms?: number;
  tokens_used?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error_data?: any; // Keep for error detection
  created_at: string;
  retry_attempt?: number;
  // Heavy fields NOT included: input_data, output_data, prompt_text, completion_text
};

// Critical trace with output_data (for Stage 4/5 complete phases)
export type CriticalTrace = {
  id: string;
  stage: string;
  phase: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output_data: any;
};

// Full trace (for on-demand loading)
export type GenerationTrace = {
  id: string;
  course_id: string;
  lesson_id?: string;
  stage: 'stage_1' | 'stage_2' | 'stage_3' | 'stage_4' | 'stage_5' | 'stage_6';
  phase: string;
  step_name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input_data?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output_data?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error_data?: any;
  model_used?: string;
  prompt_text?: string;
  completion_text?: string;
  tokens_used?: number;
  cost_usd?: number;
  temperature?: number;
  duration_ms?: number;
  retry_attempt?: number;
  was_cached?: boolean;
  quality_score?: number;
  created_at: string;
};

type GenerationRealtimeContextType = {
  traces: GenerationTrace[];
  status: CourseStatus | null;
  isConnected: boolean;
  courseId: string;
  selectedTraceId: string | null;
  setSelectedTraceId: (id: string | null) => void;
  refetch: () => Promise<void>;
  /** Lazy load full trace data (input_data, output_data, etc.) for a specific trace */
  fetchTraceDetails: (traceId: string) => Promise<GenerationTrace | null>;
};

const GenerationRealtimeContext = createContext<GenerationRealtimeContextType | undefined>(undefined);

export function GenerationRealtimeProvider({
  children,
  courseId,
  initialStatus = 'initializing',
}: {
  children: ReactNode;
  courseId: string;
  initialStatus?: CourseStatus;
}) {
  const { supabase, session, isLoading } = useSupabase();
  const [traces, setTraces] = useState<GenerationTrace[]>([]);
  const [status, setStatus] = useState<CourseStatus | null>(initialStatus);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Initialize generation store with courseId
  useEffect(() => {
    if (courseId) {
      useGenerationStore.getState().setCourseId(courseId);
    }
  }, [courseId]);

  // Reusable fetch function - uses skeleton + critical data pattern
  // This fetches ALL traces with lightweight columns, plus Stage 4/5 output_data
  const fetchTraces = useCallback(async () => {
    if (!courseId) return;

    // Wait for auth to be ready
    if (isLoading) {
      log(' Waiting for auth to load...');
      return;
    }

    if (!session) {
      log(' No session available, skipping fetch');
      return;
    }

    log(' Fetching traces for courseId:', courseId, 'user:', session.user.id);

    // Execute both queries in parallel for 2x faster load (~100ms vs ~200ms)
    // Uses idx_trace_skeleton for skeleton query (Index-Only Scan)
    // Uses idx_trace_critical_phases for critical query (partial index)
    const skeletonColumns = 'id,course_id,lesson_id,stage,phase,step_name,duration_ms,tokens_used,error_data,created_at,retry_attempt';

    const [skeletonResult, criticalResult] = await Promise.all([
      // Query 1: Skeleton traces (ALL rows, lightweight columns only, ~100KB for 2000 rows)
      supabase
        .from('generation_trace')
        .select(skeletonColumns)
        .eq('course_id', courseId)
        .order('created_at', { ascending: false })
        .returns<SkeletonTrace[]>(),
      // Query 2: Critical data (Stage 4/5 complete phases, ~2 rows, ~50KB)
      supabase
        .from('generation_trace')
        .select('id, stage, phase, output_data')
        .eq('course_id', courseId)
        .in('stage', ['stage_4', 'stage_5'])
        .eq('phase', 'complete')
        .returns<CriticalTrace[]>(),
    ]);

    const { data: skeletonData, error: skeletonError } = skeletonResult;
    const { data: criticalData, error: criticalError } = criticalResult;

    if (skeletonError) {
      console.error('[RealtimeProvider] Failed to fetch skeleton traces:', skeletonError);
      console.error('[RealtimeProvider] Error details:', {
        message: skeletonError.message,
        code: skeletonError.code,
        details: skeletonError.details,
        hint: skeletonError.hint,
      });
      return;
    }

    if (criticalError) {
      console.error('[RealtimeProvider] Failed to fetch critical traces:', criticalError);
      // Continue with skeleton data even if critical fails
    }

    log(' Fetched skeleton traces:', skeletonData?.length || 0, 'items');
    log(' Fetched critical traces:', criticalData?.length || 0, 'items');

    // Merge critical output_data into skeleton traces
    const criticalMap = new Map(
      (criticalData || []).map(t => [t.id, t.output_data])
    );

    const mergedTraces: GenerationTrace[] = (skeletonData || []).map(skeleton => ({
      ...skeleton,
      input_data: undefined,  // Will be lazy-loaded on demand
      output_data: criticalMap.get(skeleton.id) || undefined,
      model_used: undefined,
      prompt_text: undefined,
      completion_text: undefined,
      cost_usd: undefined,
      temperature: undefined,
      was_cached: undefined,
      quality_score: undefined,
    }));

    if (mergedTraces.length > 0) {
      setTraces(mergedTraces);
      // Load historical traces into generation store (for page refresh)
      useGenerationStore.getState().loadFromTraces(mergedTraces);
      log(' First trace:', mergedTraces[0]);
    } else {
      setTraces([]);
      log(' No traces found for this course');
    }
  }, [courseId, supabase, isLoading, session]);

  // Initial fetch of existing traces - wait for session
  useEffect(() => {
    if (!isLoading && session) {
      fetchTraces();
    }
  }, [fetchTraces, isLoading, session]);

  // Realtime subscription for new traces
  useEffect(() => {
    if (!courseId) return;

    // Wait for auth to be ready
    if (isLoading || !session) {
      log(' Waiting for auth before setting up subscription');
      return;
    }

    log(' Setting up realtime subscription for courseId:', courseId, 'user:', session.user.id);

    // Cleanup previous subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`generation-monitoring:${courseId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'generation_trace',
          filter: `course_id=eq.${courseId}`,
        },
        (payload) => {
          log(' Received new trace:', payload.new);
          // New traces from realtime arrive with FULL data (not skeleton)
          // Skeleton pattern only applies to historical bulk load
          const newTrace = payload.new as GenerationTrace;
          setTraces((prev) => [newTrace, ...prev]);

          // Update generation store with new trace
          useGenerationStore.getState().addTrace(newTrace);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'courses',
          filter: `id=eq.${courseId}`,
        },
        (payload) => {
          log(' Course updated:', payload.new);
          const newStatus = payload.new.generation_status as CourseStatus;
          if (newStatus) {
            setStatus(newStatus);
            if (newStatus === 'failed') {
              toast.error('Generation failed');
            } else if (newStatus === 'completed') {
              toast.success('Generation completed successfully');
            }
          }
        }
      )
      .subscribe((status) => {
        log(' Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          log(' Successfully subscribed to realtime channel');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setIsConnected(false);
          // Note: CLOSED is normal during React Strict Mode double-invoke in development
          log(' Channel status:', status);
        }
      });

    channelRef.current = channel;

    return () => {
      const channel = channelRef.current;

      if (channel) {
        try {
          // Proper cleanup: unsubscribe first, then remove channel
          channel.unsubscribe();
          supabase.removeChannel(channel);
        } catch (error) {
          console.error('[RealtimeProvider] Cleanup error:', error);
        } finally {
          channelRef.current = null;
          setIsConnected(false);
        }
      }
    };
  }, [courseId, supabase, isLoading, session]);

  // Lazy load full trace data for a specific trace (on-demand when user clicks node)
  const fetchTraceDetails = useCallback(async (traceId: string): Promise<GenerationTrace | null> => {
    if (!traceId) return null;

    // Check if trace is already fully loaded (deduplication)
    const existing = traces.find(t => t.id === traceId);
    if (existing?.input_data !== undefined && existing?.output_data !== undefined) {
      log(' Trace details already loaded:', traceId);
      return existing;
    }

    log(' Fetching trace details for:', traceId);

    const { data, error } = await supabase
      .from('generation_trace')
      .select('*')
      .eq('id', traceId)
      .single();

    if (error) {
      console.error('[RealtimeProvider] Failed to fetch trace details:', error);
      return null;
    }

    if (!data) return null;

    // Convert Supabase null values to undefined for our type
    const trace: GenerationTrace = {
      id: data.id,
      course_id: data.course_id,
      lesson_id: data.lesson_id ?? undefined,
      stage: data.stage as GenerationTrace['stage'],
      phase: data.phase,
      step_name: data.step_name,
      input_data: data.input_data ?? undefined,
      output_data: data.output_data ?? undefined,
      error_data: data.error_data ?? undefined,
      model_used: data.model_used ?? undefined,
      prompt_text: data.prompt_text ?? undefined,
      completion_text: data.completion_text ?? undefined,
      tokens_used: data.tokens_used ?? undefined,
      cost_usd: data.cost_usd ?? undefined,
      temperature: data.temperature ?? undefined,
      duration_ms: data.duration_ms ?? undefined,
      retry_attempt: data.retry_attempt ?? undefined,
      was_cached: data.was_cached ?? undefined,
      quality_score: data.quality_score ?? undefined,
      created_at: data.created_at,
    };

    // Update the trace in state with full data
    setTraces(prev => prev.map(t =>
      t.id === traceId ? { ...t, ...trace } : t
    ));
    log(' Trace details loaded:', traceId);

    return trace;
  }, [supabase, traces]);

  return (
    <GenerationRealtimeContext.Provider value={{
      traces,
      status,
      isConnected,
      courseId,
      selectedTraceId,
      setSelectedTraceId,
      refetch: fetchTraces,
      fetchTraceDetails,
    }}>
      {children}
    </GenerationRealtimeContext.Provider>
  );
}

export function useGenerationRealtime() {
  const context = useContext(GenerationRealtimeContext);
  if (context === undefined) {
    throw new Error('useGenerationRealtime must be used within a GenerationRealtimeProvider');
  }
  return context;
}
