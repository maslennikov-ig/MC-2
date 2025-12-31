import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Locale } from '@/src/i18n/config';
import Link from 'next/link';
import { GenerationRealtimeProvider } from '@/components/generation-monitoring/realtime-provider';
import { GenerationTimeline } from '@/components/generation-monitoring/generation-timeline';
import { GenerationOverviewPanel } from '@/components/generation-monitoring/generation-overview-panel';
import { TraceViewer } from '@/components/generation-monitoring/trace-viewer';
import { ManualStage6Panel } from '@/components/generation-monitoring/manual-stage6-panel';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { GitBranch } from 'lucide-react';
import { CourseStatus } from '@/types/course-generation';

interface PageProps {
  params: Promise<{
    locale: Locale;
    courseId: string;
  }>;
}

export default async function AdminGenerationPage({ params }: PageProps) {
  const { locale, courseId } = await params;
  setRequestLocale(locale); // Enable static rendering
  const supabase = await createClient();

  // Fetch course details
  const { data: course, error } = await supabase
    .from('courses')
    .select('id, slug, title, generation_status')
    .eq('id', courseId)
    .single();

  if (error || !course) {
    return notFound();
  }

  return (
    <GenerationRealtimeProvider courseId={courseId} initialStatus={course.generation_status as CourseStatus}>
      <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{course.title}</h1>
            <p className="text-muted-foreground">
              Monitoring generation process and tracing execution steps.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/courses/generating/${course.slug || course.id}?workflow=true`} target="_blank">
              <GitBranch className="w-4 h-4 mr-2" />
              Конструктор курса
            </Link>
          </Button>
        </div>
        
        <Separator />

        <GenerationOverviewPanel />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
          <div className="lg:col-span-2 h-full flex flex-col min-h-0">
            <Tabs defaultValue="traces" className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <TabsList>
                  <TabsTrigger value="traces">Trace Viewer</TabsTrigger>
                  <TabsTrigger value="stage6">Stage 6 Control</TabsTrigger>
                </TabsList>
              </div>
              
              <TabsContent value="traces" className="flex-1 min-h-0 mt-0">
                <div className="h-full rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
                  <TraceViewer />
                </div>
              </TabsContent>
              
              <TabsContent value="stage6" className="flex-1 min-h-0 mt-0">
                <div className="h-full">
                  <ManualStage6Panel />
                </div>
              </TabsContent>
            </Tabs>
          </div>
          
          <div className="h-full overflow-y-auto pr-2 pb-6">
            <GenerationTimeline />
          </div>
        </div>
      </div>
    </GenerationRealtimeProvider>
  );
}
