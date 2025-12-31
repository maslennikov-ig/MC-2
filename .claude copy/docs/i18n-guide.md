# i18n Translation Guide

> Reference for creating and maintaining translations in `packages/web`

## Quick Reference

| Item | Location |
|------|----------|
| Config | `src/i18n/config.ts` |
| Routing | `src/i18n/routing.ts` |
| Navigation | `src/i18n/navigation.ts` |
| Request | `src/i18n/request.ts` |
| Messages | `messages/{locale}/{namespace}.json` |
| Types | `types/i18n.d.ts` |
| Locales | `ru` (default), `en` |
| Namespaces | `common`, `admin`, `generation`, `auth` |

## Architecture

### Folder Structure

All pages live under `app/[locale]/`:

```
app/
├── layout.tsx              # Minimal passthrough (returns children)
├── not-found.tsx           # Root not-found fallback
├── [locale]/
│   ├── layout.tsx          # Main layout with NextIntlClientProvider
│   ├── page.tsx            # Home page
│   ├── courses/            # /courses (ru) or /en/courses
│   ├── admin/              # /admin (ru) or /en/admin
│   └── [...]rest/page.tsx  # Catch-all for 404s
```

### URL Scheme (`localePrefix: 'as-needed'`)

| Locale | URL Pattern | Example |
|--------|-------------|---------|
| `ru` (default) | No prefix | `/`, `/courses`, `/admin` |
| `en` | With prefix | `/en`, `/en/courses`, `/en/admin` |

### Key Files

**`src/i18n/config.ts`** - Single Source of Truth for locales:
```ts
export const locales = ['ru', 'en'] as const;
export const defaultLocale = 'ru';
```

**`src/i18n/routing.ts`** - Routing configuration:
```ts
import { defineRouting } from 'next-intl/routing';
import { locales, defaultLocale } from './config';

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'as-needed', // No prefix for default locale
});
```

**`src/i18n/navigation.ts`** - Locale-aware navigation utilities:
```ts
import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
```

## Navigation (IMPORTANT)

### Client Components - Use `@/src/i18n/navigation`

Always use locale-aware navigation in client components:

```tsx
'use client';
// CORRECT - locale-aware navigation
import { Link, useRouter, usePathname } from '@/src/i18n/navigation';

function MyComponent() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Link href="/courses">Courses</Link>
    // Renders: /courses (ru) or /en/courses (en)
  );
}
```

```tsx
// WRONG - loses locale context
import Link from 'next/link';
import { useRouter } from 'next/navigation';
```

### Server Components - Use next-intl redirect

```tsx
// Server component
import { redirect } from '@/src/i18n/navigation';

async function MyPage() {
  if (!authorized) {
    redirect('/login'); // Preserves locale
  }
}
```

### Static Params Generation

Every `[locale]` layout should have `generateStaticParams`:

```tsx
// app/[locale]/layout.tsx
import { routing } from '@/src/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}
```

## Adding Translations

### 1. Add keys to BOTH locale files

```bash
# Always edit both files:
messages/ru/{namespace}.json
messages/en/{namespace}.json
```

### 2. Keep structure identical

```json
// messages/ru/common.json
{
  "buttons": {
    "save": "Сохранить",
    "cancel": "Отмена"
  }
}

// messages/en/common.json
{
  "buttons": {
    "save": "Save",
    "cancel": "Cancel"
  }
}
```

### 3. Use in components

```tsx
// Client component
'use client';
import { useTranslations } from 'next-intl';

function MyComponent() {
  const t = useTranslations('common');
  return <button>{t('buttons.save')}</button>;
}

// Server component
import { getTranslations } from 'next-intl/server';

async function MyPage() {
  const t = await getTranslations('admin.users');
  return <h1>{t('title')}</h1>;
}
```

## Adding New Namespace

1. Add to `src/i18n/config.ts`:
```ts
export const namespaces = ['common', 'admin', 'generation', 'auth', 'NEW_NS'] as const;
```

2. Create JSON files:
```bash
messages/ru/NEW_NS.json
messages/en/NEW_NS.json
```

3. Update `types/i18n.d.ts`:
```ts
type NewNsMessages = typeof import('../messages/ru/NEW_NS.json');

type Messages = {
  // ... existing
  NEW_NS: NewNsMessages;
};
```

## ICU Message Format

### Interpolation
```json
{ "greeting": "Hello, {name}!" }
```
```tsx
t('greeting', { name: 'John' }) // "Hello, John!"
```

### Pluralization
```json
{ "items": "You have {count, plural, =0 {no items} one {# item} other {# items}}" }
```
```tsx
t('items', { count: 5 }) // "You have 5 items"
```

### Select
```json
{ "status": "{status, select, active {Active} inactive {Inactive} other {Unknown}}" }
```

## Zod Validation with i18n

Create schema inside component to access translations:

```tsx
function MyForm() {
  const t = useTranslations('auth.validation');

  const schema = z.object({
    email: z.string()
      .min(1, t('emailRequired'))
      .email(t('emailInvalid')),
    password: z.string()
      .min(8, t('passwordMin8'))
  });

  // use schema with react-hook-form
}
```

## Best Practices

1. **Russian first** - ru locale is source of truth for types
2. **Flat when possible** - prefer `"saveButton"` over `{ "buttons": { "save": ... } }` for simple cases
3. **Namespace by feature** - admin panel in `admin`, auth in `auth`, etc.
4. **No hardcoded text** - all user-visible strings must use translations
5. **Keep keys semantic** - `"errors.notFound"` not `"error1"`

## Common Patterns

### Error messages
```json
{
  "errors": {
    "notFound": "Not found",
    "unauthorized": "Please log in",
    "generic": "Something went wrong"
  }
}
```

### Form labels
```json
{
  "form": {
    "email": "Email",
    "emailPlaceholder": "you@example.com",
    "password": "Password",
    "submit": "Submit"
  }
}
```

### Actions
```json
{
  "actions": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit"
  }
}
```

## Locale Switching

### Language Switcher Component

Use the `LanguageSwitcher` component for UI locale switching:

```tsx
import { LanguageSwitcher } from '@/components/language-switcher';

// In header/navigation
<LanguageSwitcher />
```

The component:
- Uses `useRouter` and `usePathname` from `@/src/i18n/navigation`
- Switches locale while preserving current path
- Shows current locale with flag icon

### Server Action (Manual)

For programmatic locale changes:

```tsx
// app/actions/i18n.ts - already implemented
import { setLocale } from '@/app/actions/i18n';

// Usage in client component
await setLocale('en');
router.refresh();
```

## Middleware

The i18n middleware is integrated with Supabase auth in `middleware.ts`:

```ts
import createMiddleware from 'next-intl/middleware';
import { routing } from '@/src/i18n/routing';

const intlMiddleware = createMiddleware(routing);

// Chain: next-intl → Supabase session
export async function middleware(request: NextRequest) {
  const intlResponse = intlMiddleware(request);
  // ... Supabase session handling
  return intlResponse;
}

export const config = {
  matcher: ['/((?!api|trpc|_next|_vercel|.*\\..*).*)',],
};
```

## Backend i18n (BullMQ Workers)

> Progress messages from course generation workers are localized via a lightweight i18n service.

### Quick Reference

| Item | Location |
|------|----------|
| Translator | `packages/course-gen-platform/src/shared/i18n/translator.ts` |
| Messages | `packages/course-gen-platform/src/shared/i18n/messages.ts` |
| Locale Schema | `packages/shared-types/src/bullmq-jobs.ts` (BaseJobDataSchema) |

### Usage in Workers

```typescript
import { getTranslator } from '@/shared/i18n';

const t = getTranslator(jobData.locale);
await updateProgress(courseId, t('stage2.docling_start'));
```

### Translation Format

Backend uses bilingual object format (not JSON files):

```typescript
// messages.ts
export const BACKEND_TRANSLATIONS = {
  stage2: {
    init: { ru: 'Инициализация...', en: 'Initializing...' },
    docling_start: { ru: 'Конвертация документа...', en: 'Converting document...' },
  },
  steps: {
    '2': {
      in_progress: { ru: 'Обработка документов', en: 'Processing documents' },
      completed: { ru: 'Документы обработаны', en: 'Documents processed' },
      failed: { ru: 'Ошибка обработки', en: 'Processing failed' },
    },
  },
} as const;
```

### Key Files

- **translator.ts**: `getTranslator(locale)` - factory returning translator function
- **messages.ts**: `BACKEND_TRANSLATIONS` - translation key/value object
- **index.ts**: Exports `getTranslator`, `Locale` type, `BACKEND_TRANSLATIONS`

### Adding New Stage Messages

1. Add keys to `messages.ts`:
```typescript
stage3: {
  init: { ru: 'Классификация...', en: 'Classifying...' },
  complete: { ru: 'Классификация завершена', en: 'Classification complete' },
},
```

2. Use in stage handler:
```typescript
const t = getTranslator(job.data.locale);
await this.updateCourseProgressInDB(courseId, t('stage3.init'));
```

### Locale Flow

1. Job created with `locale` field from `BaseJobDataSchema`
2. Worker reads `job.data.locale` (defaults to `'ru'`)
3. Translator returns correct language string
4. Progress message stored in DB via RPC
5. UI receives localized message via Supabase Realtime

### Current Limitations

- **Hardcoded locale**: Currently `locale: 'ru'` is hardcoded in job creation (TODO: derive from user session)
- **Stage coverage**: Only Stage 2 has detailed progress keys; other stages use generic step messages
- **No pluralization**: Simple `{{param}}` interpolation only

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Translation not showing | Check namespace exists in `config.ts` and JSON files |
| TypeScript error on key | Verify key exists in ru/*.json (source of truth) |
| Locale not switching | Check cookie in DevTools, verify Server Action works |
| Dev crash on missing key | Expected behavior - add the missing translation |
| 404 on all routes | Ensure pages are in `app/[locale]/` folder |
| Navigation loses locale | Use `Link` from `@/src/i18n/navigation`, not `next/link` |
| `typedRoutes` errors | Keep `typedRoutes: false` in next.config (incompatible with `[locale]`) |

## Checklist Before PR

### Architecture
- [ ] New pages placed in `app/[locale]/` folder
- [ ] Client navigation uses `@/src/i18n/navigation` (Link, useRouter, usePathname)
- [ ] Server redirects use `redirect` from `@/src/i18n/navigation`

### Translations
- [ ] Keys exist in BOTH `ru` and `en` files
- [ ] Structure is identical between locales
- [ ] No hardcoded user-visible text in components
- [ ] Semantic key names used
- [ ] ICU format for dynamic content
