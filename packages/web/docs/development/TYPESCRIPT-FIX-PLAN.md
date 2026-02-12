# План исправления TypeScript ошибок с Supabase

## Проблема

У нас замкнутый круг с TypeScript и Supabase:

1. Supabase неправильно выводит типы → получаем `never`
2. Добавляем `as any` чтобы исправить → ESLint жалуется на `any`
3. При сборке `any` не может быть присвоен `never` → сборка падает

## Варианты решения (по приоритету)

### 🥇 Вариант 1: Сгенерировать правильные типы Supabase (РЕКОМЕНДУЕТСЯ)

**Приоритет: ВЫСОКИЙ**
**Сложность: Средняя**
**Время: 30-60 минут**

```bash
# Установить Supabase CLI если нет
npm install -g supabase

# Сгенерировать типы из БД
supabase gen types typescript --project-id your-project-id > types/database.types.ts
```

Затем использовать сгенерированные типы:

```typescript
import { Database } from '@/types/database.types'

// Использовать типы для update
type CourseUpdate = Database['public']['Tables']['courses']['Update']
await supabase.from('courses').update({ is_published: !isPublished } as CourseUpdate)
```

**Плюсы:**

- Полная type safety
- Автокомплит в IDE
- Нет `any` в коде

**Минусы:**

- Нужно периодически обновлять типы
- Требует настройки CI/CD

---

### 🥈 Вариант 2: Создать собственные типы для проблемных мест

**Приоритет: СРЕДНИЙ**
**Сложность: Низкая**
**Время: 15-30 минут**

Создать файл `types/supabase-overrides.ts`:

```typescript
// Типы для конкретных операций
export type CourseUpdatePayload = {
  is_published?: boolean
  title?: string
  description?: string
  // ... другие поля
}

export type SectionFromDB = {
  id: string
  section_number: number
  course_id: string
  // ... другие поля
}

export type LessonFromDB = {
  id: string
  lesson_number: number
  section_id: string
  // ... другие поля
}
```

Использование:

```typescript
import { CourseUpdatePayload } from '@/types/supabase-overrides'

await supabase.from('courses').update({ is_published: !isPublished } satisfies CourseUpdatePayload)

// Для map операций
sections?.map((s: SectionFromDB) => s.id)
```

**Плюсы:**

- Быстрое решение
- Полный контроль над типами
- Нет зависимости от генерации

**Минусы:**

- Ручная поддержка типов
- Могут расходиться с БД

---

### 🥉 Вариант 3: Использовать type assertions с Database типами

**Приоритет: НИЗКИЙ (временное решение)**
**Сложность: Очень низкая**
**Время: 5-10 минут**

```typescript
// Вместо as any используем конкретные типы
await supabase
  .from('courses')
  .update({ is_published: !isPublished } as Pick<Course, 'is_published'>)

// Для массивов
const typedSections = sections as Array<{ id: string; section_number: number }>
typedSections?.map((s) => s.id)
```

**Плюсы:**

- Минимальные изменения
- Быстрое исправление

**Минусы:**

- Не решает корневую проблему
- Type assertions небезопасны

---

### ❌ Вариант 4: Отключить ESLint правила (НЕ РЕКОМЕНДУЕТСЯ)

**Приоритет: ОЧЕНЬ НИЗКИЙ**
**Сложность: Очень низкая**
**Время: 2 минуты**

В `.eslintrc.js`:

```javascript
rules: {
  '@typescript-eslint/no-explicit-any': 'warn', // или 'off'
}
```

Или локально:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
sections?.map((s: any) => s.id)
```

**Плюсы:**

- Самое быстрое "решение"

**Минусы:**

- Теряем type safety
- Технический долг
- Не решает проблему с `never`

---

## Рекомендуемый план действий

### Шаг 1: Быстрое исправление для деплоя (5 минут)

```typescript
// app/courses/actions.ts - убрать as any, использовать @ts-ignore
// @ts-ignore - Supabase type inference issue
await supabase.from('courses').update({ is_published: !isPublished })
```

### Шаг 2: Создать временные типы (15 минут)

Создать `types/supabase-overrides.ts` с типами для проблемных мест

### Шаг 3: Настроить генерацию типов (30 минут)

1. Установить Supabase CLI
2. Сгенерировать типы
3. Обновить все импорты
4. Настроить GitHub Action для автоматической генерации

### Шаг 4: Рефакторинг (постепенно)

Постепенно заменять все `any` и `@ts-ignore` на правильно типизированный код

---

## Проверка после исправления

```bash
# Локальная проверка
pnpm type-check  # Должно пройти
pnpm build       # Должно собраться
pnpm lint        # Минимум warnings

# Docker build
docker build -t courseai-test .
```

---

## Полезные ссылки

- [Supabase TypeScript Guide](https://supabase.com/docs/guides/api/rest/generating-types)
- [Next.js TypeScript](https://nextjs.org/docs/app/building-your-application/configuring/typescript)
- [Решение проблем с never type](https://github.com/supabase/supabase-js/issues/756)

---

## Итог

**Для срочного деплоя:** используйте `@ts-ignore` (Шаг 1)
**Для долгосрочного решения:** настройте генерацию типов (Вариант 1)

---

## TODO: Убрать быстрые исправления

### ⚠️ ВАЖНО: Временные исправления применены для деплоя (2025-01-14)

В данный момент для срочного деплоя были удалены неиспользуемые `@ts-expect-error` директивы в следующих файлах:

1. **app/api/courses/paginated/route.ts**
   - Удален `@ts-expect-error` на строке ~189 (проверка firstItem)
   - TypeScript больше не видит ошибки в этих местах

2. **app/courses/[slug]/page.tsx**
   - Удалены три `@ts-expect-error` директивы:
     - Строка ~46 (получение lessons)
     - Строка ~53 (получение assets)
     - Строки ~72 и ~84 (трансформация данных)

3. **app/courses/actions.ts**
   - Удален `@ts-expect-error` на строке ~362 (update операция)

### 📋 План по удалению быстрых исправлений:

1. **Настроить генерацию типов Supabase (приоритет: ВЫСОКИЙ)**

   ```bash
   supabase gen types typescript --project-id your-project-id > types/database.generated.ts
   ```

2. **Обновить все импорты типов**
   - Заменить `@/types/database` на `@/types/database.generated`
   - Использовать сгенерированные типы для всех операций с БД

3. **Проверить и удалить оставшиеся type assertions**
   - Найти все места с `as any`
   - Заменить на правильные типы из сгенерированного файла

4. **Настроить автоматическую генерацию типов в CI/CD**
   - Добавить в GitHub Actions шаг генерации типов
   - Проверять соответствие типов при каждом PR

### 🔍 Поиск оставшихся быстрых исправлений:

```bash
# Найти все @ts-ignore и @ts-expect-error
grep -r "@ts-ignore\|@ts-expect-error" app/ components/ lib/

# Найти все as any
grep -r "as any" app/ components/ lib/
```

### ✅ Критерии завершения:

- [ ] Сгенерированы актуальные типы из БД
- [ ] Удалены все `@ts-ignore` и `@ts-expect-error`
- [ ] Удалены все `as any` связанные с Supabase
- [ ] Сборка проходит без warnings о типах
- [ ] Настроена автоматическая генерация типов
