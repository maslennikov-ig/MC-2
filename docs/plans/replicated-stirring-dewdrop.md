# Fix: Восстановление прогресса генерации медиа при перезагрузке

## Проблема

При перезагрузке страницы прогресс генерации пропадает - показывается placeholder вместо прогресс-бара.

## Root Cause

SSR загружает только `status = 'completed'` enrichments (`page.tsx:199`).

## Исправления

1. **page.tsx**: Убрать фильтр `.eq('status', 'completed')` - загружать все статусы кроме failed/cancelled

2. **useEnrichmentGeneration.ts**: Добавить `resumeGeneration()` для возобновления polling

3. **EnrichmentsPanel.tsx**: При mount автоматически возобновлять polling для активных генераций

4. **UnifiedEnrichmentCard.tsx**: Для `draft_ready` показать текстовые описания вариантов

## Файлы

- `packages/web/app/[locale]/courses/[slug]/page.tsx`
- `packages/web/lib/hooks/useEnrichmentGeneration.ts`
- `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`
- `packages/web/components/course/viewer/components/UnifiedEnrichmentCard.tsx`
