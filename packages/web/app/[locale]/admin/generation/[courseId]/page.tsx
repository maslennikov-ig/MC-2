import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { Locale } from '@/src/i18n/config'
import { Link } from '@/src/i18n/navigation'
import { GenerationRealtimeProvider } from '@/components/generation-monitoring/realtime-provider'
import { GenerationTimeline } from '@/components/generation-monitoring/generation-timeline'
import { GenerationOverviewPanel } from '@/components/generation-monitoring/generation-overview-panel'
import { TraceViewer } from '@/components/generation-monitoring/trace-viewer'
import { ManualStage6Panel } from '@/components/generation-monitoring/manual-stage6-panel'
import { AdminClarifyingTab } from '@/components/generation-monitoring/admin-clarifying-tab'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { GitBranch } from 'lucide-react'
import { CourseStatus } from '@/types/course-generation'
import { buildCourseGeneratingUrl } from '@/lib/helpers/course-urls'

interface PageProps {
  params: Promise<{
    locale: Locale
    courseId: string
  }>
}

export default async function AdminGenerationPage({ params }: PageProps) {
  const { locale, courseId } = await params
  setRequestLocale(locale) // Enable static rendering
  const supabase = await createClient()

  // Fetch course details with organization
  const { data: course, error } = await supabase
    .from('courses')
    .select('id, slug, title, generation_status, organizations!inner(slug)')
    .eq('id', courseId)
    .single()

  if (error || !course) {
    return notFound()
  }

  // Extract org_slug from joined organization
  const orgData = course.organizations as { slug: string } | null
  const orgSlug = orgData?.slug || 'default-organization'

  return (
    <GenerationRealtimeProvider
      courseId={courseId}
      initialStatus={course.generation_status as CourseStatus}
    >
      <div className="flex h-[calc(100vh-100px)] flex-col space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{course.title}</h1>
            <p className="text-muted-foreground">
              Monitoring generation process and tracing execution steps.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link
              href={buildCourseGeneratingUrl(orgSlug, course.slug || course.id, true)}
              target="_blank"
            >
              <GitBranch className="mr-2 h-4 w-4" />
              Конструктор курса
            </Link>
          </Button>
        </div>

        <Separator />

        <GenerationOverviewPanel />

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex h-full min-h-0 flex-col lg:col-span-2">
            <Tabs defaultValue="traces" className="flex h-full flex-col">
              <div className="mb-4 flex items-center justify-between">
                <TabsList>
                  <TabsTrigger value="traces">Trace Viewer</TabsTrigger>
                  <TabsTrigger value="clarifying">Clarifying Q&A</TabsTrigger>
                  <TabsTrigger value="stage6">Stage 6 Control</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="traces" className="mt-0 min-h-0 flex-1">
                <div className="bg-card text-card-foreground h-full overflow-hidden rounded-xl border shadow">
                  <TraceViewer />
                </div>
              </TabsContent>

              <TabsContent value="clarifying" className="mt-0 min-h-0 flex-1">
                <div className="h-full">
                  <AdminClarifyingTab />
                </div>
              </TabsContent>

              <TabsContent value="stage6" className="mt-0 min-h-0 flex-1">
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
  )
}
