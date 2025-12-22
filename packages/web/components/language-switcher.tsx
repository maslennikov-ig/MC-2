'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/src/i18n/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';
import { setLocale } from '@/app/actions/i18n';
import type { Locale } from '@/src/i18n/config';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const toggleLocale = () => {
    const newLocale: Locale = locale === 'ru' ? 'en' : 'ru';

    startTransition(async () => {
      await setLocale(newLocale);
      // Navigate to same page with new locale - this updates URL properly
      router.replace(pathname, { locale: newLocale });
    });
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLocale}
      disabled={isPending}
      className="gap-2"
    >
      <Globe className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
      <span className="uppercase">{locale}</span>
    </Button>
  );
}
