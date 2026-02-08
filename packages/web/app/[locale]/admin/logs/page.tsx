import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Locale } from '@/src/i18n/config'
import { LogsPageClient } from './components/logs-page-client'

type Props = {
  params: Promise<{ locale: Locale }>
}

export default async function LogsPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale) // Enable static rendering

  const t = await getTranslations('admin.logs')

  return (
    <div className="flex h-[calc(100vh-100px)] flex-col space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {t('title')}
        </h1>
        <p className="text-gray-600 dark:text-gray-300">{t('description')}</p>
      </div>

      <div className="min-h-0 flex-1">
        <LogsPageClient />
      </div>
    </div>
  )
}
