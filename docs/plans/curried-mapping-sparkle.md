# План: Исправление Share API URL после миграции

## Проблема

Ошибка 405 (Method Not Allowed) при попытке создать публичную ссылку на курс.

**Причина:** API route использует новый формат `/api/courses/[orgSlug]/[courseSlug]/share`, но клиентский код вызывает старый формат `/api/courses/${slug}/share`.

## Анализ

### API Route Handler (ПРАВИЛЬНЫЙ)

**Файл:** `packages/web/app/api/courses/[orgSlug]/[courseSlug]/share/route.ts`

- Ожидает: `/api/courses/{orgSlug}/{courseSlug}/share`
- Методы: POST (создать токен), DELETE (удалить токен)

### Клиентский код (НЕПРАВИЛЬНЫЙ)

**Файл:** `packages/web/components/courses/share-button.tsx`

```typescript
// Строки 152 и 232 - СТАРЫЙ формат
const response = await fetchWithRetry(`/api/courses/${slug}/share`, {...})
```

**Файл:** `packages/web/app/[locale]/courses/_components/course-card.tsx`

```typescript
// Строки 416-422 и 788-794 - передаёт только slug
<ShareButton
  slug={courseSlug}  // ❌ нужен ещё orgSlug
  ...
/>
```

## План исправления

### Шаг 1: Обновить ShareButton компонент

**Файл:** `packages/web/components/courses/share-button.tsx`

1. Изменить интерфейс props:

```typescript
interface ShareButtonProps {
  orgSlug: string; // ДОБАВИТЬ
  courseSlug: string; // ПЕРЕИМЕНОВАТЬ из slug
  // ...остальные props
}
```

2. Обновить API вызовы (строки ~152 и ~232):

```typescript
// FROM:
`/api/courses/${slug}/share`
// TO:
`/api/courses/${orgSlug}/${courseSlug}/share`;
```

### Шаг 2: Обновить CourseCard компонент

**Файл:** `packages/web/app/[locale]/courses/_components/course-card.tsx`

1. Получить orgSlug из данных курса (нужно проверить откуда берётся)
2. Обновить оба места использования ShareButton (строки ~416 и ~788):

```typescript
<ShareButton
  orgSlug={orgSlug}        // ДОБАВИТЬ
  courseSlug={courseSlug}  // ПЕРЕИМЕНОВАТЬ
  ...
/>
```

### Шаг 3: Проверить источник orgSlug в CourseCard

Нужно проверить:

- Есть ли orgSlug в данных курса, которые приходят в компонент
- Если нет - добавить в запрос к БД

## Файлы для изменения

1. `packages/web/components/courses/share-button.tsx`
2. `packages/web/app/[locale]/courses/_components/course-card.tsx`
3. Возможно: источник данных курсов (если orgSlug отсутствует)

## Верификация

1. Открыть список курсов: `/courses`
2. Нажать "Поделиться" на карточке курса
3. Должна создаться публичная ссылка без ошибки 405
4. Проверить type-check: `pnpm type-check`
