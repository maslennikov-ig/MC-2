import { getTranslations, setRequestLocale } from 'next-intl/server'

import { getCurrentUser } from '@/lib/auth-helpers'
import type { Locale } from '@/src/i18n/config'
import CareerPlaybookAuthRequiredClient from './auth-required-client'
import CareerPlaybookNewPageClient from './page-client'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

type Props = {
  params: Promise<{ locale: Locale }>
  searchParams?: Promise<{
    fresh?: string | string[]
    resume?: string | string[]
  }>
}

export default async function CareerPlaybookNewPage({ params, searchParams }: Props) {
  const { locale } = await params
  const resolvedSearchParams = searchParams ? await searchParams : {}
  setRequestLocale(locale)
  const user = await getCurrentUser()

  if (!user) {
    return <CareerPlaybookAuthRequiredClient locale={locale} />
  }

  const freshParam = Array.isArray(resolvedSearchParams.fresh)
    ? resolvedSearchParams.fresh[0]
    : resolvedSearchParams.fresh
  const resumeParam = Array.isArray(resolvedSearchParams.resume)
    ? resolvedSearchParams.resume[0]
    : resolvedSearchParams.resume
  const resumePlaybookId = freshParam === '1' ? undefined : resumeParam

  return (
    <CareerPlaybookNewPageClient
      locale={locale}
      userId={user.id}
      resetOnMount={freshParam === '1'}
      resumePlaybookId={resumePlaybookId}
    />
  )
}

export async function generateMetadata({ params }: Props) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'career-playbook.wizard' })

  return {
    title: t('title'),
    description: t('subtitle'),
  }
}
