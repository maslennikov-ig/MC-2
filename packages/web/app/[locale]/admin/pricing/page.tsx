import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Locale } from '@/src/i18n/config'
import { PricingTable } from './components/pricing-table'
import { getServerTrpcClient } from '@/lib/trpc/server-caller'

type Props = {
  params: Promise<{ locale: Locale }>
}

export default async function PricingPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale) // Enable static rendering

  const t = await getTranslations('admin.pricing')
  const client = await getServerTrpcClient()
  const tiers = await client.admin.listTiers.query()

  return (
    <div className="flex h-[calc(100vh-100px)] flex-col space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <div className="min-h-0 flex-1">
        <PricingTable initialTiers={tiers} />
      </div>
    </div>
  )
}
