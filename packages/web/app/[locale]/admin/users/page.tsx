import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Locale } from '@/src/i18n/config';
import { UsersTable } from './components/users-table';

type Props = {
  params: Promise<{ locale: Locale }>;
};

export default async function UsersPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale); // Enable static rendering

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
