# Career Playbook — новый трек платформы MC2

Date: 2026-05-13
Owner: maslennikov-ig
Status: Draft (awaiting approval)

## Context

Сейчас на MC2 есть один продуктовый трек — генерация курсов (Stage 1-6 pipeline через LangGraph + BullMQ). Параллельно у нас есть готовый Claude Code skill `.claude/skills/job-description/` (v2, 26 блоков), который через intern-консольный flow умеет создавать "Role Guide" — расширенную должностную инструкцию на основе методологий Netflix/Amazon/Toyota/Spotify/Bridgewater (есть пример `docs/job-descriptions/sales-manager-b2b.md`, 812 строк).

Прежнее решение от 22.03.2026 (memory `project_jd_catalog.md`) предполагало catalog pre-generated JDs как lead magnet. Это решение пересматривается: Role Guide получился слишком персонализированным под конкретную компанию для catalog-модели, а более ценная стратегия — дать пользователю интерактивный конструктор. Сгенерированные пользователями Role Guide опционально образуют public catalog через шеринг.

Цель этого плана — спроектировать новый продуктовый трек "Career Playbook":
1. Интерактивный конструктор Q&A с adaptive-логикой (часть вопросов фиксированы, часть генерируется LLM)
2. Поэтапная согласованная генерация 26 блоков (по модели Stage 6 lessons)
3. Marketing-лендинг с методологией и interactive demo
4. Мост к существующему генератору курсов: кнопка "Создать курс" с авто-генерацией source corpus

Главная ценность: lead magnet для платформы (привлекает HR/бизнес-владельцев) → конвертация в course generation.

## Product Decisions

| # | Решение | Источник |
|---|---|---|
| 1 | **Каталога нет.** Только конструктор. User-generated. Опциональный шеринг = зародыш будущего catalog | brainstorm 2026-05-12 |
| 2 | **26 блоков** в MVP, поэтапная генерация ради качества и согласованности | brainstorm 2026-05-12 |
| 3 | **Languages:** UI ru+en, content генерируется на всех языках, поддерживаемых Stage 6 (тот же `language` параметр) | brainstorm 2026-05-12 |
| 4 | **Authorized only.** Lead magnet — 1 бесплатный пробный (в MVP — безлимитно для авторизованных) | brainstorm 2026-05-12 |
| 5 | **Adaptive Q&A:** 5-7 fixed start вопросов + 3-7 LLM follow-ups + "Я расскажу свободно" опция | brainstorm 2026-05-12 |
| 6 | **Block generation:** RoleProfileSpec → 6 групп блоков последовательно, judge между группами | brainstorm 2026-05-12 |
| 7 | **Methodology page:** marketing landing + interactive demo (показ sample sales-manager-b2b) | brainstorm 2026-05-12 |
| 8 | **Post-generation:** view, edit, регенерация блоков, PDF (HTML→PDF stylish), личная библиотека, шеринг по ссылке, кнопка "Создать курс" | brainstorm 2026-05-12 |
| 9 | **JD→Course:** Role Guide + auto WebSearch (~5-10 статей по competencies/trends) → synthetic source corpus → существующий Stage 3-6 pipeline | brainstorm 2026-05-12 |
| 10 | **Routing:** `/career-playbook` (брендирование) | brainstorm 2026-05-12 |

## Architecture Overview

Новый трек реализован как параллельный pipeline `stage-career-playbook`, использующий те же инфраструктурные паттерны, что и `stage6-lesson-content`:

```
Frontend                       Backend (course-gen-platform)
────────                       ──────────────────────────────
/career-playbook (landing)
/career-playbook/new (wizard)  ──tRPC──> careerPlaybook.* router
/career-playbook/[id] (view)        │
/career-playbook/library            │
/share/career-playbook/[slug]       ▼
                              BullMQ queue (CAREER_PLAYBOOK_*)
                                    │
                                    ▼
                              LangGraph stage-career-playbook
                              (RoleProfileSpec → groups → judge)
                                    │
                                    ▼
                              Supabase career_playbooks table
                              + course bridge endpoint
```

## Critical Files

### New backend files

| Файл | Назначение | Базируется на |
|---|---|---|
| `packages/shared-types/src/career-playbook.ts` | Zod schemas + TS types (Question, Answer, RoleProfileSpec, BlockState) | `packages/shared-types/src/clarifying-questions.ts` |
| `packages/course-gen-platform/src/server/routers/career-playbook/index.ts` | tRPC root router | `routers/clarifying.router.ts` |
| `.../career-playbook/session.router.ts` | start/get/submitAnswer/getDraft | `clarifying.router.ts` |
| `.../career-playbook/generation.router.ts` | approveAndGenerate, getStatus (SSE), getBlock | `routers/generation/index.ts` |
| `.../career-playbook/library.router.ts` | list, get, delete, regenerateBlock, edit | `routers/lessonContent.router.ts` |
| `.../career-playbook/share.router.ts` | shareToggle, getPublicBySlug | новый паттерн (RLS-based) |
| `.../career-playbook/course-bridge.router.ts` | createCourseFromPlaybook | использует существующий `generation.start` |
| `packages/course-gen-platform/src/stages/stage-career-playbook/state.ts` | LangGraph `Annotation.Root` state | `stage6-lesson-content/state.ts` |
| `.../stage-career-playbook/graph.ts` | StateGraph wiring (start → spec → groups → judge → END) | `stage6-lesson-content/graph.ts` |
| `.../stage-career-playbook/nodes/spec-builder.ts` | LLM собирает RoleProfileSpec из Q&A + WebSearch | новый |
| `.../stage-career-playbook/nodes/group-generator.ts` | Универсальная нода генерации группы блоков | `stage6-lesson-content/nodes/generator-node.ts` |
| `.../stage-career-playbook/nodes/cross-block-judge.ts` | Проверка согласованности между группами | `stage6-lesson-content/nodes/judge-node.ts` |
| `.../stage-career-playbook/nodes/block-regenerator.ts` | Targeted регенерация отдельного блока | `stage6-lesson-content/nodes/section-regenerator-node.ts` |
| `.../stage-career-playbook/nodes/followup-questions.ts` | LLM генерирует 3-7 adaptive follow-up вопросов после fixed-фазы | новый |
| `.../stage-career-playbook/rag/web-research.ts` | WebSearch по KPI/trends/onboarding (3 запроса, 5с timeout, fallback) | паттерн из skill SKILL.md:70-76 |
| `packages/course-gen-platform/src/orchestrator/handlers/career-playbook-handler.ts` | BullMQ job processor (job types: GENERATE_FOLLOWUPS, GENERATE_PLAYBOOK, REGENERATE_BLOCK) | `orchestrator/handlers/stage6-handler.ts` |
| `packages/course-gen-platform/src/shared/prompts/career-playbook-prompts.ts` | Промпты для 6 групп + spec builder + judge + followup + course brief (RU+EN+...) | `shared/prompts/stage6-prompts.ts`, использует `prompt-service.ts` |
| `packages/course-gen-platform/src/services/career-playbook-pdf.ts` | HTML→PDF через Playwright (stylish layout, Mermaid render) | новый, но Playwright уже в depndencies |
| `packages/course-gen-platform/src/services/course-from-playbook.ts` | Логика создания course с synthetic source corpus из WebSearch | использует существующий `generation.start` flow |

### New frontend files

| Файл | Назначение | Базируется на |
|---|---|---|
| `packages/web/app/[locale]/career-playbook/page.tsx` | Marketing landing (server) | `app/[locale]/about/page.tsx` |
| `packages/web/app/[locale]/career-playbook/page-client.tsx` | Hero + methodology sections + interactive demo (preview sales-manager-b2b sample) | `app/[locale]/create/page-client.tsx` |
| `packages/web/app/[locale]/career-playbook/new/page.tsx` + `page-client.tsx` | Q&A wizard route | новый |
| `packages/web/app/[locale]/career-playbook/[id]/page.tsx` + `page-client.tsx` | Просмотр + edit + actions | `app/[locale]/courses/[courseId]/page.tsx` |
| `packages/web/app/[locale]/career-playbook/library/page.tsx` | Личная библиотека | `app/[locale]/courses/page.tsx` |
| `packages/web/app/[locale]/share/career-playbook/[slug]/page.tsx` | Публичный шеринг (read-only, no-auth) | новый паттерн |
| `packages/web/components/career-playbook/methodology/MethodologySection.tsx` | Объяснение 26 блоков, references (Netflix/Amazon/Toyota/Spotify/Bridgewater) | новый, draws on `docs/research/` |
| `packages/web/components/career-playbook/methodology/InteractiveDemo.tsx` | Live preview sample Role Guide с tooltip-объяснениями | новый |
| `packages/web/components/career-playbook/wizard/Wizard.tsx` | Главный wizard | `components/mocks/clarifying/MockVariant3Wizard.tsx` |
| `packages/web/components/career-playbook/wizard/QuestionRenderer.tsx` | open / single_choice / multi_choice / free_form | паттерн из mock variants |
| `packages/web/components/career-playbook/wizard/FollowupPhase.tsx` | LLM follow-ups + skip + completeness indicator | новый, использует SSE |
| `packages/web/components/career-playbook/wizard/FreeFormInput.tsx` | "Я расскажу свободно" — большая textarea | новый |
| `packages/web/components/career-playbook/wizard/ProgressIndicator.tsx` | Hybrid progress: "Шаг 3 из 5 → анализ → 60% полнота" | новый |
| `packages/web/components/career-playbook/generation/StreamingView.tsx` | Live "thinking" + блоки появляются по мере готовности | паттерн из `MarkdownRendererClient` + Stage 6 progress |
| `packages/web/components/career-playbook/viewer/PlaybookViewer.tsx` | Просмотр со sticky TOC, Mermaid рендер | паттерн из course viewer |
| `packages/web/components/career-playbook/viewer/BlockEditor.tsx` | Inline edit или regenerate-with-instruction | паттерн из Stage 6 regeneration UI |
| `packages/web/components/career-playbook/viewer/ActionsBar.tsx` | PDF / Share / Create Course / Delete | новый |
| `packages/web/stores/use-career-playbook-store.ts` | Zustand store (drafts, wizard state, streaming) | `components/generation-graph/stores/batch-enrichment-store.ts` |
| `packages/web/messages/{ru,en}/career-playbook.json` | i18n namespace | `messages/{ru,en}/generation.json` |
| `packages/web/src/i18n/config.ts` | Добавить namespace `'career-playbook'` | сущ. файл |

### Database (Supabase migration)

```sql
-- packages/course-gen-platform/supabase/migrations/YYYYMMDD_career_playbook.sql
CREATE TABLE career_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL,  -- 'draft' | 'answering' | 'generating' | 'completed' | 'failed'
  language TEXT NOT NULL DEFAULT 'ru',  -- следует за тем же набором, что Stage 6
  slug TEXT,
  share_slug TEXT UNIQUE,  -- nullable, генерируется при включении шеринга
  is_public BOOLEAN NOT NULL DEFAULT false,
  position_title TEXT,
  department TEXT,
  specialization TEXT,
  level TEXT,
  q_a_data JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {fixed: [...], followups: [...], freeform: '...'}
  role_profile_spec JSONB,  -- RoleProfileSpec после spec-builder
  generated_blocks JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {block_1: {content, status, judge_verdict}, ...}
  final_markdown TEXT,  -- собранный финал
  cost_breakdown JSONB,  -- nodeCosts из LangGraph state
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_career_playbooks_user ON career_playbooks(user_id);
CREATE INDEX idx_career_playbooks_org ON career_playbooks(organization_id);
CREATE INDEX idx_career_playbooks_share_slug ON career_playbooks(share_slug) WHERE share_slug IS NOT NULL;

-- RLS
ALTER TABLE career_playbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_or_org_read" ON career_playbooks FOR SELECT
  USING (user_id = auth.uid() OR organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "own_write" ON career_playbooks FOR ALL
  USING (user_id = auth.uid());

-- Публичный доступ только по share_slug (через service-role endpoint, не через RLS)

CREATE TABLE career_playbook_fixed_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language TEXT NOT NULL,
  position INT NOT NULL,
  question_key TEXT NOT NULL,
  question_type TEXT NOT NULL,  -- 'open' | 'single_choice' | 'multi_choice'
  question_text TEXT NOT NULL,
  helper_text TEXT,
  options JSONB,  -- for single/multi choice
  branching_rules JSONB,  -- {if_option_id: 'X', show_question_key: 'Y'}
  is_required BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(language, position, question_key)
);
```

### Reusable existing utilities (no new code needed)

| Утилита | Путь | Назначение |
|---|---|---|
| `PromptService.getPrompt()` | `packages/course-gen-platform/src/shared/prompts/prompt-service.ts` | Загрузка/кеш промптов |
| `ModelConfigService` | `packages/course-gen-platform/src/shared/llm/model-config-service.ts` | Выбор модели по stage |
| `LLM service` | `packages/course-gen-platform/src/shared/llm/` | OpenRouter SDK wrapper |
| BullMQ queue/worker/processor | `packages/course-gen-platform/src/orchestrator/` | Job orchestration |
| `tRPC protectedProcedure` | `packages/course-gen-platform/src/server/trpc.ts` | Auth middleware |
| `MarkdownRendererClient` | `packages/web/components/markdown/MarkdownRendererClient.tsx` | Streaming markdown render |
| `ShaderBackground` | `packages/web/components/layouts/shader-background.tsx` | Hero фон |
| `FormField`, `RadioGroup`, `Checkbox` | `packages/web/components/ui/` | UI building blocks |
| WebSearch tool integration | проверить наличие — либо OpenRouter web tool, либо tavily/serper через axios | Auto-research для course brief |

## Adaptive Q&A Logic

### Phase A — Fixed start questions (5-7)

Жёстко зашиты в БД (`career_playbook_fixed_questions`), показываются wizard-стилем:
1. **Должность** (open text + autocomplete по top-50 распространённым ролям)
2. **Отдел** (single_choice: Sales, IT, Ops, HR, Finance, Marketing, Product, Other)
3. **Уровень** (single_choice: Junior, Middle, Senior, Lead, Director, C-level)
4. **Кому подчиняется + есть ли подчинённые** (open text, short)
5. **Размер команды / компании** (single_choice: 1-10, 11-50, 51-200, 201-1000, 1000+)
6. **Стадия компании** (single_choice: Startup, Scale-up, Established, Enterprise) — conditional на размере
7. **Язык контента** (single_choice: тот же список, что для курсов; default = UI locale)

Branching: например, при отделе "Sales" — доп. вопрос про ACV, при "IT" — про стек.

### Phase B — LLM follow-ups (3-7)

После завершения fixed-фазы — BullMQ job `GENERATE_FOLLOWUPS`:
- LLM получает все fixed answers и системный промпт "ты помогаешь HR-эксперту собрать данные для Role Guide"
- Возвращает JSON: 3-7 вопросов (mix open/single_choice/multi_choice) + completeness_score
- Frontend показывает их по одному, c "Пропустить" кнопкой
- После каждого ответа можно вызвать ещё follow-up (≤2 раза) если LLM считает completeness_score < threshold (0.75)

### Phase C — Free-form (опционально, на любом шаге)

Кнопка "Я расскажу свободно" — большое поле. LLM при следующем шаге парсит и помечает покрытые вопросы как done.

### Stop condition

Phase B завершается когда:
- LLM возвращает `completeness_score >= 0.75` ИЛИ
- Достигнут лимит follow-ups (≤ 7) ИЛИ
- Пользователь нажал "Достаточно, сгенерируй"

## Generation Pipeline (LangGraph)

### State

```typescript
const CareerPlaybookState = Annotation.Root({
  playbookId: Annotation<string>,
  userId: Annotation<string>,
  organizationId: Annotation<string>,
  language: Annotation<string>,  // совпадает с языками Stage 6
  qaData: Annotation<QAData>,
  roleProfileSpec: Annotation<RoleProfileSpec | null>,
  webResearch: Annotation<WebResearchResult | null>,
  generatedGroups: Annotation<Record<GroupKey, GroupResult>>({
    reducer: (acc, update) => ({ ...acc, ...update })
  }),
  judgeVerdicts: Annotation<JudgeVerdict[]>({
    reducer: (acc, v) => [...acc, ...v]
  }),
  finalMarkdown: Annotation<string | null>,
  nodeCosts: Annotation<NodeCost[]>({
    reducer: (acc, c) => [...acc, ...c]
  }),
  errors: Annotation<PlaybookError[]>({
    reducer: (acc, e) => [...acc, ...e]
  })
});
```

### Graph

```
START
  ↓
specBuilder (LLM: Q&A → RoleProfileSpec + parallel WebSearch)
  ↓
group1Generator (Foundation: Header + 1 + 2 + 5)
  ↓
crossBlockJudge (после каждой группы — проверка vs previous)
  ↓ [если revise → group1Regenerator, иначе → next]
group2Generator (Operations: 3 + 4 + 6 + 8)
  ↓
... (groups 3, 4, 5, 6)
  ↓
finalAssembler (склейка финального markdown + 3 Mermaid диаграммы)
  ↓
END
```

### Groups

| Group | Blocks | Цель |
|---|---|---|
| 1: Foundation | Header + 1 Mission/KR + 2 Anti-goals + 5 Decision Matrix | Wow-elements первыми, задают тон |
| 2: Operations | 3 Responsibility zones + 4 Duties + 6 KPI + 8 Tools | Что делается и как измеряется |
| 3: People | 7 Competencies + 9 Human-AI + 12 Candidate profile + 13 Day | Кто и как работает |
| 4: Growth | 11 Career + 14 Onboarding + 15 Motivation + 17 Red flags | Развитие и удержание |
| 5: System | 10 Dependencies + 16 Processes + 19 Industry + 20 Business goals + 21 Failure modes | Контекст |
| 6: Wrap | 18 FAQ + 22 README + 23 Continuity + 24 Canvas + 25 Footer | Итог |

### Consistency mechanism (как в Stage 6)

- **RoleProfileSpec** = аналог `LessonSpec`. Фиксирует key facts + `block_boundaries` (что упоминается в каком блоке) → предотвращает повторы
- **Self-reviewer** (cheap heuristic): таблицы present? Mermaid syntax valid? min items? — перед judge
- **Cross-block judge**: проверяет cross-references (competencies из блока 7 → tools из блока 8 → KPI из блока 6 → responsibilities из блока 3)
- **Block regenerator**: targeted fix без перегенерации всей группы
- **Cost tracking**: nodeCosts массив, отображается админу

## JD → Course Bridge

Кнопка "Создать курс" на странице Role Guide → `careerPlaybook.createCourseFromPlaybook`:

1. Extract from Role Guide: competencies (block 7), tools (block 8), KPIs (block 6), onboarding skills (block 14), failure modes (block 21)
2. Auto WebSearch по этим темам (~5-10 запросов, 30с timeout) → собрать synthetic source corpus
3. Создать course (`generation.start`) с:
   - `title` = "Курс для роли {position_title}"
   - `description` = AI-generated из Role Guide mission
   - `course_brief` = Phase 2.2 структура из skill (см. SKILL.md:728-741)
   - `source_documents` = synthetic web articles, сохранённые как `documents` table records
4. Запускается обычный Stage 2-6 pipeline
5. UI показывает progress через существующий job tracker

**Manual override:** перед запуском modal "Хотите добавить свои материалы?" — опциональный upload. Если ничего не загружено — auto WebSearch.

## Frontend UX

### Landing `/career-playbook`

- Hero: ShaderBackground + headline "Превратите должностную инструкцию в operating manual компании"
- Methodology section: 5 карточек (Netflix/Amazon/Toyota/Spotify/Bridgewater) → expand на 26 блоков
- Interactive demo: показывает `sales-manager-b2b.md` с tooltip-объяснениями на каждый блок
- CTA "Создать свой Career Playbook" → `/career-playbook/new` (требует login)
- SEO: meta tags, structured data

### Wizard `/career-playbook/new`

- Top progress bar: "Шаг 3 из 5 → ИИ-уточнения → 80% полнота"
- Центр: текущий вопрос (large card)
- Auto-save draft каждые 5 сек (localStorage + server fallback)
- "Я расскажу свободно" — sticky кнопка
- Skip кнопка появляется в follow-ups фазе
- После Phase B — экран "Готовы создать?" с summary всех ответов + edit-link

### Generation `/career-playbook/[id]?status=generating`

- Streaming view: блоки появляются по мере готовности (полный SSE + optimistic UI)
- "Thinking" stream опционально показывается (toggle "Показывать мысли модели")
- Progress: "Группа 3 из 6 — Люди и таланты..."
- Cancel/retry buttons

### Viewer `/career-playbook/[id]`

- Sticky TOC слева (26 блоков как chapters)
- Each block — collapse/expand, inline "Edit" / "Regenerate"
- Actions bar: PDF / Share / Create Course / Delete
- Regenerate с инструкцией — modal "Что изменить?"

### Library `/career-playbook/library`

- Grid карточек: position_title, department, level, дата
- Search + filters
- Bulk select для удаления

### Share `/share/career-playbook/[share_slug]`

- Read-only view, no-auth
- "Создано на MC2 — создать свой" CTA внизу
- OG meta tags для шеринга в соцсетях

## Error Handling

| Сценарий | Поведение |
|---|---|
| LLM timeout при followup generation | Fallback на дефолтные follow-ups (по department) + warning toast |
| WebSearch fail в spec-builder | Continue без research, fix into final markdown (note "ограниченный контекст") |
| Judge нашёл проблему в группе | Block-level regeneration, max 2 попытки, потом — оставить с warning |
| Generation полностью провалился | Status `failed`, кнопка "Попробовать снова" с сохранёнными Q&A |
| Course generation из Role Guide fail | Откат: статус "failed" для course, Role Guide intact |
| Draft конфликт (открыт в двух вкладках) | Last-write-wins + warning + show diff |
| User закрыл вкладку во время Q&A | Draft auto-resume при возврате |
| RLS: чужой share_slug | 404 если is_public = false |

## Testing Strategy

### Unit
- Schemas validation (`career-playbook.ts`)
- RoleProfileSpec extraction из mock Q&A
- Prompt rendering для каждой группы
- Cross-block consistency checker logic
- Block regenerator targeting logic

### Integration
- Full Q&A → spec → groups → final markdown с mock LLM (паттерн `stage6-lesson-content/__tests__/`)
- WebSearch fallback (mock timeout)
- Course bridge: создание course с synthetic corpus

### E2E (Playwright)
- Landing → click CTA → login flow → wizard → answer all → see generated playbook
- Edit block → save → re-render
- Share toggle → public link открывается без auth
- Create Course button → course generation starts

### Smoke
- Один реальный прогон через staging (sales-manager-b2b roles) ежедневно через cron
- Сравнение output structure с эталонным `docs/job-descriptions/sales-manager-b2b.md` (block count, mermaid count)

## Verification Steps

После реализации:

1. **Q&A flow:**
   - `pnpm --filter web dev` + `pnpm --filter course-gen-platform dev`
   - Открыть `/ru/career-playbook` — лендинг рендерится, демо работает
   - Залогиниться → `/ru/career-playbook/new` → пройти 5 fixed + 3 follow-ups
   - Проверить draft auto-save: refresh страницу, прогресс сохранился

2. **Generation:**
   - Approve → дождаться завершения (5-15 мин)
   - Проверить: все 26 блоков present, 3 Mermaid diagrams, anti-goals (≥4), decision matrix (≥4), failure modes (≥3)
   - Проверить судя по judge — нет повторов между блоками 7/8 (competencies vs tools)

3. **Post-generation:**
   - Скачать PDF: открыть, проверить styling, Mermaid рендерится
   - Edit blok → save → markdown обновился
   - Regenerate с инструкцией → ровно один блок изменился
   - Share toggle → копировать link → открыть в incognito → виден

4. **Course bridge:**
   - "Создать курс" → modal → confirm → перенаправление на /courses/[id]
   - Проверить, что Stage 2-6 запустился (логи pipeline)
   - WebSearch выполнен (logs показывают N запросов и URLs)

5. **i18n:**
   - Переключить UI на EN → labels переведены
   - Создать Role Guide с `language=es` (если в Stage 6 поддерживается) — контент на испанском

6. **Auth / RLS:**
   - User A создал → User B не видит в библиотеке
   - User A shared → User B видит по share link
   - Unshare → link 404s

7. **Cost tracking:**
   - Открыть admin panel → видны затраты на Role Guide generation (per stage breakdown)

## Phased Delivery (suggested)

| Phase | Deliverable | Estimate |
|---|---|---|
| 1 | DB schema + types + tRPC router skeleton + fixed questions seed | 2-3 дня |
| 2 | Backend: LangGraph stage + spec builder + first 2 groups + handler | 4-5 дней |
| 3 | Backend: остальные 4 groups + judge + regenerator + final assembler | 3-4 дня |
| 4 | Frontend: wizard (Phase A only) + draft persistence | 2-3 дня |
| 5 | Frontend: follow-ups (Phase B) + free-form + completion screen | 2-3 дня |
| 6 | Frontend: viewer + edit + regenerate + actions | 3-4 дня |
| 7 | Frontend: landing + interactive demo + methodology | 2-3 дня |
| 8 | PDF service (HTML→PDF stylish) | 2 дня |
| 9 | Course bridge (WebSearch + synthetic corpus + Stage 2-6 trigger) | 3-4 дня |
| 10 | Share + library + RLS | 1-2 дня |
| 11 | Tests + smoke + verification | 3 дня |
| **Total** | | **~30-37 дней** (~6-7 недель) |

## Out of Scope (для будущих итераций)

- Реальный billing / paid tiers (сейчас безлимит)
- Public catalog отобранных user-generated playbooks (после MVP, на базе share-механики)
- Versioning Role Guide (история изменений по блокам)
- Collaborative editing (несколько user'ов одновременно)
- AI-assisted edit (chat-based refinement как RefinementChat)
- Templates / industry-specific presets
- Export в другие форматы (DOCX, Notion, Confluence)
- Browser-extension для capture should-have-this роли с LinkedIn
- Аналитика "сколько Role Guide создано", "топ-департменты"
