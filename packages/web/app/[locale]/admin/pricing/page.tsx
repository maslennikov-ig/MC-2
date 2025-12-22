import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Locale } from '@/src/i18n/config';
import { PricingTable } from './components/pricing-table';
import { listTiersAction } from '@/app/actions/admin-tiers';

type Props = {
  params: Promise<{ locale: Locale }>;
};

export default async function PricingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale); // Enable static rendering

  const t = await getTranslations('admin.pricing');
  const tiers = await listTiersAction();

  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">
          {t('description')}
        </p>
      </div>

      <div className="flex-1 min-h-0">
        <PricingTable initialTiers={tiers} />
      </div>
    </div>
  );
}
