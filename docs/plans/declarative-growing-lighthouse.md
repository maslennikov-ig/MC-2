# План: Inline Markdown Editor для уроков

## Задача

Реализовать inline markdown-редактор в lesson drawer (заменить TODO `handleEditLesson`).
Библиотека: `@uiw/react-md-editor` (4.6KB gzip, split-view, toolbar, dark mode).
UX: inline в drawer — по клику "Edit" preview-контент заменяется на редактор, Save/Cancel в header.

---

## Архитектура

### Data Flow

```
[rawMarkdown] → MDEditor(value, onChange) → [editedMarkdown]
                                                    ↓
                                         parseMarkdownToContent()
                                                    ↓
                                  { intro, sections, summary, exercises }
                                                    ↓
                              updateLessonContent(courseId, lessonId, content)
                                                    ↓
                                         refetchLessonInspector()
```

### Ключевое ограничение

Backend `lessonContentSchema` (`.strict()`) принимает ТОЛЬКО:

```typescript
{ intro?: string, sections?: {title, content}[], summary?: string, exercises?: unknown[] }
```

Поэтому нужен **парсер** `parseMarkdownToContent()` для обратной конвертации из rawMarkdown.

Маппинг (`buildMarkdownFromContent` → обратная функция):
| Markdown | Structured Field |
|----------|-----------------|
| Текст до первого `## ` | `intro` |
| `## Введение\n\n...` | `intro` |
| `## <Title>\n\n<body>` | `sections[].{title, content}` |
| `## Заключение\n...` | `summary` |
| `## Упражнения\n### <title>\n<desc>` | Остаётся в sections (exercises не парсим обратно — сложно, lossy) |

---

## Шаг 1: Установить `@uiw/react-md-editor`

```bash
pnpm --filter web add @uiw/react-md-editor
```

**Effort:** 1 минута

---

## Шаг 2: Создать утилиту `parseMarkdownToContent`

**Новый файл:** `packages/web/lib/markdown-content-parser.ts`

```typescript
interface ParsedLessonContent {
  intro?: string;
  sections?: { title: string; content: string }[];
  summary?: string;
}

export function parseMarkdownToContent(markdown: string): ParsedLessonContent;
```

Логика:

1. Разбить markdown по `## ` заголовкам (regex `/^## (.+)$/gm`)
2. Первый блок до первого `## ` → `intro` (если не пустой)
3. Секция `## Введение` / `## Introduction` → `intro`
4. Секция `## Заключение` / `## Summary` → `summary`
5. Все остальные секции → `sections[{title, content}]`
6. `## Упражнения` и подсекции → оставить в `sections` (не парсим как exercises для MVP)

**Effort:** 15 минут

---

## Шаг 3: Создать компонент `LessonMarkdownEditor`

**Новый файл:** `packages/web/components/generation-graph/panels/lesson/LessonMarkdownEditor.tsx`

```typescript
'use client';

interface LessonMarkdownEditorProps {
  initialContent: string; // rawMarkdown
  onSave: (content: ParsedLessonContent) => Promise<void>;
  onCancel: () => void;
  isSaving?: boolean;
}
```

Компонент:

- `dynamic(() => import('@uiw/react-md-editor'), { ssr: false })` — SSR не поддерживается
- State: `editedMarkdown` (string), инициализируется из `initialContent`
- Toolbar: стандартный (bold, italic, headers, link, image, code, list)
- Preview: split-view (встроенный в md-editor)
- Высота: `height={600}` или `100%` от контейнера
- Dark mode: через `data-color-mode` атрибут (определяем через `useTheme()`)
- Кнопки Save/Cancel вверху компонента
- Save: `parseMarkdownToContent(editedMarkdown)` → `onSave(parsed)`
- Unsaved changes guard: сравнение `editedMarkdown !== initialContent` перед Cancel

**Effort:** 30 минут

---

## Шаг 4: Интеграция в Stage6InspectorContent

**Файл:** `packages/web/components/generation-graph/panels/stage6/inspector/Stage6InspectorContent.tsx`

Изменения:

1. Добавить props: `isEditing: boolean`, `onSaveEdit: (content) => Promise<void>`, `onCancelEdit: () => void`, `isSaving: boolean`
2. В рендеринге preview tab — если `isEditing`, показать `LessonMarkdownEditor` вместо `MarkdownRendererFull`
3. Когда `isEditing` — скрыть action buttons (approve, regenerate, delete) и tab переключатели

```tsx
// В preview tab:
if (isEditing) {
  return (
    <LessonMarkdownEditor
      initialContent={rawMarkdown || ''}
      onSave={onSaveEdit}
      onCancel={onCancelEdit}
      isSaving={isSaving}
    />
  );
}
// Иначе — обычный MarkdownRendererFull
```

**Effort:** 15 минут

---

## Шаг 5: Прокинуть edit state через LessonInspector

**Файл:** `packages/web/components/generation-graph/panels/lesson/LessonInspector.tsx`

Добавить props:

- `isEditing?: boolean`
- `onSaveEdit?: (content: ParsedLessonContent) => Promise<void>`
- `onCancelEdit?: () => void`
- `isSaving?: boolean`

Прокинуть в `Stage6InspectorContent`.

**Effort:** 5 минут

---

## Шаг 6: Прокинуть edit state через LessonPanelWithTabs

**Файл:** `packages/web/components/generation-graph/panels/lesson/LessonPanelWithTabs.tsx`

Аналогично — добавить props и прокинуть в `LessonInspector`.

**Effort:** 5 минут

---

## Шаг 7: Реализовать edit flow в NodeDetailsDrawer

**Файл:** `packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx`

1. Новые state:

```typescript
const [isEditingLesson, setIsEditingLesson] = useState(false);
const [isSavingLesson, setIsSavingLesson] = useState(false);
```

2. Заменить `handleEditLesson`:

```typescript
const handleEditLesson = useCallback(() => {
  setIsEditingLesson(true);
}, []);

const handleSaveEdit = useCallback(
  async (content: ParsedLessonContent) => {
    if (!lessonInfoForInspector) return;
    setIsSavingLesson(true);
    try {
      await updateLessonContent(courseInfo.id, lessonInfoForInspector.lessonId, content);
      toast.success('Урок сохранён');
      setIsEditingLesson(false);
      refetchLessonInspector();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка сохранения');
    } finally {
      setIsSavingLesson(false);
    }
  },
  [lessonInfoForInspector, courseInfo.id, refetchLessonInspector]
);

const handleCancelEdit = useCallback(() => {
  setIsEditingLesson(false);
}, []);
```

3. Прокинуть в `LessonPanelWithTabs`:

```tsx
<LessonPanelWithTabs
  ...existing props...
  onEdit={handleEditLesson}
  isEditing={isEditingLesson}
  onSaveEdit={handleSaveEdit}
  onCancelEdit={handleCancelEdit}
  isSaving={isSavingLesson}
/>
```

4. Сбросить edit state при смене ноды:

```typescript
useEffect(() => {
  setIsEditingLesson(false);
}, [selectedNodeId]);
```

**Effort:** 15 минут

---

## Шаг 8: Dark mode для @uiw/react-md-editor

`@uiw/react-md-editor` использует `data-color-mode` атрибут. В `LessonMarkdownEditor`:

```tsx
const { resolvedTheme } = useTheme();
const colorMode = resolvedTheme === 'dark' ? 'dark' : 'light';

return (
  <div data-color-mode={colorMode}>
    <MDEditor value={editedMarkdown} onChange={setEditedMarkdown} height={600} />
  </div>
);
```

**Effort:** 5 минут

---

## Критические файлы

| Действие     | Файл                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------- |
| **Создать**  | `packages/web/lib/markdown-content-parser.ts`                                                 |
| **Создать**  | `packages/web/components/generation-graph/panels/lesson/LessonMarkdownEditor.tsx`             |
| **Изменить** | `packages/web/components/generation-graph/panels/stage6/inspector/Stage6InspectorContent.tsx` |
| **Изменить** | `packages/web/components/generation-graph/panels/lesson/LessonInspector.tsx`                  |
| **Изменить** | `packages/web/components/generation-graph/panels/lesson/LessonPanelWithTabs.tsx`              |
| **Изменить** | `packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx`                       |

**Переиспользуемые утилиты:**

- `updateLessonContent` — `packages/web/app/actions/lesson-actions.ts` (уже есть)
- `refetchLessonInspector` — уже деструктурирован в NodeDetailsDrawer
- `useTheme` / `useThemeSync` — для dark mode
- `buildMarkdownFromContent` — как reference для обратного парсера (`useLessonInspectorData.ts:319`)
- Backend schema: `lessonContentSchema` — `packages/course-gen-platform/src/server/routers/lesson-content/schemas.ts:105`

---

## Верификация

1. `pnpm --filter web type-check` — типы проходят
2. `pnpm --filter web build` — билд проходит
3. Визуальная проверка:
   - Открыть lesson в drawer → нажать Edit → появляется md-editor с rawMarkdown
   - Отредактировать текст → нажать Save → контент обновляется
   - Нажать Cancel → возврат к preview без изменений
   - Проверить dark mode — editor переключается вместе с темой
   - Проверить split-view preview в редакторе
4. Grep для TODO: `handleEditLesson` не содержит TODO

---

## Commit

```
feat(lesson-editor): add inline markdown editor for lesson content

- Install @uiw/react-md-editor for split-view markdown editing
- Add parseMarkdownToContent utility for markdown→structured conversion
- Create LessonMarkdownEditor component with dark mode support
- Integrate inline editing in Stage6InspectorContent preview tab
- Wire edit/save/cancel flow through NodeDetailsDrawer
- Replaces handleEditLesson TODO placeholder

Closes <beads-id>
```
