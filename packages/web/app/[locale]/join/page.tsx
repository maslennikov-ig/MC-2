import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/src/i18n/config';
import { JoinByCode } from './components/join-by-code';

interface PageProps {
  params: Promise<{
    locale: Locale;
  }>;
}

/**
 * Join Organization by Code Page
 *
 * Server component that renders the code entry form.
 * Users can enter a 6-character invitation code to join an organization.
 */
export default async function JoinByCodePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <JoinByCode />;
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'organizations.join' });

  return {
    title: t('code.metaTitle'),
    description: t('code.metaDescription'),
  };
}
