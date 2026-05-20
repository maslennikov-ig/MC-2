import { setRequestLocale } from 'next-intl/server'

import { getCurrentUser } from '@/lib/auth-helpers'
import type { Locale } from '@/src/i18n/config'
import CareerPlaybookAuthRequiredClient from '../new/auth-required-client'
import CareerPlaybookViewerPageClient from './page-client'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

type Props = {
  params: Promise<{ locale: Locale; id: string }>
}

export default async function CareerPlaybookViewerPage({ params }: Props) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const user = await getCurrentUser()

  if (!user) {
    return (
      <CareerPlaybookAuthRequiredClient
        locale={locale}
        returnTo={`/${locale}/career-playbook/${id}`}
      />
    )
  }

  return <CareerPlaybookViewerPageClient locale={locale} playbookId={id} />
}

export async function generateMetadata({ params }: Props) {
  const { locale } = await params

  return {
    title: locale === 'ru' ? 'Career Playbook' : 'Career Playbook',
    description:
      locale === 'ru'
        ? 'Просмотр и редактирование сгенерированного Role Guide.'
        : 'View and edit a generated Role Guide.',
  }
}
