# Career Playbook — Frontend Architecture (Phases 4-7)

Компонентная иерархия, store design, UI flows.

## Route structure

```
app/[locale]/
├── career-playbook/
│   ├── page.tsx                 # Marketing landing (server)
│   ├── page-client.tsx          # Hero + sections + demo
│   ├── new/
│   │   ├── page.tsx             # Wizard route
│   │   └── page-client.tsx      # Wizard client
│   ├── [id]/
│   │   ├── page.tsx             # Viewer route
│   │   └── page-client.tsx      # Viewer client (also handles status='generating')
│   └── library/
│       └── page.tsx             # Library grid
└── share/
    └── career-playbook/
        └── [slug]/
            └── page.tsx         # Public read-only (no auth)
```

## Store: `useCareerPlaybookStore`

```typescript
// packages/web/stores/use-career-playbook-store.ts

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';

type WizardPhase = 'fixed' | 'followups' | 'completion';
type SessionStatus =
  | 'draft' | 'answering_fixed' | 'awaiting_followups'
  | 'answering_followups' | 'ready_to_generate'
  | 'generating' | 'completed' | 'failed';

interface CareerPlaybookState {
  // Session
  playbookId: string | null;
  status: SessionStatus;
  language: string;

  // Wizard state
  phase: WizardPhase;
  fixedQuestions: FixedQuestion[];
  fixedAnswers: Record<string, FixedAnswer>;
  currentFixedIndex: number;

  followupQuestions: FollowupQuestion[];
  followupAnswers: Record<string, FollowupAnswer>;
  currentFollowupIndex: number;
  completenessScore: number;

  freeformDrafts: FreeformDraft[];

  // Generation state
  generatedBlocks: Record<string, BlockState>;  // streaming-friendly
  thinkingStream: string;
  showThinking: boolean;
  finalMarkdown: string | null;
  costBreakdown: CostBreakdown | null;

  // Actions
  initSession: (lang: string) => Promise<void>;
  resumeSession: (id: string) => Promise<void>;
  submitFixedAnswer: (key: string, value: FixedAnswerValue) => Promise<void>;
  submitFollowupAnswer: (id: string, value: FollowupAnswerValue, skipped?: boolean) => Promise<void>;
  submitFreeform: (text: string) => Promise<void>;
  forceGenerate: () => Promise<void>;
  triggerGeneration: () => Promise<void>;

  // Viewer actions
  editBlock: (blockId: string, content: string) => Promise<void>;
  regenerateBlock: (blockId: string, instruction?: string) => Promise<void>;
  toggleShare: () => Promise<{share_slug: string} | null>;
  exportPDF: () => Promise<{url: string}>;
  createCourse: (uploadedDocs?: string[]) => Promise<{courseId: string}>;
}

export const useCareerPlaybookStore = create<CareerPlaybookState>()(
  persist(
    immer((set, get) => ({
      // ... initial state
      // ... action implementations с tRPC calls + SSE subscriptions
    })),
    {
      name: 'career-playbook-store',
      // persist только wizard state (для resume даже при offline)
      partialize: (s) => ({
        playbookId: s.playbookId,
        phase: s.phase,
        fixedAnswers: s.fixedAnswers,
        followupAnswers: s.followupAnswers,
        freeformDrafts: s.freeformDrafts
      })
    }
  )
);
```

## Component hierarchy

### Wizard (`/career-playbook/new`)

```
WizardPageClient
├── WizardHeader (logo, lang switcher)
├── ProgressIndicator (фиксированная часть, %completeness в Phase B)
├── PhaseRenderer
│   ├── if phase='fixed':
│   │   └── FixedQuestionsStep (current question)
│   │       └── QuestionRenderer
│   │           ├── OpenInput
│   │           ├── SingleChoice (RadioGroup cards)
│   │           └── MultiChoice (Checkbox grid)
│   ├── if phase='followups':
│   │   └── FollowupQuestionsStep
│   │       ├── QuestionRenderer
│   │       ├── SkipButton
│   │       └── CompletenessIndicator
│   └── if phase='completion':
│       └── CompletionScreen
│           ├── AnswersSummary (collapsed cards)
│           ├── EditPreviousAnswers link
│           └── GenerateButton (Primary CTA)
├── FreeFormButton (sticky bottom-right "Я расскажу свободно")
│   └── opens FreeFormDialog
└── DraftIndicator ("Черновик сохранён 2 сек назад")
```

### Generation View (`/career-playbook/[id]?status=generating`)

```
GenerationPageClient
├── StreamingHeader (progress: "Группа 3 из 6 — Люди и таланты")
├── ThinkingToggle (включить/выключить "Показывать мысли модели")
├── BlocksStream
│   ├── for each block:
│   │   ├── BlockSkeleton (если ещё не готов)
│   │   ├── BlockContent (markdown, streaming)
│   │   └── BlockStatus (✓ готов / ⟳ regen / ✗ failed)
└── CancelButton / RetryButton
```

### Viewer (`/career-playbook/[id]`)

```
ViewerPageClient
├── ViewerHeader
│   ├── PositionTitleH1
│   ├── MetadataChips (department, level, language)
│   └── ActionsBar (PDF / Share / Create Course / Delete)
├── ViewerLayout (sticky left TOC + content)
│   ├── BlockTOC (sticky sidebar, 26 chapters)
│   └── BlocksGrid
│       └── for each block:
│           ├── BlockHeader (number + title + actions)
│           ├── BlockContent (markdown с Mermaid)
│           └── BlockActions (Edit / Regenerate)
│               ├── EditDrawer (Tiptap или markdown editor)
│               └── RegenerateDialog (textarea "Что изменить?")
└── BottomCTA (если ещё нет course — "Создать курс из этого Role Guide")
```

### Library (`/career-playbook/library`)

```
LibraryPageClient
├── LibraryHeader (Title + "Создать новый" CTA)
├── FiltersBar (department, level, status, search)
├── PlaybooksGrid
│   └── PlaybookCard (title, dept, level, date, status, thumb)
└── BulkActions (если selected > 0: Delete / Export)
```

### Marketing Landing (`/career-playbook`)

```
LandingPageClient
├── HeroSection (ShaderBackground + headline + Primary CTA)
├── MethodologyShowcase
│   ├── for each methodology (Netflix, Amazon, Toyota, Spotify, Bridgewater):
│   │   └── MethodologyCard (expandable: что взяли, на какой блок повлияло)
│   └── BlocksGrid26 (визуализация 26 блоков с tooltip "что это")
├── InteractiveDemo
│   ├── DemoSelector (sales-manager-b2b / pre-loaded sample)
│   ├── PreviewPane (rendered Role Guide с annotations)
│   │   └── on hover any block → tooltip "Этот блок основан на Netflix Context over Control"
│   └── "Попробовать самому" CTA
├── ValueProposition (3 columns: вау-результат / экономия времени / готовый брифинг для курса)
├── FAQSection
└── CTAFooter
```

### Share view (`/share/career-playbook/[slug]`)

```
SharePageClient
├── ShareHeader (small "Создано на MC2", не путать с landing CTA)
├── PlaybookViewer (read-only, no actions)
└── ShareFooter
    └── "Создать свой Career Playbook" → /career-playbook (CTA)
```

## i18n

Все строки в `messages/{ru,en}/career-playbook.json`. Структура namespace:

```json
{
  "landing": {
    "heroTitle": "...",
    "heroSubtitle": "...",
    "ctaPrimary": "...",
    "methodologyTitle": "...",
    "methodologyCards": {
      "netflix": {"title": "Netflix Context over Control", "description": "..."},
      ...
    },
    "demoTitle": "...",
    "valueProps": {...},
    "faq": {...}
  },
  "wizard": {
    "phaseA": {"title": "Расскажите о роли", "step": "Шаг {current} из {total}"},
    "phaseB": {"title": "ИИ-уточнения", "completeness": "Полнота: {score}%"},
    "completion": {"title": "Готовы создать?", "cta": "Сгенерировать"},
    "freeform": {"button": "Я расскажу свободно", "placeholder": "..."},
    "draftSaved": "Черновик сохранён",
    "skip": "Пропустить",
    "back": "Назад",
    "next": "Далее"
  },
  "generation": {
    "groupProgress": "Группа {current} из 6 — {name}",
    "groupNames": {
      "foundation": "Основа",
      "operations": "Операционка",
      "people": "Люди и таланты",
      "growth": "Развитие",
      "system": "Система",
      "wrap": "Итог"
    },
    "showThinking": "Показывать мысли модели",
    "cancel": "Отменить"
  },
  "viewer": {
    "actions": {
      "pdf": "Скачать PDF",
      "share": "Поделиться",
      "createCourse": "Создать курс",
      "delete": "Удалить"
    },
    "blockActions": {
      "edit": "Редактировать",
      "regenerate": "Перегенерировать"
    },
    "shareDialog": {...},
    "createCourseDialog": {...}
  },
  "library": {
    "title": "Мои Role Guide",
    "empty": "Пока нет ни одного — создайте первый",
    "search": "Поиск...",
    "filters": {...}
  },
  "errors": {
    "generationFailed": "Не удалось сгенерировать. Попробуйте снова.",
    "webSearchFailed": "Не удалось найти материалы — попробуйте загрузить свои",
    ...
  }
}
```

Подключение в `packages/web/src/i18n/config.ts`:

```typescript
export const namespaces = [
  'common', 'admin', 'generation', 'auth',
  'enrichments', 'course', 'organizations', 'profile',
  'career-playbook',  // NEW
] as const;
```

## Streaming UX

Phase B follow-ups streamed через tRPC subscription (если уже используется в Stage 5 chat) ИЛИ SSE через REST endpoint:

```typescript
// Frontend
const sub = trpc.careerPlaybook.subscribeToFollowupGeneration.useSubscription(
  { playbookId },
  {
    onData(question) {
      addFollowupQuestion(question);
    },
    onError(err) {
      toast.error(err.message);
    }
  }
);
```

Streaming блоков в Generation view — аналогично:

```typescript
const sub = trpc.careerPlaybook.subscribeToGenerationProgress.useSubscription(
  { playbookId },
  {
    onData(event) {
      switch (event.type) {
        case 'block_started': addBlockSkeleton(event.blockId); break;
        case 'block_chunk': appendToBlock(event.blockId, event.chunk); break;
        case 'block_completed': finalizeBlock(event.blockId); break;
        case 'thinking_chunk': appendThinking(event.text); break;
        case 'group_completed': updateGroupProgress(event.groupId); break;
        case 'completed': setStatus('completed'); break;
        case 'failed': setStatus('failed'); break;
      }
    }
  }
);
```

## Design system

Используем:
- Существующие violet/pink цвета из `app/globals.css`
- shadcn компоненты (Button, Card, Dialog, Sheet, RadioGroup, Checkbox, Textarea, Tooltip)
- Framer Motion для transitions между шагами wizard (slide left/right)
- Paper Shaders на hero (landing) + transition между phases
- `MarkdownRendererClient` для рендера блоков (поддерживает streaming)
- Manrope шрифт для headlines, JetBrains Mono для code

Никаких новых design tokens — используем существующие.

## Accessibility

- Все интерактивные элементы — keyboard navigable
- ARIA labels на actions (Edit, Regenerate, ...)
- Live region для streaming progress
- Skip links на длинных страницах (особенно viewer с TOC)
- Focus management при transitions между phases
