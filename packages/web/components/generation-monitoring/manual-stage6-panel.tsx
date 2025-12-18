'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSupabase } from '@/lib/supabase/browser-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Play, CheckCircle, AlertCircle, RotateCcw, ArrowRight, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { finalizeCourse, triggerStage6ForLesson } from '@/app/actions/admin-generation';
import { useGenerationRealtime } from './realtime-provider';
import { RefinementModal } from './refinement-modal';

type LessonWithContent = {
  id: string;
  title: string;
  order_index: number;
  lesson_contents: {
    id: string;
    status: string;
    generation_attempt: number;
  }[];
};

export function ManualStage6Panel() {
  const { courseId, status } = useGenerationRealtime();
  const { supabase } = useSupabase();
  const [lessons, setLessons] = useState<LessonWithContent[]>([]);
  const [loading, setLoading] = useState(false);
  const [isLoadingLessons, setIsLoadingLessons] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLessons = useCallback(async () => {
    try {
      setIsLoadingLessons(true);
      setError(null);

      const { data, error } = await supabase
        .from('lessons')
        .select('id, title, order_index, lesson_contents(id, status, generation_attempt)')
        .eq('course_id', courseId)
        .order('order_index', { ascending: true });

      if (error) {
        setError('Failed to load lessons');
        toast.error('Failed to load lessons');
        return;
      }

      setLessons(data as unknown as LessonWithContent[]); // Type cast due to join structure
    } catch (err) {
      setError('An unexpected error occurred');
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoadingLessons(false);
    }
  }, [courseId, supabase]);

  useEffect(() => {
    fetchLessons();

    const channel = supabase
      .channel(`manual-stage6:${courseId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lesson_contents',
        },
        () => {
          fetchLessons();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [courseId, supabase, fetchLessons]);

  const handleGenerate = async (lessonId: string) => {
    try {
      toast.loading('Queueing generation...');
      await triggerStage6ForLesson(lessonId);
      toast.dismiss();
      toast.success('Generation queued');
    } catch (error) {
      void error;
      toast.dismiss();
      toast.error('Failed to trigger generation');
    }
  };

  const handleFinalize = async () => {
    try {
      setLoading(true);
      await finalizeCourse(courseId);
      toast.success('Course finalized');
    } catch (error) {
      void error;
      toast.error('Failed to finalize course');
    } finally {
      setLoading(false);
    }
  };

  const isPaused = ['stage_5_complete', 'stage_6_init', 'stage_6_generating', 'stage_6_complete', 'stage_6_awaiting_approval'].includes(status as string);

  return (
    <Card className="h-full flex flex-col border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
      <CardHeader className="border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-slate-900 dark:text-slate-100">Stage 6: Lesson Content</CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">Manual control for lesson generation</CardDescription>
          </div>
          {isPaused && (
            <Button
              onClick={handleFinalize}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white shadow-sm"
            >
              {loading ? 'Finalizing...' : 'Complete Course'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {isLoadingLessons ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400 dark:text-slate-500" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading lessons...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <AlertCircle className="h-8 w-8 text-red-500 dark:text-red-400" />
              <p className="text-sm text-slate-600 dark:text-slate-400">{error}</p>
              <Button
                onClick={fetchLessons}
                variant="outline"
                size="sm"
                className="border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          </div>
        ) : lessons.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-slate-500 dark:text-slate-400">No lessons found</p>
          </div>
        ) : (
          <ScrollArea className="h-full pr-4">
            <div className="space-y-3">
              {lessons.map((lesson) => {
              const content = lesson.lesson_contents?.[0];
              const status = content?.status || 'pending';
              
              return (
                <div
                  key={lesson.id}
                  className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-sm">
                      {lesson.order_index + 1}
                    </div>
                    <div>
                      <div className="font-medium text-sm text-slate-900 dark:text-slate-100">{lesson.title}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                        {status.replace('_', ' ')}
                        {content?.generation_attempt > 1 && ` (Attempt ${content.generation_attempt})`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {status === 'completed' ? (
                      <Badge variant="outline" className="bg-green-500/10 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-500/20 dark:border-green-500/30">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Ready
                      </Badge>
                    ) : status === 'failed' ? (
                      <Badge variant="destructive" className="bg-red-500/10 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-500/20 dark:border-red-500/30">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Failed
                      </Badge>
                    ) : status === 'generating' || status === 'processing' ? (
                      <Badge variant="secondary" className="animate-pulse bg-blue-500/10 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-500/20 dark:border-blue-500/30">
                        Generating...
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700">Pending</Badge>
                    )}

                    <RefinementModal
                      lessonId={lesson.id}
                      lessonTitle={lesson.title}
                    />

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleGenerate(lesson.id)}
                      disabled={status === 'generating' || status === 'processing'}
                      className="hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      {status === 'completed' ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              );
            })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
