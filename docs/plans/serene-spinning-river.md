# План: Исправление Stage 4 сохранения и отображения полей

**GitHub Issues:** #6, #15, #19, #20

## Статус предыдущих задач

| Issue | Описание                                    | Статус        |
| ----- | ------------------------------------------- | ------------- |
| #7    | Уроков parameter ignored during Stage 5     | ✅ ИСПРАВЛЕНО |
| #8    | Модулей parameter not transmitted Stage 4→5 | ✅ ИСПРАВЛЕНО |
| #9    | Stage 5 UI не показывает Modules            | ✅ ИСПРАВЛЕНО |

**Коммит:** `7b226f6 feat(pipeline): pass user-edited params between stages`

---

## Новые задачи: Stage 4 Data Persistence

### Проблема #6, #19, #20: Данные Stage 4 теряются после approval

**Симптомы:**

- Пользователь редактирует поля "Подход к оценке", "Логика прогресса"
- Индикатор показывает "Сохранено"
- После approval данные возвращаются к исходным значениям

**Исследование показало:**

1. **Сохранение работает корректно:**
   - `updateFieldAction` → `generation.updateField` → UPDATE в `courses.analysis_result`
   - Файл: `field-update.router.ts:127-150`

2. **Проблема в загрузке данных:**
   - `GraphView.tsx:400-434` загружает только `course_structure, visual_style, style`
   - **НЕ загружает `analysis_result`** после approval!
   - UI показывает stale данные из initial SSR

3. **Поток данных:**
   ```
   SSR (page.tsx) → analysis_result в props → AnalysisResultView
   После approval: GraphView fetch → НЕ включает analysis_result!
   ```

### Решение P0: Исправить загрузку analysis_result

**Файл:** `packages/web/components/generation-graph/GraphView.tsx`
**Строки:** ~400-434

**Изменение:** Добавить `analysis_result` в fetch query:

```typescript
const { data: courseResult } = await supabase
  .from('courses')
  .select('course_structure, visual_style, style, analysis_result') // ADD analysis_result
  .eq('id', courseId)
  .single();
```

**Затем:** Передать в StaticGraphContext для использования в Stage4OutputTab

---

### Проблема #15: Индикатор сохранения на всех полях

**Симптомы:**

- При редактировании одного поля индикатор "Saving..." появляется на ВСЕХ полях
- UX confusion - непонятно какое поле сохраняется

**Причина:**

- Один общий `status` из `useAutoSave` применяется ко всем `EditableField`
- Файл: `AnalysisResultView.tsx:165-171`

### Решение P1: Per-field save status

**Файл:** `packages/web/components/generation-graph/panels/output/AnalysisResultView.tsx`

**Изменение:** Трекать статус сохранения per-field:

```typescript
// Вместо одного status для всех полей
const [savingFields, setSavingFields] = useState<Set<string>>(new Set());

// При сохранении поля:
const handleSave = async (fieldPath: string, value: unknown) => {
  setSavingFields(prev => new Set(prev).add(fieldPath));
  try {
    await save(fieldPath, value);
  } finally {
    setSavingFields(prev => {
      const next = new Set(prev);
      next.delete(fieldPath);
      return next;
    });
  }
};

// В EditableField:
<EditableField
  status={savingFields.has(fieldPath) ? 'saving' : 'idle'}
  ...
/>
```

---

## Файлы для изменения

| Файл                     | Изменение                        | P   |
| ------------------------ | -------------------------------- | --- |
| `GraphView.tsx`          | Добавить analysis_result в fetch | P0  |
| `AnalysisResultView.tsx` | Per-field save status tracking   | P1  |

---

## Верификация

1. `pnpm type-check` && `pnpm build`
2. **P0 Test:** Отредактировать "Подход к оценке" → Approve → Вернуться на Stage 4 → Значение сохранено
3. **P1 Test:** Отредактировать одно поле → Индикатор только на этом поле

---

## Действия перед началом

1. [ ] Закрыть issues #7, #8, #9 с комментариями
2. [ ] Создать Beads задачи для #6, #15
