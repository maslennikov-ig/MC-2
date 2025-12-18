import { useParams } from 'next/navigation';
import { GRAPH_TRANSLATIONS } from './translations';

type Locale = 'ru' | 'en';

export function useTranslation() {
  const params = useParams();
  // Prefer URL param, then navigator (if client), default to 'ru'
  const urlLocale = params?.locale as string;
  const locale: Locale = (urlLocale === 'en' || urlLocale === 'ru') ? urlLocale : 'ru';

  const t = (key: string): string => {
    const keys = key.split('.');
    let value: unknown = GRAPH_TRANSLATIONS;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        // Key not found
        return key;
      }
    }

    if (value && typeof value === 'object') {
        const localized = value as Record<string, string>;
        if (locale in localized) {
            return localized[locale];
        }
        if ('ru' in localized) {
            return localized['ru'];
        }
    }

    return key;
  };

  return { t, locale };
}
