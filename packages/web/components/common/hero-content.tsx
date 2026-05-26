'use client'

/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4
 * selected: Product Split with connector tooltip
 * constraints: current MegaCampusAI shader background, header, palette, buttons, and RU/EN copy
 */

import type { ReactNode } from 'react'
import { ArrowDown, ArrowRight, BookOpen, FileText, Route } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Link } from '@/src/i18n/navigation'

type HeroAction = {
  href: string
  label: string
  icon: ReactNode
}

type ProductCardProps = {
  eyebrow: string
  title: string
  purpose: string
  href: string
  cta: string
  icon: ReactNode
  emphasized?: boolean
}

export default function HeroContent() {
  const t = useTranslations('common.hero')

  const createRoleAction: HeroAction = {
    href: '/career-playbook/new',
    label: t('createRoleGuide'),
    icon: <FileText className="h-4 w-4" aria-hidden="true" />,
  }
  const createCourseAction: HeroAction = {
    href: '/create',
    label: t('createCourse'),
    icon: <BookOpen className="h-4 w-4" aria-hidden="true" />,
  }

  return (
    <main className="relative z-20 mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-[1800px] items-center px-5 py-16 sm:px-8 lg:px-12 xl:px-16">
      <section className="grid w-full gap-10 lg:grid-cols-[minmax(0,0.86fr)_minmax(580px,1.14fr)] lg:items-center">
        <div className="max-w-4xl min-w-0 text-white">
          <div className="mb-6 inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-semibold backdrop-blur">
            {t('badge')}
          </div>
          <h1 className="max-w-4xl text-5xl leading-[0.98] font-bold tracking-normal sm:text-6xl xl:text-7xl">
            {t('title')}
          </h1>
          <p className="mt-7 max-w-2xl text-xl leading-9 text-white/78">{t('description')}</p>
          <HeroActions primary={createRoleAction} secondary={createCourseAction} />
        </div>

        <div className="relative grid gap-4 rounded-2xl border border-white/18 bg-white/12 p-4 text-white shadow-2xl shadow-black/15 backdrop-blur-xl sm:p-5 xl:grid-cols-2">
          <ProductCard
            eyebrow={t('roleProductEyebrow')}
            title={t('roleProduct')}
            purpose={t('roleProductPurpose')}
            href="/career-playbook"
            cta={t('learnMoreRole')}
            icon={<FileText className="h-5 w-5" aria-hidden="true" />}
            emphasized
          />
          <div className="xl:hidden">
            <ProductConnector title={t('workflowTitle')} description={t('productConnection')} />
          </div>
          <ProductCard
            eyebrow={t('courseProductEyebrow')}
            title={t('courseProduct')}
            purpose={t('courseProductPurpose')}
            href="/courses"
            cta={t('learnMoreCourses')}
            icon={<BookOpen className="h-5 w-5" aria-hidden="true" />}
          />
          <ProductConnectorOverlay
            title={t('workflowTitle')}
            description={t('productConnection')}
          />
        </div>
      </section>
    </main>
  )
}

function HeroActions({ primary, secondary }: { primary: HeroAction; secondary: HeroAction }) {
  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      <Button asChild size="lg" className="w-full shadow-lg shadow-purple-950/25 sm:w-auto">
        <Link href={primary.href}>
          {primary.icon}
          <span>{primary.label}</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
      <Button
        asChild
        variant="outline"
        size="lg"
        className="w-full border-white/18 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:w-auto"
      >
        <Link href={secondary.href}>
          {secondary.icon}
          <span>{secondary.label}</span>
        </Link>
      </Button>
    </div>
  )
}

function ProductCard({ eyebrow, title, purpose, href, cta, icon, emphasized }: ProductCardProps) {
  return (
    <Link
      href={href}
      className={
        emphasized
          ? 'focus-ring group flex min-h-[340px] flex-col justify-between rounded-xl border border-purple-300/40 bg-purple-600/35 p-5 text-white transition hover:border-purple-200/70 hover:bg-purple-600/45'
          : 'focus-ring group flex min-h-[340px] flex-col justify-between rounded-xl border border-white/15 bg-white/10 p-5 text-white transition hover:border-purple-300/50 hover:bg-white/14'
      }
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-lg border border-white/15 bg-white/10 px-3 py-1 text-sm font-semibold text-white">
            {eyebrow}
          </span>
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/14 text-purple-100 group-hover:bg-purple-600 group-hover:text-white">
            {icon}
          </span>
        </div>
        <h2 className="mt-7 text-3xl leading-tight font-bold">{title}</h2>
        <p className="mt-3 max-w-2xl text-base leading-7 text-white/72">{purpose}</p>
      </div>
      <span className="mt-8 inline-flex items-center gap-2 text-sm font-semibold">
        {cta}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </Link>
  )
}

function ProductConnector({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid gap-4 px-2 py-4 text-white sm:grid-cols-[84px_minmax(0,1fr)] sm:items-center sm:px-5">
      <div className="relative flex h-20 items-center justify-center">
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/18" />
        <span className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/18 bg-white/12 text-purple-100 shadow-lg shadow-black/10 backdrop-blur">
          <ArrowDown className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-white/78">
          <Route className="h-4 w-4 text-purple-100" aria-hidden="true" />
          <span>{title}</span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/68">{description}</p>
      </div>
    </div>
  )
}

function ProductConnectorOverlay({ title, description }: { title: string; description: string }) {
  return (
    <div className="absolute top-1/2 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 xl:block">
      <TooltipProvider delayDuration={120}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={title}
              className="focus-ring relative flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-white/16 text-purple-100 shadow-xl shadow-black/20 backdrop-blur-xl transition hover:border-purple-200/60 hover:bg-purple-600/35 hover:text-white"
            >
              <ArrowRight className="h-6 w-6" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            sideOffset={12}
            className="max-w-72 border border-white/15 bg-slate-950 px-4 py-3 text-white shadow-xl shadow-black/20"
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Route className="h-4 w-4 text-purple-100" aria-hidden="true" />
              <span>{title}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-white/72">{description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
