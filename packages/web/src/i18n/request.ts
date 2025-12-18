import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // Validate locale
  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }

  // Load namespace-based messages and merge them
  const [common, admin, generation] = await Promise.all([
    import(`../../messages/${locale}/common.json`),
    import(`../../messages/${locale}/admin.json`),
    import(`../../messages/${locale}/generation.json`),
  ]);

  return {
    locale: locale as 'ru' | 'en',
    messages: {
      common: common.default,
      admin: admin.default,
      generation: generation.default,
    }
  };
});
