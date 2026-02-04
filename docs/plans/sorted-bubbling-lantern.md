# План: Исправление проблем приоритизации документов и localStorage

## Контекст

**Источник:** Отчёт тестера для курса YEW-1770 на staging (ai.megacampus.ru)

**Проблема 1:** При смене приоритета документов с "дополнительные" на "ключевой"/"важный" система не даёт подтвердить приоритизацию. Работает только когда все документы помечены как "дополнительные".

**Проблема 2:** При создании нового курса старые загруженные документы остаются подгруженными из предыдущей сессии.

---

## Анализ

### Проблема 1: Приоритизация документов

**Корневая причина:** Backend endpoint `approveStage` для Stage 3 **не содержит валидации приоритетов документов**.

Код в `status.router.ts:264-313`:

```typescript
if (currentStage === 3) {
  // Прямое обновление статуса БЕЗ проверки приоритетов
  await supabase.from('courses').update({ generation_status: 'stage_4_init' }).eq('id', courseId);
  // ... создание job без валидации
}
```

**НО:** Тестер говорит "не даёт подтвердить" - значит ошибка возвращается откуда-то. Возможные причины:

1. Stage 4 worker падает при отсутствии CORE документа
2. Какая-то валидация на уровне BullMQ job
3. Ошибка в frontend при обработке response

**Требуется:** Добавить валидацию на backend ПЕРЕД переходом на Stage 4:

- Ровно 1 документ с приоритетом CORE
- Все документы имеют валидный приоритет (не null)

### Проблема 2: localStorage не очищается

**Корневая причина:** В `useFileUpload.ts` localStorage ключ `megacampus_upload_state` восстанавливается при mount, но **не очищается после успешного создания курса**.

Код в `useFileUpload.ts:79-111`:

```typescript
useEffect(() => {
  const savedState = localStorage.getItem(UPLOAD_STATE_KEY);
  if (savedState) {
    // Восстанавливает ВСЕ успешные файлы из localStorage!
    const restoredFiles = parsed.files.filter(f => f.status === 'success' || f.status === 'error');
    setUploadedFiles(restoredFiles);
  }
}, []);
```

После успешного создания курса (`useSubmitCourse.ts:171`):

```typescript
router.push(buildCourseGeneratingUrl(...))
// localStorage.removeItem(UPLOAD_STATE_KEY) - НЕ ВЫЗЫВАЕТСЯ!
```

---

## План реализации

### Задача 1: Добавить валидацию приоритетов в approveStage

**Файл:** `packages/course-gen-platform/src/server/routers/generation/status.router.ts`

**Изменения:**

1. Перед переходом Stage 3 → 4 добавить проверку:

   ```typescript
   // Получить документы с приоритетами
   const { data: documents } = await supabase
     .from('file_catalog')
     .select('id, filename, priority')
     .eq('course_id', courseId);

   // Валидация: должен быть ровно 1 CORE документ
   const coreCount = documents?.filter(d => d.priority === 'CORE').length ?? 0;
   if (coreCount !== 1) {
     throw new TRPCError({
       code: 'BAD_REQUEST',
       message:
         coreCount === 0
           ? 'Необходимо выбрать один ключевой документ'
           : 'Может быть только один ключевой документ',
     });
   }

   // Валидация: все документы должны иметь приоритет
   const withoutPriority = documents?.filter(d => !d.priority);
   if (withoutPriority && withoutPriority.length > 0) {
     throw new TRPCError({
       code: 'BAD_REQUEST',
       message: 'Все документы должны иметь установленный приоритет',
     });
   }
   ```

### Задача 2: Очистка localStorage после создания курса

**Файл:** `packages/web/components/forms/create-course/_hooks/useFileUpload.ts`

**Изменения:**

1. Добавить функцию `clearUploadState`:

   ```typescript
   const clearUploadState = useCallback(() => {
     setUploadedFiles([]);
     localStorage.removeItem(UPLOAD_STATE_KEY);
   }, []);
   ```

2. Экспортировать `clearUploadState` из хука

**Файл:** `packages/web/components/forms/create-course/_hooks/useSubmitCourse.ts`

**Изменения:**

1. Получить `clearUploadState` из `useFileUpload`
2. Вызвать `clearUploadState()` после успешного создания курса перед `router.push()`

### Задача 3: Улучшить UX на frontend (опционально)

**Файл:** `packages/web/components/generation-graph/panels/output/PrioritizationView.tsx`

**Изменения:**

1. Добавить предупреждение если нет CORE документа:
   ```typescript
   const hasCore = documents.some(d => d.priority === 'CORE');
   // Показать предупреждение и заблокировать кнопку если нет CORE
   ```

---

## Критические файлы

| Файл                                                                            | Изменение                |
| ------------------------------------------------------------------------------- | ------------------------ |
| `packages/course-gen-platform/src/server/routers/generation/status.router.ts`   | Валидация приоритетов    |
| `packages/web/components/forms/create-course/_hooks/useFileUpload.ts`           | Функция clearUploadState |
| `packages/web/components/forms/create-course/_hooks/useSubmitCourse.ts`         | Вызов clearUploadState   |
| `packages/web/components/generation-graph/panels/output/PrioritizationView.tsx` | UI предупреждение (опц.) |

---

## Верификация

### Проблема 1 (приоритизация):

1. Создать тестовый курс с 2+ документами
2. Попробовать подтвердить Stage 3 без CORE документа → ожидать ошибку
3. Установить один документ как CORE → подтверждение должно пройти
4. Проверить что Stage 4 успешно запускается

### Проблема 2 (localStorage):

1. Загрузить документы на странице создания курса
2. Успешно создать курс
3. Вернуться на /create
4. Проверить что список файлов пустой
5. Проверить localStorage - ключ `megacampus_upload_state` должен отсутствовать

### Команды:

```bash
pnpm type-check
pnpm build
# Тест на dev.ai.megacampus.ru после деплоя
```

---

## Риски

1. **Существующие курсы без CORE:** Если есть курсы на Stage 3 awaiting approval без CORE документа, после изменения они не смогут продолжить. Решение: проверить наличие таких курсов в БД.

2. **Обратная совместимость:** Валидация добавляется только для новых approveStage вызовов, существующие курсы на Stage 4+ не затрагиваются.
