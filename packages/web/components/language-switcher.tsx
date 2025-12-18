'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();

  const toggleLocale = () => {
    const newLocale = locale === 'ru' ? 'en' : 'ru';

    // Set locale cookie (next-intl reads NEXT_LOCALE cookie)
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000`;

    // Refresh to apply new locale
    router.refresh();
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLocale}
      className="gap-2"
    >
      <Globe className="h-4 w-4" />
      <span className="uppercase">{locale}</span>
    </Button>
  );
}
