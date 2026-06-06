import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import type { Locale } from '@/src/i18n/config'
import { PublicPlaybookViewer } from '@/components/career-playbook/viewer/public-playbook-viewer'
import { buildCareerPlaybookPublicPath } from '@/components/career-playbook/library/public-url'
import { getPublicCareerPlaybookBySlug } from '@/app/[locale]/share/career-playbook/[slug]/data'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

type PageProps = {
  params: Promise<{ locale: Locale; orgSlug: string; playbookSlug: string }>
}

function getMc2CtaCopy(locale: Locale) {
  if (locale === 'ru') {
    return {
      label: 'Создано на MC2',
      action: 'создать свой',
    }
  }

  return {
    label: 'Created on MC2',
    action: 'create your own',
  }
}

function isOrganizationMatch(expectedOrgSlug: string, actualOrgSlug: string | null): boolean {
  return Boolean(actualOrgSlug && actualOrgSlug === expectedOrgSlug)
}

export default async function PublicCareerPlaybookPage({ params }: PageProps) {
  const { locale, orgSlug, playbookSlug } = await params
  setRequestLocale(locale)

  const result = await getPublicCareerPlaybookBySlug({ slug: playbookSlug })
  if (result.status === 'not-found' || result.status === 'private') {
    notFound()
  }

  if (result.status === 'unavailable') {
    const t = await getTranslations({ locale, namespace: 'career-playbook.share' })
    return (
      <main className="career-playbook-zone">
        <section className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-12 md:px-6">
          <div className="career-playbook-panel p-6">
            <h1 className="text-2xl font-semibold">{t('fallbackTitle')}</h1>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              {t('fallbackDescription')}
            </p>
          </div>
        </section>
      </main>
    )
  }

  if (!result.playbook || !isOrganizationMatch(orgSlug, result.playbook.organizationSlug)) {
    notFound()
  }

  const cta = getMc2CtaCopy(locale)

  return (
    <main className="career-playbook-zone">
      <section className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6">
        <div className="mb-4 text-sm text-slate-600 dark:text-slate-300">
          <span>{cta.label}</span>
          <span className="mx-2">-</span>
          <Link
            href={`/${locale}/career-playbook`}
            className="font-medium text-purple-700 hover:underline dark:text-purple-300"
          >
            {cta.action}
          </Link>
        </div>
        <PublicPlaybookViewer title={result.playbook.title} playbook={result.playbook} />
      </section>
    </main>
  )
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, orgSlug, playbookSlug } = await params
  const result = await getPublicCareerPlaybookBySlug({ slug: playbookSlug })

  if (
    result.status !== 'ok' ||
    !result.playbook ||
    !isOrganizationMatch(orgSlug, result.playbook.organizationSlug)
  ) {
    const t = await getTranslations({ locale, namespace: 'career-playbook.share' })
    return {
      title: t('fallbackTitle'),
      description: t('fallbackDescription'),
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://megacampusai.com'
  const path = buildCareerPlaybookPublicPath(locale, orgSlug, result.playbook.slug)
  const url = path ? `${appUrl}${path}` : appUrl

  return {
    title: result.playbook.title,
    description: result.playbook.summary,
    openGraph: {
      title: result.playbook.title,
      description: result.playbook.summary,
      type: 'article',
      url,
      siteName: 'MC2',
    },
    twitter: {
      card: 'summary_large_image',
      title: result.playbook.title,
      description: result.playbook.summary,
    },
    alternates: {
      canonical: path ?? undefined,
    },
  }
}
