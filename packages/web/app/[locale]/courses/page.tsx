import type { Metadata } from 'next'
import { ArrowRight, BookOpen, CheckCircle2, ClipboardList, FileText, Layers3 } from 'lucide-react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import Header from '@/components/layouts/header'
import { Link } from '@/src/i18n/navigation'
import { defaultLocale, locales, type Locale } from '@/src/i18n/config'

type Props = {
  params: Promise<{ locale: Locale }>
}

type LandingItem = {
  title: string
  description: string
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'common.coursesLanding' })
  const pagePath = getCoursesLandingPagePath(locale)

  return {
    title: t('metadataTitle'),
    description: t('metadataDescription'),
    alternates: {
      canonical: pagePath,
      languages: Object.fromEntries(
        locales.map((language) => [language, getCoursesLandingPagePath(language)])
      ),
    },
    openGraph: {
      title: t('metadataTitle'),
      description: t('metadataDescription'),
      url: pagePath,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: t('metadataTitle'),
      description: t('metadataDescription'),
    },
  }
}

export default async function CoursesLandingPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'common.coursesLanding' })
  const steps = t.raw('steps') as LandingItem[]
  const features = t.raw('features') as LandingItem[]
  const examples = t.raw('examples') as LandingItem[]

  return (
    <div className="min-h-screen bg-[#f7f1e8] text-slate-950 dark:bg-slate-950 dark:text-white">
      <Header sticky surface="glass" />

      <main>
        <section className="relative overflow-hidden border-b border-[#e3d7c6] dark:border-white/10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(139,92,246,0.2),transparent_32%),radial-gradient(circle_at_80%_0%,rgba(20,184,166,0.18),transparent_30%)] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(139,92,246,0.3),transparent_34%),radial-gradient(circle_at_85%_20%,rgba(14,165,233,0.18),transparent_32%)]" />
          <div className="relative mx-auto grid min-h-[calc(100vh-76px)] w-full max-w-[1800px] items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(520px,1.1fr)] lg:px-12 xl:px-16">
            <div className="max-w-3xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-purple-200 bg-white/70 px-3 py-1.5 text-sm font-semibold text-purple-800 shadow-sm dark:border-purple-400/25 dark:bg-white/10 dark:text-purple-100">
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                {t('eyebrow')}
              </div>
              <h1 className="max-w-4xl text-5xl leading-[0.98] font-bold tracking-normal text-slate-950 sm:text-6xl lg:text-7xl dark:text-white">
                {t('title')}
              </h1>
              <p className="mt-7 max-w-2xl text-xl leading-9 text-slate-700 dark:text-slate-200">
                {t('description')}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/career-playbook"
                  className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-purple-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-purple-600/20 transition hover:bg-purple-700"
                >
                  {t('primaryCta')}
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </Link>
                <Link
                  href="/courses/library"
                  className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white/70 px-6 py-3 text-base font-semibold text-slate-900 transition hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                >
                  {t('libraryCta')}
                </Link>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <Metric value="26" label={t('metricBlocks')} />
                <Metric value="3" label={t('metricSteps')} />
                <Metric value="1" label={t('metricDraft')} />
              </div>
            </div>

            <CoursePreview
              title={t('previewTitle')}
              subtitle={t('previewSubtitle')}
              items={[t('previewPillRole'), t('previewPillMaterials'), t('previewPillReview')]}
              modulesLabel={t('previewModules')}
              lessonsLabel={t('previewLessons')}
            />
          </div>
        </section>

        <section className="px-5 py-20 sm:px-8 lg:px-12 xl:px-16">
          <div className="mx-auto max-w-[1680px]">
            <div className="mb-10 max-w-3xl">
              <p className="text-sm font-semibold tracking-[0.18em] text-purple-700 uppercase dark:text-purple-300">
                {t('flowEyebrow')}
              </p>
              <h2 className="mt-3 text-4xl font-bold tracking-normal text-slate-950 md:text-5xl dark:text-white">
                {t('flowTitle')}
              </h2>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {steps.map((step, index) => (
                <article
                  key={step.title}
                  className="rounded-2xl border border-[#e3d7c6] bg-white/80 p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-purple-100 text-lg font-bold text-purple-700 dark:bg-purple-500/15 dark:text-purple-200">
                    {index + 1}
                  </div>
                  <h3 className="text-2xl font-semibold text-slate-950 dark:text-white">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-300">
                    {step.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-[#e3d7c6] bg-white/55 px-5 py-20 sm:px-8 lg:px-12 xl:px-16 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="mx-auto grid max-w-[1680px] gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm font-semibold tracking-[0.18em] text-purple-700 uppercase dark:text-purple-300">
                {t('featuresEyebrow')}
              </p>
              <h2 className="mt-3 text-4xl font-bold tracking-normal text-slate-950 md:text-5xl dark:text-white">
                {t('featuresTitle')}
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-700 dark:text-slate-300">
                {t('featuresDescription')}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {features.map((feature, index) => (
                <article
                  key={feature.title}
                  className="rounded-2xl border border-[#e3d7c6] bg-[#fbf8f2] p-5 dark:border-white/10 dark:bg-slate-900"
                >
                  <div className="mb-4 text-purple-700 dark:text-purple-300">
                    {index % 3 === 0 ? (
                      <ClipboardList className="h-6 w-6" aria-hidden="true" />
                    ) : index % 3 === 1 ? (
                      <Layers3 className="h-6 w-6" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                    )}
                  </div>
                  <h3 className="text-xl font-semibold text-slate-950 dark:text-white">
                    {feature.title}
                  </h3>
                  <p className="mt-3 leading-7 text-slate-600 dark:text-slate-300">
                    {feature.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-20 sm:px-8 lg:px-12 xl:px-16">
          <div className="mx-auto max-w-[1680px]">
            <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold tracking-[0.18em] text-purple-700 uppercase dark:text-purple-300">
                  {t('examplesEyebrow')}
                </p>
                <h2 className="mt-3 text-4xl font-bold tracking-normal text-slate-950 md:text-5xl dark:text-white">
                  {t('examplesTitle')}
                </h2>
              </div>
              <Link
                href="/courses/library"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-900 transition hover:border-purple-300 hover:text-purple-700 dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
              >
                {t('libraryCta')}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {examples.map((example) => (
                <article
                  key={example.title}
                  className="min-h-56 rounded-2xl border border-[#e3d7c6] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <FileText className="mb-6 h-7 w-7 text-purple-700 dark:text-purple-300" />
                  <h3 className="text-2xl font-semibold text-slate-950 dark:text-white">
                    {example.title}
                  </h3>
                  <p className="mt-4 leading-7 text-slate-600 dark:text-slate-300">
                    {example.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 pb-20 sm:px-8 lg:px-12 xl:px-16">
          <div className="mx-auto max-w-[1680px] rounded-3xl border border-[#e3d7c6] bg-white/75 p-8 text-slate-950 shadow-2xl shadow-stone-300/30 md:p-12 dark:border-white/10 dark:bg-slate-900/85 dark:text-white dark:shadow-purple-950/20">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <h2 className="text-4xl font-bold tracking-normal md:text-5xl">{t('ctaTitle')}</h2>
                <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-700 dark:text-slate-300">
                  {t('ctaDescription')}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/career-playbook"
                  className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-purple-600 px-6 py-3 font-semibold text-white transition hover:bg-purple-700 focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f1e8] focus-visible:outline-none dark:focus-visible:ring-offset-slate-950"
                >
                  {t('primaryCta')}
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </Link>
                <Link
                  href="/create"
                  className="inline-flex min-h-12 items-center justify-center rounded-lg border border-slate-300 bg-white/70 px-6 py-3 font-semibold text-slate-900 transition hover:border-purple-300 hover:bg-white hover:text-purple-700 focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f1e8] focus-visible:outline-none dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15 dark:focus-visible:ring-offset-slate-950"
                >
                  {t('createCourseCta')}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/60 bg-white/60 p-4 shadow-sm dark:border-white/10 dark:bg-white/10">
      <div className="text-3xl font-bold text-slate-950 dark:text-white">{value}</div>
      <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{label}</div>
    </div>
  )
}

function CoursePreview({
  title,
  subtitle,
  items,
  modulesLabel,
  lessonsLabel,
}: {
  title: string
  subtitle: string
  items: string[]
  modulesLabel: string
  lessonsLabel: string
}) {
  return (
    <aside className="rounded-[2rem] border border-white/70 bg-white/75 p-4 shadow-2xl shadow-slate-900/10 backdrop-blur dark:border-white/10 dark:bg-slate-900/70 dark:shadow-purple-950/20">
      <div className="rounded-[1.5rem] border border-[#e3d7c6] bg-[#fbf8f2] p-5 dark:border-white/10 dark:bg-slate-950">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-purple-700 uppercase dark:text-purple-300">
              {subtitle}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{title}</h2>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-200">
            <BookOpen className="h-6 w-6" aria-hidden="true" />
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="space-y-3">
            {items.map((item, index) => (
              <div
                key={item}
                className="rounded-xl border border-[#e3d7c6] bg-white p-4 dark:border-white/10 dark:bg-slate-900"
              >
                <div className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  0{index + 1}
                </div>
                <div className="font-semibold text-slate-950 dark:text-white">{item}</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-[#e3d7c6] bg-white p-5 dark:border-white/10 dark:bg-slate-900">
            <div className="mb-4 h-3 w-2/3 rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="space-y-3">
              {[84, 92, 68, 76].map((width) => (
                <div
                  key={width}
                  className="h-3 rounded-full bg-purple-100 dark:bg-purple-500/20"
                  style={{ width: `${width}%` }}
                />
              ))}
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-[#f7f1e8] p-4 dark:bg-white/5">
                <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">8</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">{modulesLabel}</div>
              </div>
              <div className="rounded-lg bg-[#f7f1e8] p-4 dark:bg-white/5">
                <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">24</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">{lessonsLabel}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function getCoursesLandingPagePath(locale: Locale) {
  return locale === defaultLocale ? '/courses' : `/${locale}/courses`
}
