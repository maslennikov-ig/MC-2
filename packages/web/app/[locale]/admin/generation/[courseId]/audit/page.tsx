import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { Locale } from '@/src/i18n/config'
import { Link } from '@/src/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { AuditClient } from '@/components/generation-audit/audit-client'

interface PageProps {
  params: Promise<{ locale: Locale; courseId: string }>
}

export default async function AdminGenerationAuditPage({ params }: PageProps) {
  const { locale, courseId } = await params
  setRequestLocale(locale)
  // Admin client bypasses RLS for cross-org admin access
  const supabase = await createAdminClient()

  const { data: course, error } = await supabase
    .from('courses')
    .select('id, slug, title, generation_status, generation_code')
    .eq('id', courseId)
    .single()

  if (error || !course) {
    return notFound()
  }

  return (
    <div className="flex flex-col space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/admin/generation/${courseId}`}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{course.title}</h1>
          {course.generation_code && (
            <Badge variant="outline" className="font-mono text-xs">
              {course.generation_code}
            </Badge>
          )}
        </div>
      </div>

      <Separator />

      <AuditClient courseId={courseId} />
    </div>
  )
}
