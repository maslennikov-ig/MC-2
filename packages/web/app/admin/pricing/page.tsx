import { getTranslations } from 'next-intl/server';
import { PricingTable } from './components/pricing-table';
import { listTiersAction } from '@/app/actions/admin-tiers';

export default async function PricingPage() {
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
