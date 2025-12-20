import { getTranslations } from 'next-intl/server';
import { HistoryTable } from '@/components/generation-monitoring/history-table';

export default async function HistoryPage() {
  const t = await getTranslations('admin.history');

  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {t('title')}
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          {t('description')}
        </p>
      </div>

      <div className="flex-1 min-h-0">
        <HistoryTable />
      </div>
    </div>
  );
}
