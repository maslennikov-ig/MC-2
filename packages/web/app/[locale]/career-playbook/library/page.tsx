import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { getCurrentUser } from '@/lib/auth-helpers'
import type { Locale } from '@/src/i18n/config'
import CareerPlaybookLibraryAuthRequiredClient from './auth-required-client'
import { getCareerPlaybookLibrary } from './data'
import CareerPlaybookLibraryPageClient from './page-client'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

type Props = {
  params: Promise<{ locale: Locale }>
}

export default async function CareerPlaybookLibraryPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await getCurrentUser()

  if (!user) {
    return <CareerPlaybookLibraryAuthRequiredClient locale={locale} />
  }

  const initialData = await getCareerPlaybookLibrary({
    userId: user.id,
    limit: 50,
    search: undefined,
  })

  return <CareerPlaybookLibraryPageClient locale={locale} initialData={initialData} />
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'career-playbook.library' })
  return {
    title: t('title'),
    description: t('subtitle'),
  }
}
