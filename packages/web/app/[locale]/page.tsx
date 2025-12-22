import { setRequestLocale } from 'next-intl/server';
import { Locale } from '@/src/i18n/config';
import HomePageClient from './page-client'

// Force dynamic rendering to ensure auth state is fresh
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

type Props = {
  params: Promise<{ locale: Locale }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale); // Enable static rendering

  // This is now a server component that can handle auth properly
  // The client components are rendered inside
  return <HomePageClient />
}