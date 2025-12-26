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

// Define types locally for now as per plan
export type GenerationTrace = {
  id: string;
  course_id: string;
  lesson_id?: string;
  stage: 'stage_1' | 'stage_2' | 'stage_3' | 'stage_4' | 'stage_5' | 'stage_6';
  phase: string;
  step_name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input_data: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output_data: any;
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

  // Reusable fetch function
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

    // Use returns<T[]>() to explicitly request array response
    // This overrides any global Accept header that might request single object
    // Limit increased from 100 to 500 to ensure Stage 4/5 complete phases
    // are fetched even for courses with many Stage 6 lesson traces
    const { data, error } = await supabase
      .from('generation_trace')
      .select('*')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false })
      .limit(500)
      .returns<GenerationTrace[]>();

    if (error) {
      console.error('[RealtimeProvider] Failed to fetch traces:', error);
      console.error('[RealtimeProvider] Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return;
    }

    log(' Fetched traces:', data?.length || 0, 'items');

    if (data && data.length > 0) {
      setTraces(data);
      // Load historical traces into generation store (for page refresh)
      useGenerationStore.getState().loadFromTraces(data);
      log(' First trace:', data[0]);
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

  return (
    <GenerationRealtimeContext.Provider value={{ traces, status, isConnected, courseId, selectedTraceId, setSelectedTraceId, refetch: fetchTraces }}>
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
