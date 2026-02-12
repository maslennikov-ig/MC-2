# Техническое задание: Админская страница управления пайплайном генерации

## 1. Общее описание

### 1.1 Цель

Создать административную страницу для суперадминов платформы MegaCampus, которая позволяет:

- Просматривать полную структуру пайплайна генерации курсов (все 6 этапов)
- Управлять конфигурацией LLM-моделей для каждой фазы
- Редактировать промпты, используемые на каждом этапе
- Получать актуальный список моделей с OpenRouter API

### 1.2 Целевая аудитория

Только пользователи с ролью `superadmin`. Страница должна быть недоступна для других ролей (admin, instructor, student).

### 1.3 Расположение

- URL: `/admin/pipeline`
- Временно отдельная страница, позже интегрируется в общую админку

---

## 2. Текущее состояние системы

### 2.1 Архитектура пайплайна генерации

Пайплайн состоит из 6 этапов (stages), реализованных через BullMQ:

| Этап    | Название            | Описание                                                    | Файл handler                                   |
| ------- | ------------------- | ----------------------------------------------------------- | ---------------------------------------------- |
| Stage 1 | Document Upload     | Загрузка документов (синхронный tRPC)                       | `stages/stage1-document-upload/handler.ts`     |
| Stage 2 | Document Processing | Конвертация Docling, чанкинг, эмбеддинги, загрузка в Qdrant | `stages/stage2-document-processing/handler.ts` |
| Stage 3 | Classification      | Классификация и категоризация контента                      | `stages/stage3-classification/handler.ts`      |
| Stage 4 | Analysis            | Многофазный LLM-анализ с валидацией качества                | `stages/stage4-analysis/handler.ts`            |
| Stage 5 | Generation          | Генерация структуры курса                                   | `stages/stage5-generation/handler.ts`          |
| Stage 6 | Lesson Content      | Сборка финального контента уроков                           | `stages/stage6-lesson-content/handler.ts`      |

### 2.2 Конфигурация моделей

**Таблица БД**: `llm_model_config`

```sql
-- Текущая структура
id: uuid
config_type: text  -- 'global' | 'course_override'
course_id: uuid (nullable)
phase_name: text   -- 'phase_1_classification', 'phase_2_scope', 'phase_3_expert', 'phase_4_synthesis', 'emergency'
model_id: text     -- OpenRouter model ID (e.g., 'openai/gpt-oss-20b')
fallback_model_id: text (nullable)
temperature: numeric (0-2)
max_tokens: integer (1-200000)
created_at, updated_at: timestamptz
```

**Текущие фазы и дефолтные модели** (из `langchain-models.ts:178-218`):

| Фаза                   | Модель                  | Temperature | Max Tokens | Назначение                                |
| ---------------------- | ----------------------- | ----------- | ---------- | ----------------------------------------- |
| phase_1_classification | openai/gpt-oss-20b      | 0.7         | 4096       | Классификация (простая задача)            |
| phase_2_scope          | openai/gpt-oss-20b      | 0.7         | 4096       | Определение scope                         |
| phase_3_expert         | openai/gpt-oss-120b     | 0.5         | 8000       | Экспертный анализ (критично для качества) |
| phase_4_synthesis      | openai/gpt-oss-20b      | 0.7         | 6000       | Синтез результатов                        |
| phase_6_rag_planning   | openai/gpt-oss-20b      | 0.7         | 4096       | Планирование RAG                          |
| emergency              | x-ai/grok-4-fast        | 0.7         | 30000      | Обработка больших контекстов              |
| quality_fallback       | moonshotai/kimi-k2-0905 | 0.3         | 16000      | Fallback при ошибках валидации            |

### 2.3 Промпты

**Текущее расположение**: Промпты захардкожены в TypeScript файлах.

**ПОЛНЫЙ СПИСОК ПРОМПТОВ В СИСТЕМЕ (~18 штук)**:

| Stage       | Файл                                 | Промпт/Функция                       | Назначение                                                             |
| ----------- | ------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------- |
| **Stage 3** | `phases/phase-classification.ts`     | Classification Prompt                | Классификация документов по приоритетам (CORE/IMPORTANT/SUPPLEMENTARY) |
| **Stage 3** | `utils/tournament-classification.ts` | Tournament Prompt                    | Турнирная классификация для >100K токенов                              |
| **Stage 4** | `phases/phase-1-classifier.ts`       | `buildClassificationPrompt()`        | Классификация курса по 6 категориям, contextual language               |
| **Stage 4** | `phases/phase-2-scope.ts`            | Scope Prompt                         | Определение scope курса                                                |
| **Stage 4** | `phases/phase-3-expert.ts`           | Expert Analysis Prompt               | Экспертный анализ (критичный для качества)                             |
| **Stage 4** | `phases/phase-4-synthesis.ts`        | Synthesis Prompt                     | Синтез результатов всех фаз                                            |
| **Stage 4** | `phases/phase-6-rag-planning.ts`     | RAG Planning Prompt                  | Планирование RAG-контекста для уроков                                  |
| **Stage 5** | `utils/metadata-generator.ts`        | Metadata Prompt                      | Генерация метаданных курса                                             |
| **Stage 5** | `utils/section-batch-generator.ts`   | Section Generation Prompt            | Батчевая генерация секций курса                                        |
| **Stage 5** | `phases/phase3-v2-spec-generator.ts` | V2 Spec Prompt                       | Генерация V2 спецификаций уроков                                       |
| **Stage 6** | `utils/prompt-templates.ts`          | `buildPlannerPrompt()`               | Генерация outline урока                                                |
| **Stage 6** | `utils/prompt-templates.ts`          | `buildExpanderPrompt()`              | Расширение секций в полный контент                                     |
| **Stage 6** | `utils/prompt-templates.ts`          | `buildAssemblerPrompt()`             | Сборка секций в урок                                                   |
| **Stage 6** | `utils/prompt-templates.ts`          | `buildSmootherPrompt()`              | Полировка переходов и стиля                                            |
| **Stage 6** | `judge/prompt-cache.ts`              | JUDGE_STATIC_PROMPTS.rubric          | OSCQR рубрика для оценки (~2000 токенов)                               |
| **Stage 6** | `judge/prompt-cache.ts`              | JUDGE_STATIC_PROMPTS.instructions    | Инструкции для Judge (~500 токенов)                                    |
| **Stage 6** | `judge/prompt-cache.ts`              | JUDGE_STATIC_PROMPTS.fewShotExamples | Few-shot примеры оценки (~1500 токенов)                                |
| **Stage 6** | `judge/fix-templates.ts`             | Fix Templates                        | Шаблоны исправлений контента по feedback                               |
| **Stage 6** | `judge/refinement-loop.ts`           | Refinement Prompt                    | Refinement контента после Judge                                        |

**Структура промптов** (Context-First XML strategy):

```xml
<lesson_context>
  <metadata>...</metadata>
  <learning_objectives>...</learning_objectives>
  ...
</lesson_context>

<task>
  Инструкции для LLM...
</task>
```

**Особенности разных stages**:

- **Stage 3**: Промпты inline в файлах, работают с document metadata
- **Stage 4**: Используют `SystemMessage` + `HumanMessage` из LangChain
- **Stage 5**: Промпты с token budget management
- **Stage 6**: Context-First XML strategy + Judge system с кэшированием

### 2.4 OpenRouter интеграция

- Base URL: `https://openrouter.ai/api/v1`
- API Key: `OPENROUTER_API_KEY` (env variable)
- Текущая реализация: `shared/llm/langchain-models.ts`

### 2.5 Существующие админские страницы

- Layout: `packages/web/app/admin/layout.tsx` (проверка role === 'admin' || 'superadmin')
- Generation History: `/admin/generation/history`
- Generation Details: `/admin/generation/[courseId]`

---

## 3. Функциональные требования

### 3.1 Доступ и авторизация

**FR-1**: Страница доступна ТОЛЬКО для пользователей с ролью `superadmin`
**FR-2**: При попытке доступа без прав - редирект на главную страницу
**FR-3**: Все мутации логируются в `admin_audit_logs`

### 3.2 Вкладка "Обзор пайплайна" (Pipeline Overview)

**FR-4**: Отображать все 6 этапов пайплайна в виде визуальной схемы/таймлайна

**FR-5**: Для каждого этапа показывать:

- Номер и название этапа
- Краткое описание (что делает)
- Статус (активен/неактивен)
- Используемые модели (ссылка на вкладку Models)
- Используемые промпты (ссылка на вкладку Prompts)
- Среднее время выполнения (из `generation_trace`)
- Средняя стоимость (из `generation_trace`)

**FR-6**: Показывать статистику пайплайна:

- Общее количество генераций за период
- Успешных/неудачных
- Общая стоимость
- Среднее время полной генерации

### 3.3 Вкладка "Модели" (Models Configuration)

**FR-7**: Отображать таблицу текущих конфигураций моделей из `llm_model_config`

**FR-8**: Для каждой фазы показывать:

- Название фазы (human-readable)
- Текущая модель (model_id)
- Fallback модель
- Temperature
- Max tokens
- Версия конфигурации
- Дата последнего изменения

**FR-9**: Возможность редактировать конфигурацию модели:

- Выбор модели из списка OpenRouter (FR-13)
- Изменение temperature (slider 0-2)
- Изменение max_tokens (input с валидацией)
- Выбор fallback модели

**FR-10**: Возможность добавлять course-specific override:

- Выбор курса
- Выбор фазы
- Настройка параметров

**FR-11**: Возможность сбросить к дефолтным значениям (hardcoded fallbacks)

**FR-12**: При сохранении - валидация что модель существует в OpenRouter

**FR-12a**: Версионирование конфигураций моделей:

- При каждом изменении создавать новую версию (не перезаписывать)
- История изменений с датами и авторами
- Возможность откатиться к предыдущей версии
- Просмотр diff между версиями

**FR-12b**: Расширенный список фаз для конфигурации:

- Добавить `stage_3_classification` - классификация документов
- Добавить `stage_5_metadata` - генерация метаданных
- Добавить `stage_5_sections` - генерация секций
- Добавить `stage_6_judge` - оценка контента Judge
- Добавить `stage_6_refinement` - refinement контента
- Обновить constraint в таблице `llm_model_config`

### 3.4 Интеграция с OpenRouter API

**FR-13**: Получать список доступных моделей через OpenRouter API:

- Endpoint: `GET https://openrouter.ai/api/v1/models`
- Кэширование на 1 час (модели редко меняются)
- Показывать: название, провайдер, context length, pricing

**FR-14**: Для каждой модели отображать:

- ID модели (для конфига)
- Название (human-readable)
- Провайдер (OpenAI, Anthropic, etc.)
- Context window size
- Цена за 1M input/output tokens
- Поддерживаемые features (vision, function calling, etc.)

**FR-15**: Фильтрация и поиск моделей:

- По провайдеру
- По размеру контекста (min/max)
- По цене
- Текстовый поиск

### 3.5 Вкладка "Промпты" (Prompts Editor)

**FR-16**: Создать новую таблицу `prompt_templates` для хранения промптов в БД

**FR-17**: Структура таблицы `prompt_templates`:

```sql
id: uuid PRIMARY KEY
stage: text NOT NULL  -- 'stage_2', 'stage_3', 'stage_4', 'stage_5', 'stage_6'
prompt_key: text NOT NULL  -- уникальный ключ: 'planner', 'expander', 'assembler', 'smoother'
prompt_name: text NOT NULL  -- человекочитаемое название
prompt_description: text  -- описание назначения промпта
prompt_template: text NOT NULL  -- сам шаблон промпта с плейсхолдерами
variables: jsonb  -- список переменных: [{name: 'lessonTitle', type: 'string', required: true}]
is_active: boolean DEFAULT true
version: integer DEFAULT 1
created_at: timestamptz DEFAULT now()
updated_at: timestamptz DEFAULT now()
created_by: uuid REFERENCES users(id)

UNIQUE(stage, prompt_key, version)
```

**FR-18**: Миграция существующих промптов из кода в БД (seed script)

**FR-19**: Отображать список всех промптов, сгруппированных по этапам

**FR-20**: Для каждого промпта показывать:

- Название и описание
- Этап (stage)
- Версия
- Статус (active/inactive)
- Список переменных с типами
- Дата последнего изменения

**FR-21**: Редактор промптов:

- Textarea с подсветкой синтаксиса (XML)
- Список доступных переменных справа
- Preview с подстановкой тестовых данных
- Валидация XML структуры

**FR-22**: Версионирование промптов:

- При сохранении изменений - создавать новую версию
- Возможность откатиться к предыдущей версии
- История изменений с датами и авторами

**FR-23**: Fallback логика:

- Если промпт не найден в БД - использовать hardcoded из кода
- Флаг "use_database_prompts" в конфиге (для безопасного отката)

### 3.6 Дополнительные настройки

**FR-24**: Секция "Глобальные настройки пайплайна":

- RAG token budget (default: 20000)
- Quality threshold для валидации
- Retry attempts per phase
- Timeout per phase

**FR-25**: Секция "Feature flags":

- use_database_prompts: boolean (fallback to code)
- enable_quality_validation: boolean
- enable_cost_tracking: boolean

### 3.7 Экспорт/Импорт конфигурации

**FR-26**: Экспорт всей конфигурации в JSON:

- Все конфигурации моделей (текущие активные версии)
- Все промпты (текущие активные версии)
- Глобальные настройки и feature flags
- Метаданные экспорта (дата, версия, автор)

**FR-27**: Формат экспорта:

```json
{
  "export_metadata": {
    "version": "1.0",
    "exported_at": "2025-12-03T12:00:00Z",
    "exported_by": "superadmin@example.com",
    "platform_version": "0.22.2"
  },
  "model_configs": [...],
  "prompt_templates": [...],
  "global_settings": {...},
  "feature_flags": {...}
}
```

**FR-28**: Импорт конфигурации из JSON:

- Валидация схемы JSON перед импортом
- Preview изменений перед применением
- Выбор что импортировать (модели/промпты/все)
- Создание backup текущей конфигурации перед импортом
- Возможность отмены импорта (rollback)

**FR-29**: Сценарии использования экспорта/импорта:

- Бэкап перед критическими изменениями
- Перенос конфигурации между окружениями (dev → staging → prod)
- Шаринг конфигурации между командами

---

## 4. Нефункциональные требования

### 4.1 Производительность

**NFR-1**: Страница должна загружаться < 2 секунд
**NFR-2**: Список моделей OpenRouter кэшируется на 1 час
**NFR-3**: Редактор промптов должен работать с текстами до 10000 символов без лагов

### 4.2 Безопасность

**NFR-4**: Все эндпоинты защищены `superadminProcedure`
**NFR-5**: Все изменения логируются в `admin_audit_logs`
**NFR-6**: API ключ OpenRouter не передается на клиент
**NFR-7**: Валидация входных данных на сервере (Zod schemas)

### 4.3 UX/UI

**NFR-8**: Использовать существующие компоненты shadcn/ui
**NFR-9**: Адаптивный дизайн (desktop-first, но работает на планшетах)
**NFR-10**: Toast уведомления при успешных/неудачных операциях
**NFR-11**: Confirmation dialogs для деструктивных действий

### 4.4 Совместимость

**NFR-12**: Обратная совместимость: код должен работать без промптов в БД (fallback)
**NFR-13**: Gradual rollout: возможность включать/выключать DB prompts per stage

---

## 5. Технические детали реализации

### 5.1 Структура файлов

```
packages/web/app/admin/pipeline/
├── page.tsx                    # Главная страница
├── layout.tsx                  # Layout с superadmin guard
├── components/
│   ├── pipeline-overview.tsx   # Вкладка обзора
│   ├── models-config.tsx       # Вкладка моделей
│   ├── prompts-editor.tsx      # Вкладка промптов
│   ├── model-selector.tsx      # Компонент выбора модели
│   ├── prompt-editor.tsx       # Редактор одного промпта
│   └── stats-cards.tsx         # Карточки статистики

packages/course-gen-platform/src/
├── server/routers/
│   └── pipeline-admin.ts       # tRPC роутер для админки пайплайна
├── services/
│   ├── openrouter-models.ts    # Сервис для работы с OpenRouter API
│   └── prompt-service.ts       # Сервис для работы с промптами
└── shared/
    └── prompts/
        └── prompt-loader.ts    # Загрузчик промптов (DB -> fallback to code)

packages/shared-types/src/
├── prompt-template.ts          # Типы для промптов
└── openrouter-models.ts        # Типы для моделей OpenRouter
```

### 5.2 tRPC Endpoints

```typescript
// pipeline-admin.ts
export const pipelineAdminRouter = router({
  // Pipeline Overview
  getStagesInfo: superadminProcedure.query(),
  getPipelineStats: superadminProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(),

  // Models Configuration
  listModelConfigs: superadminProcedure.query(),
  updateModelConfig: superadminProcedure.input(ModelConfigUpdateSchema).mutation(),
  resetModelConfigToDefault: superadminProcedure
    .input(
      z.object({
        phase: PhaseNameSchema,
      })
    )
    .mutation(),
  getModelConfigHistory: superadminProcedure
    .input(
      z.object({
        phase: PhaseNameSchema,
      })
    )
    .query(),
  revertModelConfigToVersion: superadminProcedure
    .input(
      z.object({
        phase: PhaseNameSchema,
        version: z.number(),
      })
    )
    .mutation(),

  // OpenRouter Models
  listOpenRouterModels: superadminProcedure.query(), // cached
  refreshOpenRouterModels: superadminProcedure.mutation(), // force refresh cache

  // Prompts
  listPromptTemplates: superadminProcedure.query(),
  getPromptTemplate: superadminProcedure
    .input(
      z.object({
        stage: StageSchema,
        promptKey: z.string(),
      })
    )
    .query(),
  updatePromptTemplate: superadminProcedure.input(PromptTemplateUpdateSchema).mutation(),
  revertPromptToVersion: superadminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        version: z.number(),
      })
    )
    .mutation(),
  getPromptHistory: superadminProcedure
    .input(
      z.object({
        stage: StageSchema,
        promptKey: z.string(),
      })
    )
    .query(),

  // Global Settings
  getGlobalSettings: superadminProcedure.query(),
  updateGlobalSettings: superadminProcedure.input(GlobalSettingsSchema).mutation(),

  // Export/Import
  exportConfiguration: superadminProcedure.query(), // returns full JSON export
  validateImport: superadminProcedure
    .input(
      z.object({
        configJson: z.string(), // JSON string to validate
      })
    )
    .mutation(), // returns validation result + preview
  importConfiguration: superadminProcedure
    .input(
      z.object({
        configJson: z.string(),
        importModels: z.boolean().default(true),
        importPrompts: z.boolean().default(true),
        importSettings: z.boolean().default(true),
        createBackup: z.boolean().default(true),
      })
    )
    .mutation(),
  listBackups: superadminProcedure.query(),
  restoreFromBackup: superadminProcedure
    .input(
      z.object({
        backupId: z.string().uuid(),
      })
    )
    .mutation(),
});
```

### 5.3 OpenRouter API Integration

```typescript
// openrouter-models.ts
interface OpenRouterModel {
  id: string; // e.g., "openai/gpt-4"
  name: string; // e.g., "GPT-4"
  description: string;
  context_length: number; // e.g., 128000
  pricing: {
    prompt: string; // e.g., "0.00003" per token
    completion: string; // e.g., "0.00006" per token
  };
  top_provider: {
    context_length: number;
    max_completion_tokens: number;
  };
  architecture: {
    modality: string; // "text->text" | "text+image->text"
    tokenizer: string;
    instruct_type: string;
  };
}

// Кэширование через Redis или in-memory с TTL 1 hour
async function fetchOpenRouterModels(): Promise<OpenRouterModel[]>;
```

### 5.4 Database Migration

```sql
-- Migration 1: create_prompt_templates_table

CREATE TABLE prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage text NOT NULL CHECK (stage IN ('stage_2', 'stage_3', 'stage_4', 'stage_5', 'stage_6')),
  prompt_key text NOT NULL,
  prompt_name text NOT NULL,
  prompt_description text,
  prompt_template text NOT NULL,
  variables jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  version integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id),

  UNIQUE(stage, prompt_key, version)
);

-- Index for fast lookups
CREATE INDEX idx_prompt_templates_stage_key ON prompt_templates(stage, prompt_key) WHERE is_active = true;

-- RLS
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

-- Only superadmins can read/write
CREATE POLICY "Superadmins can manage prompt_templates"
  ON prompt_templates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

COMMENT ON TABLE prompt_templates IS 'LLM prompt templates for course generation pipeline. Supports versioning and fallback to hardcoded prompts.';

-- Migration 2: extend_llm_model_config_phases

-- Расширить список допустимых фаз
ALTER TABLE llm_model_config DROP CONSTRAINT IF EXISTS llm_model_config_phase_name_check;
ALTER TABLE llm_model_config ADD CONSTRAINT llm_model_config_phase_name_check
  CHECK (phase_name = ANY (ARRAY[
    'phase_1_classification',
    'phase_2_scope',
    'phase_3_expert',
    'phase_4_synthesis',
    'phase_6_rag_planning',
    'emergency',
    'quality_fallback',
    'stage_3_classification',
    'stage_5_metadata',
    'stage_5_sections',
    'stage_6_judge',
    'stage_6_refinement'
  ]::text[]));

-- Добавить версионирование в llm_model_config
ALTER TABLE llm_model_config ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;
ALTER TABLE llm_model_config ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Обновить уникальный constraint для версионирования
ALTER TABLE llm_model_config DROP CONSTRAINT IF EXISTS llm_model_config_config_type_phase_name_key;
CREATE UNIQUE INDEX idx_llm_model_config_active
  ON llm_model_config(config_type, phase_name, course_id)
  WHERE is_active = true;

COMMENT ON COLUMN llm_model_config.version IS 'Version number for configuration history';
COMMENT ON COLUMN llm_model_config.is_active IS 'Only one version per phase should be active';

-- Migration 3: create_config_backups_table

CREATE TABLE config_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_name text NOT NULL,
  backup_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id),
  description text,
  backup_type text CHECK (backup_type IN ('manual', 'auto_pre_import', 'scheduled'))
);

ALTER TABLE config_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage config_backups"
  ON config_backups
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

COMMENT ON TABLE config_backups IS 'Backups of pipeline configuration for rollback and disaster recovery.';
```

### 5.5 Seed Script

```typescript
// seed-prompts.ts
// Извлекает промпты из TypeScript файлов и создает записи в БД
// Запускается один раз при деплое

const PROMPTS_TO_SEED = [
  // Stage 3 - Document Classification
  {
    stage: 'stage_3',
    prompt_key: 'document_classification',
    prompt_name: 'Document Classification',
    prompt_description: 'Classifies documents by priority (CORE/IMPORTANT/SUPPLEMENTARY)',
    source_file: 'stages/stage3-classification/phases/phase-classification.ts',
  },
  {
    stage: 'stage_3',
    prompt_key: 'tournament_classification',
    prompt_name: 'Tournament Classification',
    prompt_description: 'Two-stage classification for large document sets (>100K tokens)',
    source_file: 'stages/stage3-classification/utils/tournament-classification.ts',
  },

  // Stage 4 - Analysis Phases
  {
    stage: 'stage_4',
    prompt_key: 'phase_1_classifier',
    prompt_name: 'Phase 1: Course Classification',
    prompt_description: 'Classifies course into 6 categories, generates contextual language',
    source_file: 'stages/stage4-analysis/phases/phase-1-classifier.ts',
  },
  {
    stage: 'stage_4',
    prompt_key: 'phase_2_scope',
    prompt_name: 'Phase 2: Scope Definition',
    prompt_description: 'Defines course scope and boundaries',
    source_file: 'stages/stage4-analysis/phases/phase-2-scope.ts',
  },
  {
    stage: 'stage_4',
    prompt_key: 'phase_3_expert',
    prompt_name: 'Phase 3: Expert Analysis',
    prompt_description: 'Deep expert analysis (quality-critical)',
    source_file: 'stages/stage4-analysis/phases/phase-3-expert.ts',
  },
  {
    stage: 'stage_4',
    prompt_key: 'phase_4_synthesis',
    prompt_name: 'Phase 4: Synthesis',
    prompt_description: 'Synthesizes results from all phases',
    source_file: 'stages/stage4-analysis/phases/phase-4-synthesis.ts',
  },
  {
    stage: 'stage_4',
    prompt_key: 'phase_6_rag_planning',
    prompt_name: 'Phase 6: RAG Planning',
    prompt_description: 'Plans RAG context retrieval for lessons',
    source_file: 'stages/stage4-analysis/phases/phase-6-rag-planning.ts',
  },

  // Stage 5 - Generation
  {
    stage: 'stage_5',
    prompt_key: 'metadata_generator',
    prompt_name: 'Course Metadata Generator',
    prompt_description: 'Generates course metadata and descriptions',
    source_file: 'stages/stage5-generation/utils/metadata-generator.ts',
  },
  {
    stage: 'stage_5',
    prompt_key: 'section_batch_generator',
    prompt_name: 'Section Batch Generator',
    prompt_description: 'Generates course sections in batches',
    source_file: 'stages/stage5-generation/utils/section-batch-generator.ts',
  },
  {
    stage: 'stage_5',
    prompt_key: 'v2_spec_generator',
    prompt_name: 'V2 Lesson Specification Generator',
    prompt_description: 'Generates V2 lesson specifications',
    source_file: 'stages/stage5-generation/phases/phase3-v2-spec-generator.ts',
  },

  // Stage 6 - Lesson Content
  {
    stage: 'stage_6',
    prompt_key: 'planner',
    prompt_name: 'Lesson Planner',
    prompt_description: 'Generates lesson outline from specification',
    source_file: 'stages/stage6-lesson-content/utils/prompt-templates.ts',
  },
  {
    stage: 'stage_6',
    prompt_key: 'expander',
    prompt_name: 'Section Expander',
    prompt_description: 'Expands section outline into full content',
    source_file: 'stages/stage6-lesson-content/utils/prompt-templates.ts',
  },
  {
    stage: 'stage_6',
    prompt_key: 'assembler',
    prompt_name: 'Lesson Assembler',
    prompt_description: 'Assembles sections into complete lesson',
    source_file: 'stages/stage6-lesson-content/utils/prompt-templates.ts',
  },
  {
    stage: 'stage_6',
    prompt_key: 'smoother',
    prompt_name: 'Content Smoother',
    prompt_description: 'Polishes transitions and style',
    source_file: 'stages/stage6-lesson-content/utils/prompt-templates.ts',
  },

  // Stage 6 - Judge System
  {
    stage: 'stage_6',
    prompt_key: 'judge_rubric',
    prompt_name: 'OSCQR Rubric',
    prompt_description: 'OSCQR evaluation rubric (~2000 tokens)',
    source_file: 'stages/stage6-lesson-content/judge/prompt-cache.ts',
  },
  {
    stage: 'stage_6',
    prompt_key: 'judge_instructions',
    prompt_name: 'Judge Instructions',
    prompt_description: 'Instructions for content evaluation (~500 tokens)',
    source_file: 'stages/stage6-lesson-content/judge/prompt-cache.ts',
  },
  {
    stage: 'stage_6',
    prompt_key: 'judge_few_shot',
    prompt_name: 'Judge Few-Shot Examples',
    prompt_description: 'Few-shot examples for evaluation (~1500 tokens)',
    source_file: 'stages/stage6-lesson-content/judge/prompt-cache.ts',
  },
  {
    stage: 'stage_6',
    prompt_key: 'fix_templates',
    prompt_name: 'Content Fix Templates',
    prompt_description: 'Templates for fixing content based on judge feedback',
    source_file: 'stages/stage6-lesson-content/judge/fix-templates.ts',
  },
];

// Total: 18 prompts across 4 stages
```

---

## 6. UI Wireframes (текстовое описание)

### 6.1 Главная страница `/admin/pipeline`

```
┌─────────────────────────────────────────────────────────────┐
│  Admin Dashboard > Pipeline Configuration                    │
├─────────────────────────────────────────────────────────────┤
│  [Overview]  [Models]  [Prompts]  [Settings]                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  (Содержимое активной вкладки)                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Вкладка Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Pipeline Statistics (Last 30 days)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ 1,234    │ │ 95.2%    │ │ $45.67   │ │ 12m 34s  │       │
│  │ Total    │ │ Success  │ │ Cost     │ │ Avg Time │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
├─────────────────────────────────────────────────────────────┤
│  Pipeline Stages                                            │
│                                                             │
│  [1]──>[2]──>[3]──>[4]──>[5]──>[6]                         │
│  Upload Process Class  Analyze Generate Content             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Stage 4: Analysis                                    │   │
│  │ Multi-phase LLM analysis with quality validation     │   │
│  │                                                      │   │
│  │ Models: phase_1 → gpt-oss-20b                       │   │
│  │         phase_2 → gpt-oss-20b                       │   │
│  │         phase_3 → gpt-oss-120b (critical)           │   │
│  │         phase_4 → gpt-oss-20b                       │   │
│  │                                                      │   │
│  │ Prompts: 4 active templates                          │   │
│  │ Avg time: 3m 45s | Avg cost: $0.12                  │   │
│  │                                                      │   │
│  │ [Configure Models] [Edit Prompts]                    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 Вкладка Models

```
┌─────────────────────────────────────────────────────────────┐
│  Model Configuration                        [Refresh Models]│
├─────────────────────────────────────────────────────────────┤
│  Phase               │ Model          │ Temp │ Tokens │ Act │
│  ────────────────────┼────────────────┼──────┼────────┼─────│
│  Phase 1 Classif.    │ gpt-oss-20b    │ 0.7  │ 4096   │ [✎] │
│  Phase 2 Scope       │ gpt-oss-20b    │ 0.7  │ 4096   │ [✎] │
│  Phase 3 Expert      │ gpt-oss-120b   │ 0.5  │ 8000   │ [✎] │
│  Phase 4 Synthesis   │ gpt-oss-20b    │ 0.7  │ 6000   │ [✎] │
│  Emergency           │ grok-4-fast    │ 0.7  │ 30000  │ [✎] │
│  Quality Fallback    │ kimi-k2-0905   │ 0.3  │ 16000  │ [✎] │
├─────────────────────────────────────────────────────────────┤
│  Available OpenRouter Models              [Filter ▼] [🔍]   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ openai/gpt-4o          │ 128K ctx │ $5/$15 per 1M  │   │
│  │ anthropic/claude-3.5   │ 200K ctx │ $3/$15 per 1M  │   │
│  │ openai/gpt-oss-120b    │ 128K ctx │ $0.5/$1 per 1M │   │
│  │ ...                                                  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 6.4 Вкладка Prompts

```
┌─────────────────────────────────────────────────────────────┐
│  Prompt Templates                                           │
├─────────────────────────────────────────────────────────────┤
│  Stage: [All ▼]  Status: [Active ▼]              [+ New]   │
├───────────────┬─────────────────────────────────────────────┤
│ Stages        │ Prompt Editor                               │
│               │                                             │
│ ▼ Stage 4     │ ┌─────────────────────────────────────────┐│
│   ○ Phase 1   │ │ Lesson Planner (stage_6/planner)       ││
│   ○ Phase 2   │ │ Version: 3 | Active | Last: 2025-12-01 ││
│   ○ Phase 3   │ ├─────────────────────────────────────────┤│
│   ○ Phase 4   │ │ <lesson_context>                       ││
│               │ │   <metadata>                           ││
│ ▼ Stage 6     │ │     <lesson_id>{{lessonId}}</lesson_id>││
│   ● Planner   │ │     <title>{{title}}</title>           ││
│   ○ Expander  │ │     ...                                ││
│   ○ Assembler │ │   </metadata>                          ││
│   ○ Smoother  │ │   ...                                  ││
│               │ │ </lesson_context>                      ││
│               │ │                                        ││
│               │ │ <task>                                 ││
│               │ │   Create a detailed lesson outline...  ││
│               │ │ </task>                                ││
│               │ └─────────────────────────────────────────┤│
│               │ Variables:                                │
│               │ ┌─────────────────────────────────────────┐│
│               │ │ lessonSpec: LessonSpecificationV2 [req]││
│               │ │ ragChunks: RAGChunk[] [req]            ││
│               │ └─────────────────────────────────────────┘│
│               │                                             │
│               │ [Preview] [History] [Save] [Revert]        │
└───────────────┴─────────────────────────────────────────────┘
```

---

## 7. Критерии приемки

### 7.1 Обязательные (MVP)

- [ ] Страница доступна только для superadmin
- [ ] Отображается обзор всех 6 этапов пайплайна с описаниями
- [ ] Можно просматривать и редактировать конфигурации моделей (все ~12 фаз)
- [ ] Версионирование конфигураций моделей с историей изменений
- [ ] Список моделей загружается с OpenRouter API и кэшируется
- [ ] Все ~18 промптов мигрированы в БД и редактируются через UI
- [ ] Версионирование промптов с историей и возможностью отката
- [ ] Работает fallback на hardcoded промпты/модели при ошибках
- [ ] Все изменения логируются в audit log
- [ ] JSON экспорт конфигурации (модели + промпты + настройки)
- [ ] JSON импорт с валидацией и preview изменений

### 7.2 Желательные (Nice-to-have)

- [ ] Preview промпта с подстановкой тестовых данных
- [ ] Статистика использования по этапам (из generation_trace)
- [ ] Diff между версиями конфигураций
- [ ] A/B тестирование промптов
- [ ] Bulk operations (массовое обновление моделей/промптов)

---

## 8. Риски и ограничения

### 8.1 Риски

| Риск                                      | Вероятность | Влияние | Митигация                                       |
| ----------------------------------------- | ----------- | ------- | ----------------------------------------------- |
| OpenRouter API недоступен                 | Средняя     | Низкое  | Кэширование + показ последних известных моделей |
| Некорректный промпт ломает генерацию      | Высокая     | Высокое | Fallback на код + валидация + preview           |
| Миграция промптов потеряет форматирование | Средняя     | Среднее | Тщательное тестирование seed script             |

### 8.2 Ограничения

- Промпты Stage 1 не включены (там нет LLM вызовов)
- Первая версия без A/B тестирования
- Нет real-time collaboration (один редактор одновременно)

---

## 9. Зависимости

### 9.1 Внешние

- OpenRouter API (`https://openrouter.ai/api/v1/models`)
- Supabase (БД + Auth)

### 9.2 Внутренние

- `packages/web` - Next.js фронтенд
- `packages/course-gen-platform` - tRPC backend
- `packages/shared-types` - общие типы
- Существующие компоненты shadcn/ui

---

## 10. Глоссарий

| Термин          | Определение                                                |
| --------------- | ---------------------------------------------------------- |
| Stage           | Этап пайплайна генерации (1-6)                             |
| Phase           | Фаза внутри этапа (напр. phase_1_classification в Stage 4) |
| Prompt Template | Шаблон промпта с плейсхолдерами для переменных             |
| Fallback        | Запасной вариант при ошибке основного                      |
| OpenRouter      | Агрегатор API различных LLM провайдеров                    |

---

## 11. Ссылки

### Административная инфраструктура

- Admin layout: `packages/web/app/admin/layout.tsx`
- Admin router: `packages/course-gen-platform/src/server/routers/admin.ts`
- Authorization middleware: `packages/course-gen-platform/src/server/middleware/authorize.ts`

### Конфигурация моделей

- Model selector service: `packages/course-gen-platform/src/shared/llm/langchain-models.ts`
- DB table: `llm_model_config`

### Stage 3 - Classification

- Phase classification: `packages/course-gen-platform/src/stages/stage3-classification/phases/phase-classification.ts`
- Tournament classification: `packages/course-gen-platform/src/stages/stage3-classification/utils/tournament-classification.ts`

### Stage 4 - Analysis

- Phase 1 classifier: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-1-classifier.ts`
- Phase 2 scope: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-2-scope.ts`
- Phase 3 expert: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-3-expert.ts`
- Phase 4 synthesis: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-4-synthesis.ts`
- Phase 6 RAG planning: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-6-rag-planning.ts`

### Stage 5 - Generation

- Metadata generator: `packages/course-gen-platform/src/stages/stage5-generation/utils/metadata-generator.ts`
- Section batch generator: `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch-generator.ts`
- V2 spec generator: `packages/course-gen-platform/src/stages/stage5-generation/phases/phase3-v2-spec-generator.ts`

### Stage 6 - Lesson Content

- Prompt templates: `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/prompt-templates.ts`
- Judge prompt cache: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/prompt-cache.ts`
- Fix templates: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/fix-templates.ts`
- Refinement loop: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/refinement-loop.ts`

### Общие типы

- Model config types: `packages/shared-types/src/model-config.ts`
- Analysis schemas: `packages/shared-types/src/analysis-schemas.ts`
