# P3.3: Унификация i18n (GRAPH_TRANSLATIONS → next-intl)

## Резюме

**Проблема:** Две параллельные системы i18n в packages/web:

- `GRAPH_TRANSLATIONS` в `lib/generation-graph/translations.ts` (1375 строк) — 28 файлов
- `next-intl` с `messages/{en,ru}/generation.json` (330+ ключей) — 3+ файлов

**Цель:** Мигрировать все 28 файлов на next-intl, удалить кастомную систему.

**Оценка:** 8-9 рабочих дней

---

## Beads Issue

**ID:** `mc2-???` (создать через `bd create`)

```bash
bd create --title="P3.3: Унификация i18n (GRAPH_TRANSLATIONS → next-intl)" \
  --type=task \
  --priority=3 \
  --labels=frontend,i18n,tech-debt \
  --description="Миграция 28 файлов с GRAPH_TRANSLATIONS на next-intl. 8-9 дней."
```

---

## Текущее состояние

### GRAPH_TRANSLATIONS (удалить)

**Файл:** `packages/web/lib/generation-graph/translations.ts`

**Структура:**

```
stages, status, actions, drawer, stageDescriptions
refinementChat, errors, retry, mobile, viewToggle
longRunning, metrics, completionMessages
analysisResult (35 ключей), courseStructure (45 ключей)
stage1 (50), stage2 (80), stage3 (50), stage4 (60), stage5 (50), stage6 (60)
enrichments, endNode, selectionToolbar, common
```

**Формат:** `{ key: { ru: string, en: string } }`

### next-intl generation.json (расширить)

**Файлы:** `packages/web/messages/{en,ru}/generation.json`

**Уже есть (330+ ключей):**

- stages (6), status (6), actions (7), drawer (8)
- refinementChat (20+), errors (3), retry (4), mobile (3)
- viewToggle (2), longRunning (4), metrics (4), completionMessages (6)
- analysisResult (30+), courseStructure (50+), restart (6)
- stepNames (40+), missionControl (15+), stats (20+), globalChat (20+)

**Нужно добавить (~500 ключей):**

- stage1-6 sections (каждый 50-80 ключей)
- stageDescriptions (7)
- common (10)
- endNode (20)
- selectionToolbar (15)

---

## Файлы для миграции (28 файлов)

### Shared Components (10 файлов)

| Файл                                    | Usages |
| --------------------------------------- | ------ |
| `panels/output/SaveStatusIndicator.tsx` | 1      |
| `panels/output/EditableField.tsx`       | 1      |
| `components/SelectionToolbar.tsx`       | ?      |
| `nodes/EndNode.tsx`                     | ?      |
| `panels/EndNodePanel.tsx`               | ?      |
| `nodes/AssetDock.tsx`                   | ?      |
| `controls/RestartConfirmDialog.tsx`     | ?      |
| `controls/ApprovalControls.tsx`         | ?      |
| `controls/ConnectionStatus.tsx`         | ?      |
| `controls/LongRunningIndicator.tsx`     | ?      |

### Stage 1 (4 файла)

- `panels/stage1/Stage1InputTab.tsx` (3)
- `panels/stage1/Stage1ProcessTab.tsx` (3)
- `panels/stage1/Stage1OutputTab.tsx` (1)
- `panels/stage1/Stage1ActivityTab.tsx` (3)

### Stage 2 (5 файлов)

- `panels/stage2/Stage2InputTab.tsx` (3)
- `panels/stage2/Stage2ProcessTab.tsx` (5)
- `panels/stage2/Stage2OutputTab.tsx` (1)
- `panels/stage2/Stage2ActivityTab.tsx` (2)

### Stage 3 (4 файла)

- `panels/stage3/Stage3InputTab.tsx` (2)
- `panels/stage3/Stage3ProcessTab.tsx` (3)
- `panels/stage3/Stage3OutputTab.tsx` (2)
- `panels/stage3/Stage3ActivityTab.tsx` (2)

### Stage 4 (5 файлов)

- `panels/stage4/Stage4InputTab.tsx` (3)
- `panels/stage4/Stage4ProcessTab.tsx` (5)
- `panels/stage4/Stage4OutputTab.tsx` (2)
- `panels/stage4/Stage4ActivityTab.tsx` (2)
- `panels/stage4/VisualStylePreview.tsx` (1)

### Stage 5 (6 файлов)

- `panels/stage5/Stage5InputTab.tsx` (1)
- `panels/stage5/Stage5ProcessTab.tsx` (3)
- `panels/stage5/Stage5OutputTab.tsx` (1)
- `panels/stage5/Stage5ActivityTab.tsx` (2)
- `panels/stage5/components/StructureTree.tsx` (2)
- `panels/stage5/components/BlueprintPreview.tsx` (1)

### Stage 6 (2 файла)

- `panels/stage6/dashboard/Stage6ControlTower.tsx` (1)
- `panels/stage6/inspector/tabs/Stage6BlueprintTab.tsx` (1)

### Stage 7 / Enrichments (1 файл)

- `panels/stage7/EnrichmentStatusBadge.tsx` (1)

---

## Паттерн миграции

```typescript
// БЫЛО:
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import { useLocale } from 'next-intl';

const locale = useLocale();
const t = GRAPH_TRANSLATIONS.stage1;
const label = t?.topic?.[locale] ?? 'Topic';

// СТАЛО:
import { useTranslations } from 'next-intl';

const t = useTranslations('generation.stage1');
const label = t('topic');

// Интерполяция:
// БЫЛО: { greeting: { ru: 'Привет, {{name}}!', en: 'Hello, {{name}}!' } }
// СТАЛО: { "greeting": "Hello, {name}!" }  // одинарные скобки!
t('greeting', { name: 'John' });
```

---

## План по фазам

### Фаза 0: Подготовка (1 день)

- [ ] Создать Beads issue
- [ ] Аудит overlapping ключей между GRAPH_TRANSLATIONS и generation.json
- [ ] Создать таблицу маппинга ключей

### Фаза 1: Добавление ключей в JSON (1-2 дня)

- [ ] Добавить `stage1` section (~50 ключей) в en/ru
- [ ] Добавить `stage2` section (~80 ключей) в en/ru
- [ ] Добавить `stage3` section (~50 ключей) в en/ru
- [ ] Добавить `stage4` section (~60 ключей) в en/ru
- [ ] Добавить `stage5` section (~50 ключей) в en/ru
- [ ] Добавить `stage6` section (~60 ключей) в en/ru
- [ ] Добавить `stageDescriptions` section (7 ключей)
- [ ] Добавить `common` section (10 ключей)
- [ ] Добавить `endNode` section (20 ключей)
- [ ] Добавить `selectionToolbar` section (15 ключей)
- [ ] Исправить интерполяцию: `{{var}}` → `{var}`
- [ ] `pnpm type-check` & `pnpm build`

### Фаза 2: Миграция shared components (1 день)

- [ ] SaveStatusIndicator.tsx
- [ ] EditableField.tsx
- [ ] SelectionToolbar.tsx
- [ ] EndNode.tsx, EndNodePanel.tsx
- [ ] AssetDock.tsx
- [ ] RestartConfirmDialog.tsx, ApprovalControls.tsx
- [ ] ConnectionStatus.tsx, LongRunningIndicator.tsx
- [ ] `pnpm type-check` & `pnpm build`

### Фаза 3-8: Миграция stage components (3 дня)

- [ ] Stage 1 components (4 файла)
- [ ] Stage 2 components (5 файлов)
- [ ] Stage 3 components (4 файла)
- [ ] Stage 4 components (5 файлов)
- [ ] Stage 5 components (6 файлов)
- [ ] Stage 6 components (2 файла)
- [ ] `pnpm type-check` & `pnpm build` после каждого stage

### Фаза 9: Stage 7 / Enrichments (0.5 дня)

- [ ] EnrichmentStatusBadge.tsx
- [ ] Проверить остальные enrichment компоненты

### Фаза 10: Оставшиеся компоненты (0.5 дня)

- [ ] GraphView.tsx, GraphHeader.tsx
- [ ] RefinementChat.tsx, NodeDetailsDrawer.tsx
- [ ] QuickActions.tsx, LessonPanelWithTabs.tsx
- [ ] StageNode.tsx, MinimalNode.tsx
- [ ] RejectionModal.tsx

### Фаза 11: Cleanup (0.5 дня)

- [ ] Удалить `lib/generation-graph/translations.ts`
- [ ] Удалить `lib/generation-graph/useTranslation.ts`
- [ ] Удалить/обновить GraphTranslations type из `shared-types/src/generation-graph.ts`
- [ ] Обновить `.claude/docs/i18n-guide.md` с паттернами миграции
- [ ] Final `pnpm type-check` & `pnpm build`
- [ ] Визуальная проверка всех stage panels в обеих локалях

---

## JSON структура для новых ключей

```json
{
  "stage1": {
    "identity": "Identity",
    "topic": "Course Topic",
    "description": "Description",
    "targetAudience": "Target Audience",
    "difficulty": "Difficulty",
    "format": "Course Format",
    "parameters": "Course Parameters"
  },
  "stage2": {
    "fileDNA": "File DNA",
    "pipeline": "Processing Pipeline",
    "docling": "Document Conversion",
    "chunking": "Text Chunking",
    "embedding": "Creating Embeddings",
    "indexing": "Indexing"
  },
  "stage3": {
    "classification": "Document Classification",
    "priority": "Priority",
    "relevance": "Relevance Score"
  },
  "stage4": {
    "analysis": "Deep Analysis",
    "topic": "Topic Analysis",
    "structure": "Structure Recommendation",
    "pedagogy": "Pedagogical Strategy"
  },
  "stage5": {
    "structure": "Course Structure",
    "sections": "Sections",
    "lessons": "Lessons",
    "blueprint": "Blueprint"
  },
  "stage6": {
    "controlTower": { ... },
    "lessonCard": { ... },
    "tabs": { ... },
    "nodes": { ... }
  },
  "stageDescriptions": {
    "stage_1": "Course passport with basic parameters",
    "stage_2": "Document processing and indexing",
    "stage_3": "Document classification and prioritization",
    "stage_4": "Deep analysis and recommendations",
    "stage_5": "Course structure formation",
    "stage_6": "Lesson content generation"
  },
  "common": {
    "moduleWord": "module",
    "lessonWord": "lesson",
    "saving": "Saving...",
    "characters": "characters",
    "loading": "Loading..."
  },
  "endNode": {
    "finish": "Finish",
    "courseReady": "Course Ready!",
    "viewCourse": "View Course",
    "downloadOLX": "Download OLX"
  },
  "selectionToolbar": {
    "generateAll": "Start All",
    "retrySelected": "Retry Selected",
    "approveSelected": "Approve Selected"
  }
}
```

---

## Верификация

### После каждой фазы:

```bash
pnpm type-check
pnpm build
```

### После завершения:

- [ ] Проверить все stage panels в браузере (EN локаль)
- [ ] Проверить все stage panels в браузере (RU локаль)
- [ ] Проверить интерполяцию переменных
- [ ] Проверить pluralization (если есть)
- [ ] Убедиться что translations.ts удалён
- [ ] Убедиться что useTranslation.ts удалён

---

## Критические файлы

| Файл                                     | Действие                       |
| ---------------------------------------- | ------------------------------ |
| `messages/en/generation.json`            | Расширить +500 ключей          |
| `messages/ru/generation.json`            | Расширить +500 ключей          |
| `lib/generation-graph/translations.ts`   | УДАЛИТЬ                        |
| `lib/generation-graph/useTranslation.ts` | УДАЛИТЬ                        |
| `shared-types/src/generation-graph.ts`   | Удалить GraphTranslations type |
| `.claude/docs/i18n-guide.md`             | Обновить с паттернами          |

---

## Решения по дизайну

1. **useGenerationTranslations hook** — НЕ создаём. next-intl уже даёт полную типизацию.

2. **Stage namespaces** — Используем dot notation: `useTranslations('generation.stage1')`

3. **Порядок миграции** — Shared components первыми, потом stage-by-stage.

4. **Backwards compatibility** — Оставляем useTranslation hook до полной миграции.

5. **i18n-guide.md** — Обновить в Фазе 11 с паттернами миграции.
