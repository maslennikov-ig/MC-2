import { getTranslations, setRequestLocale } from 'next-intl/server'

import { getCurrentUser } from '@/lib/auth-helpers'
import type { Locale } from '@/src/i18n/config'
import CareerPlaybookAuthRequiredClient from './auth-required-client'
import CareerPlaybookNewPageClient from './page-client'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

type Props = {
  params: Promise<{ locale: Locale }>
}

export default async function CareerPlaybookNewPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await getCurrentUser()

  if (!user) {
    return <CareerPlaybookAuthRequiredClient locale={locale} />
  }

  return <CareerPlaybookNewPageClient locale={locale} userId={user.id} />
}

export async function generateMetadata({ params }: Props) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'career-playbook.wizard' })

  return {
    title: t('title'),
    description: t('subtitle'),
  }
}
