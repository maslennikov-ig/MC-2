import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Coins } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Link } from '@/src/i18n/navigation'
import { Locale } from '@/src/i18n/config'
import { HistoryTable } from '@/components/generation-monitoring/history-table'

type Props = {
  params: Promise<{ locale: Locale }>
}

export default async function HistoryPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale) // Enable static rendering

  const t = await getTranslations('admin.history')

  return (
    <div className="flex h-[calc(100vh-100px)] flex-col space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
          <p className="text-gray-600 dark:text-gray-300">{t('description')}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/generation/career-playbooks/costs">
            <Coins className="h-4 w-4" />
            {t('actions.careerPlaybookCosts')}
          </Link>
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <HistoryTable />
      </div>
    </div>
  )
}
