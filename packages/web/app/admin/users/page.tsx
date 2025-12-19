import { getTranslations } from 'next-intl/server';
import { UsersTable } from './components/users-table';

export default async function UsersPage() {
  const t = await getTranslations('admin.users');

  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">
          {t('description')}
        </p>
      </div>

      <div className="flex-1 min-h-0">
        <UsersTable />
      </div>
    </div>
  );
}
