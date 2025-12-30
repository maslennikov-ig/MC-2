import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Locale } from '@/src/i18n/config';
import { OrganizationSettingsForm } from './components/settings-form';

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ orgId?: string }>;
};

export default async function OrganizationSettingsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { orgId } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('organizations.settings');

  // Redirect if no org ID is provided
  if (!orgId) {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <OrganizationSettingsForm organizationId={orgId} />
    </div>
  );
}
