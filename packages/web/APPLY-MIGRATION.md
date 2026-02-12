# Применение миграции lesson_duration_minutes

## ✅ Что уже сделано (Frontend)

1. ✅ Обновлен form schema (`create-course-form.tsx`)
2. ✅ Добавлено UI поле с выбором длительности (3-30 мин)
3. ✅ Добавлена авто-установка 3 мин для microlearning style
4. ✅ Обновлена submission logic (отправляет `lesson_duration_minutes`)
5. ✅ Создан SQL migration файл

## 🔄 Что нужно применить

### 1. Применить миграцию в Supabase

**Опция A: Через Supabase Dashboard (рекомендуется)**

```bash
# 1. Открыть https://supabase.com/dashboard/project/mmtpvtoifqpdcgiwwdvj
# 2. SQL Editor → New Query
# 3. Скопировать содержимое supabase/add_lesson_duration_minutes.sql
# 4. Run
```

**Опция B: Через Supabase CLI**

```bash
cd courseai-next
supabase db push
```

### 2. Перегенерировать TypeScript типы

```bash
cd courseai-next
npx supabase gen types typescript --project-id mmtpvtoifqpdcgiwwdvj > types/database.generated.ts
```

**Проверить результат:**

```typescript
// types/database.generated.ts должен содержать:
courses: {
  Row: {
    // ...
    lesson_duration_minutes: number // NEW
  }
}
```

### 3. Обновить backend workflows (n8n)

Следовать инструкциям из:

- `/home/me/code/courseai_n8n/n8n/MIGRATION-LESSON-DURATION.md`

**Файлы для обновления:**

1. Main Entry (17).json
2. Course Structure Analyze (22).json
3. Course Structure Generate (26).json
4. Document Processing (35).json
5. Text Generation (FINAL-json2md).json

## 🧪 Тестирование

После применения миграции:

1. **Frontend тест:**

   ```bash
   cd courseai-next
   pnpm dev
   ```

   - Открыть форму создания курса
   - Проверить что поле "Длительность урока" отображается
   - Выбрать "Микрообучение" → должно auto-set 3 минуты
   - Создать тестовый курс

2. **Database тест:**

   ```sql
   SELECT id, title, lesson_duration_minutes
   FROM courses
   ORDER BY created_at DESC
   LIMIT 5;
   ```

   Должно показать lesson_duration_minutes = 5 (или выбранное значение)

3. **n8n workflow тест:**
   - Запустить Text Generation workflow
   - Проверить что получает `lesson_duration_minutes`
   - Проверить что Zod лимиты масштабируются правильно

## ⚠️ Откат (если что-то пошло не так)

```sql
-- Откатить миграцию
ALTER TABLE public.courses DROP COLUMN IF EXISTS lesson_duration_minutes;

-- Восстановить prerequisites (если дропнули)
ALTER TABLE public.courses ADD COLUMN prerequisites TEXT;
```

## 📋 Checklist

- [ ] Миграция применена в Supabase
- [ ] TypeScript типы перегенерированы
- [ ] Frontend форма работает
- [ ] Поле lesson_duration_minutes сохраняется в БД
- [ ] n8n workflows обновлены
- [ ] End-to-end тест пройден (создание курса → генерация урока)
