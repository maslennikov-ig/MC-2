'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AlertCircle, FileText, Loader2 } from 'lucide-react'
import {
  COURSE_SIZES,
  COURSE_STYLES,
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  getAllCourseSizeLabels,
  type CourseSize,
  type CourseStyle,
  type Language,
} from '@megacampus/shared-types'

import {
  createCourseFromPlaybook,
  previewCourseFromPlaybook,
} from '@/components/career-playbook/library/client-adapter'
import type { PreviewCourseFromPlaybookResult } from '@/components/career-playbook/library/types'
import { MarkdownRendererFull } from '@/components/markdown/MarkdownRendererFull'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

interface CreateCourseFromPlaybookDialogProps {
  playbookId: string
  trigger: ReactNode
}

interface CourseDraftState {
  title: string
  courseDescription: string
  targetAudience: string
  learningOutcomesText: string
  language: Language
  courseSize: CourseSize
  style: CourseStyle
}

type DescriptionMode = 'preview' | 'edit'

function draftFromPreview(preview: PreviewCourseFromPlaybookResult): CourseDraftState {
  return {
    title: preview.brief.title,
    courseDescription: preview.brief.courseDescription,
    targetAudience: preview.brief.targetAudience,
    learningOutcomesText: preview.brief.learningOutcomes.join('\n'),
    language: preview.brief.language,
    courseSize: preview.brief.courseSize,
    style: preview.brief.style,
  }
}

function learningOutcomesFromText(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function CreateCourseFromPlaybookDialog({
  playbookId,
  trigger,
}: CreateCourseFromPlaybookDialogProps) {
  const router = useRouter()
  const t = useTranslations('career-playbook.library.createCourseDialog')
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<PreviewCourseFromPlaybookResult | null>(null)
  const [draft, setDraft] = useState<CourseDraftState | null>(null)
  const [includeWebResearch, setIncludeWebResearch] = useState(false)
  const [includeBusinessContextSources, setIncludeBusinessContextSources] = useState(false)
  const [descriptionMode, setDescriptionMode] = useState<DescriptionMode>('preview')
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [previewRequestVersion, setPreviewRequestVersion] = useState(0)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const courseSizeLabels = draft ? getAllCourseSizeLabels(draft.language) : null

  useEffect(() => {
    if (!open || preview) return

    let cancelled = false
    setIsPreviewLoading(true)
    setPreviewError(null)
    setError(null)

    void previewCourseFromPlaybook({ playbookId })
      .then((result) => {
        if (cancelled) return
        setPreview(result)
        setDraft(draftFromPreview(result))
        setIncludeWebResearch(result.defaults.includeWebResearch)
        setIncludeBusinessContextSources(result.defaults.includeBusinessContextSources)
        setDescriptionMode('preview')
      })
      .catch((unknownError) => {
        if (cancelled) return
        setPreviewError(unknownError instanceof Error ? unknownError.message : t('genericError'))
      })
      .finally(() => {
        if (!cancelled) setIsPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, playbookId, preview, previewRequestVersion, t])

  const handleCreateCourse = async () => {
    if (isSubmitting || !draft) return

    setIsSubmitting(true)
    setError(null)

    try {
      const result = await createCourseFromPlaybook({
        playbookId,
        includeWebResearch,
        includeBusinessContextSources,
        overrides: {
          title: draft.title.trim(),
          courseDescription: draft.courseDescription.trim(),
          targetAudience: draft.targetAudience.trim(),
          learningOutcomes: learningOutcomesFromText(draft.learningOutcomesText),
          language: draft.language,
          courseSize: draft.courseSize,
          style: draft.style,
        },
      })
      router.push(result.redirectUrl)
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : t('genericError'))
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSubmitting) return
        setOpen(nextOpen)
        if (!nextOpen) {
          setError(null)
          setPreviewError(null)
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {isPreviewLoading ? (
          <div className="career-playbook-muted-card flex items-center gap-2 p-4 text-sm text-slate-700 dark:text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t('loadingPreview')}
          </div>
        ) : null}

        {previewError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden />
            <AlertTitle>{t('previewErrorTitle')}</AlertTitle>
            <AlertDescription className="grid gap-3">
              <span>{previewError}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit rounded-md"
                onClick={() => {
                  setPreview(null)
                  setPreviewRequestVersion((version) => version + 1)
                }}
              >
                {t('retryPreview')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {draft && preview ? (
          <div className="grid gap-5">
            <div className="career-playbook-muted-card flex items-start gap-3 p-4">
              <FileText className="mt-0.5 h-4 w-4 text-slate-500" aria-hidden />
              <div className="grid gap-1 text-sm">
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {t('roleGuideSourceTitle')}
                </span>
                <span className="text-slate-600 dark:text-slate-300">
                  {t('roleGuideSourceDescription')}
                </span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="career-playbook-course-title">{t('titleLabel')}</Label>
                <Input
                  id="career-playbook-course-title"
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, title: event.target.value } : current
                    )
                  }
                />
              </div>

              <div className="grid gap-2 md:col-span-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Label htmlFor="career-playbook-course-description">
                    {t('descriptionLabel')}
                  </Label>
                  <Tabs
                    value={descriptionMode}
                    onValueChange={(value) => setDescriptionMode(value as DescriptionMode)}
                    className="w-full sm:w-auto"
                  >
                    <TabsList className="grid w-full grid-cols-2 sm:w-auto">
                      <TabsTrigger value="preview">{t('descriptionPreviewTab')}</TabsTrigger>
                      <TabsTrigger value="edit">{t('descriptionEditTab')}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                {descriptionMode === 'preview' ? (
                  <div
                    data-testid="career-playbook-course-description-preview"
                    className="border-input max-h-80 min-h-28 overflow-y-auto rounded-md border bg-slate-50/70 px-4 py-3 dark:bg-slate-950/30"
                  >
                    <MarkdownRendererFull
                      content={draft.courseDescription}
                      preset="minimal"
                      language={draft.language}
                    />
                  </div>
                ) : (
                  <Textarea
                    id="career-playbook-course-description"
                    value={draft.courseDescription}
                    className="min-h-28"
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, courseDescription: event.target.value } : current
                      )
                    }
                  />
                )}
              </div>

              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="career-playbook-course-audience">{t('targetAudienceLabel')}</Label>
                <Input
                  id="career-playbook-course-audience"
                  value={draft.targetAudience}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, targetAudience: event.target.value } : current
                    )
                  }
                />
              </div>

              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="career-playbook-course-outcomes">
                  {t('learningOutcomesLabel')}
                </Label>
                <Textarea
                  id="career-playbook-course-outcomes"
                  value={draft.learningOutcomesText}
                  aria-describedby="career-playbook-course-outcomes-help"
                  className="min-h-24"
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, learningOutcomesText: event.target.value } : current
                    )
                  }
                />
                <p
                  id="career-playbook-course-outcomes-help"
                  className="text-xs text-slate-500 dark:text-slate-400"
                >
                  {t('learningOutcomesHelp')}
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="career-playbook-course-language">{t('languageLabel')}</Label>
                <select
                  id="career-playbook-course-language"
                  value={draft.language}
                  className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 py-2 text-sm focus-visible:ring-1 focus-visible:outline-none"
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, language: event.target.value as Language } : current
                    )
                  }
                >
                  {SUPPORTED_LANGUAGES.map((language) => (
                    <option key={language} value={language}>
                      {LANGUAGE_NAMES[language]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="career-playbook-course-size">{t('courseSizeLabel')}</Label>
                <select
                  id="career-playbook-course-size"
                  value={draft.courseSize}
                  className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 py-2 text-sm focus-visible:ring-1 focus-visible:outline-none"
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, courseSize: event.target.value as CourseSize }
                        : current
                    )
                  }
                >
                  {COURSE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {courseSizeLabels
                        ? `${courseSizeLabels[size].title} (${courseSizeLabels[size].subtitle})`
                        : size}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="career-playbook-course-style">{t('styleLabel')}</Label>
                <select
                  id="career-playbook-course-style"
                  value={draft.style}
                  className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 py-2 text-sm focus-visible:ring-1 focus-visible:outline-none"
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, style: event.target.value as CourseStyle } : current
                    )
                  }
                >
                  {COURSE_STYLES.map((style) => (
                    <option key={style} value={style}>
                      {t(`styleOptions.${style}` as never)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <section className="grid gap-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('sourcesTitle')}
              </h3>
              <div className="grid gap-3">
                <label
                  htmlFor="career-playbook-course-web-research"
                  className="career-playbook-muted-card flex cursor-pointer items-start gap-3 p-3"
                >
                  <Checkbox
                    id="career-playbook-course-web-research"
                    aria-label={t('webResearchLabel')}
                    checked={includeWebResearch}
                    onCheckedChange={(checked) => setIncludeWebResearch(Boolean(checked))}
                  />
                  <span className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {t('webResearchLabel')}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {t('webResearchDescription')}
                    </span>
                  </span>
                </label>

                <label
                  htmlFor="career-playbook-course-business-context"
                  className="career-playbook-muted-card flex cursor-pointer items-start gap-3 p-3 has-disabled:cursor-not-allowed has-disabled:opacity-70"
                >
                  <Checkbox
                    id="career-playbook-course-business-context"
                    aria-label={t('businessContextLabel')}
                    checked={includeBusinessContextSources}
                    disabled={!preview.sources.businessContextSources.available}
                    onCheckedChange={(checked) =>
                      setIncludeBusinessContextSources(Boolean(checked))
                    }
                  />
                  <span className="grid gap-1 text-sm">
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {t('businessContextLabel')}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {preview.sources.businessContextSources.available
                        ? t('businessContextDescription', {
                            count: preview.sources.businessContextSources.sourceCount,
                          })
                        : t('businessContextUnavailable')}
                    </span>
                  </span>
                </label>
              </div>
            </section>
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden />
            <AlertTitle>{t('errorTitle')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button
            type="button"
            className="rounded-md"
            onClick={() => {
              void handleCreateCourse()
            }}
            disabled={isSubmitting || isPreviewLoading || !draft}
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {isSubmitting ? t('loading') : t('createAndGenerate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
