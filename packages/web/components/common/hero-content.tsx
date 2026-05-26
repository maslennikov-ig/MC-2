'use client'

import type { ReactNode } from 'react'
import { ArrowRight, BookOpen, FileText, Library } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Link } from '@/src/i18n/navigation'

export default function HeroContent() {
  const t = useTranslations('common.hero')

  return (
    <main className="relative z-20 mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-[1800px] items-center px-5 py-16 sm:px-8 lg:px-12 xl:px-16">
      <section className="grid w-full gap-10 lg:grid-cols-[minmax(0,0.86fr)_minmax(580px,1.14fr)] lg:items-center">
        <div className="max-w-4xl text-white">
          <div className="mb-6 inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-semibold backdrop-blur">
            {t('badge')}
          </div>
          <h1 className="max-w-4xl text-5xl leading-[0.98] font-bold tracking-normal sm:text-6xl xl:text-7xl">
            {t('title')}
          </h1>
          <p className="mt-7 max-w-2xl text-xl leading-9 text-white/78">{t('description')}</p>

          <div className="mt-8 rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
            <h2 className="text-xl font-semibold">{t('workflowTitle')}</h2>
            <p className="mt-2 leading-7 text-white/72">{t('workflowDescription')}</p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <ProductCard
            recommended
            icon={<FileText className="h-7 w-7" aria-hidden="true" />}
            title={t('roleProduct')}
            description={t('roleProductDescription')}
            primaryHref="/career-playbook"
            primaryLabel={t('openRole')}
            secondaryHref="/career-playbook/library"
            secondaryLabel={t('viewRoleLibrary')}
            recommendedLabel={t('recommended')}
          />
          <ProductCard
            icon={<BookOpen className="h-7 w-7" aria-hidden="true" />}
            title={t('courseProduct')}
            description={t('courseProductDescription')}
            primaryHref="/courses"
            primaryLabel={t('openCourses')}
            secondaryHref="/courses/library"
            secondaryLabel={t('viewCourseLibrary')}
          />
        </div>
      </section>
    </main>
  )
}

function ProductCard({
  icon,
  title,
  description,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  recommended,
  recommendedLabel,
}: {
  icon: ReactNode
  title: string
  description: string
  primaryHref: string
  primaryLabel: string
  secondaryHref: string
  secondaryLabel: string
  recommended?: boolean
  recommendedLabel?: string
}) {
  return (
    <article className="relative min-h-[420px] rounded-3xl border border-white/18 bg-white/12 p-6 text-white shadow-2xl shadow-black/15 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:bg-white/16">
      {recommended && recommendedLabel ? (
        <div className="absolute top-5 right-5 rounded-full bg-purple-500 px-3 py-1 text-xs font-semibold text-white shadow-lg shadow-purple-950/20">
          {recommendedLabel}
        </div>
      ) : null}
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/14 text-purple-100">
        {icon}
      </div>
      <h2 className="mt-8 text-3xl font-bold tracking-normal">{title}</h2>
      <p className="mt-4 min-h-28 text-lg leading-8 text-white/74">{description}</p>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href={primaryHref}
          className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-purple-600 px-5 py-3 font-semibold text-white shadow-lg shadow-purple-950/25 transition hover:bg-purple-500"
        >
          {primaryLabel}
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>
        <Link
          href={secondaryHref}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/18 px-5 py-3 font-semibold text-white/86 transition hover:bg-white/10 hover:text-white"
        >
          <Library className="h-4 w-4" aria-hidden="true" />
          {secondaryLabel}
        </Link>
      </div>
    </article>
  )
}
