import { createClient } from '@/lib/supabase/server';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Locale } from '@/src/i18n/config';
import { redirect } from 'next/navigation';
import { PWAAnalyticsDashboard } from './components/pwa-analytics-dashboard';

type Props = {
  params: Promise<{ locale: Locale }>;
};

export default async function AnalyticsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    redirect('/admin');
  }

  const t = await getTranslations('admin.analytics');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('title')}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          {t('description')}
        </p>
      </div>

      <PWAAnalyticsDashboard />
    </div>
  );
}
