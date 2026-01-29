# План: Публичная страница бенчмарков LLM моделей

## Цель

Создать публичную страницу `/benchmarks` с рейтингом LLM моделей, доступную по прямой ссылке (без навигации). Страница позволит делиться результатами тестирования и сравнивать качество генерации.

## Текущее состояние

**Уже реализовано:**

- Таблицы `llm_model_benchmarks` и `llm_benchmark_runs` в Supabase
- tRPC router `admin.benchmarks` с endpoints: listBenchmarks, getBenchmark, getBenchmarkRuns, compareBenchmarks
- CLI `pnpm benchmark-llm` для управления данными
- LEADERBOARD.md автогенерация
- RLS policy `benchmarks_read_all` для публичного чтения

**Нужно создать:**

- Публичные страницы на фронтенде
- Server Actions для получения данных
- UI компоненты для отображения

---

## Архитектура страниц

```
/[locale]/benchmarks/              # Главная таблица рейтинга
/[locale]/benchmarks/[slug]/       # Детальная страница модели
/[locale]/benchmarks/compare       # Сравнение двух моделей (?m1=...&m2=...)
```

**Особенности:**

- Публичные страницы БЕЗ авторизации (как /about)
- Скрытые от навигации (доступ только по прямой ссылке)
- **Скрытые от индексации** (noindex, nofollow в robots)
- Поддержка i18n (ru/en)

---

## Фаза 1: Database — таблица примеров

**Файл:** `supabase/migrations/20260129_add_benchmark_samples.sql`

```sql
-- Хранение примеров сгенерированного контента для демонстрации
CREATE TABLE llm_benchmark_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_id UUID NOT NULL REFERENCES llm_model_benchmarks(id) ON DELETE CASCADE,

  sample_type TEXT NOT NULL CHECK (sample_type IN ('lesson', 'metadata')),
  language TEXT NOT NULL CHECK (language IN ('en', 'ru')),

  -- Контент
  input_prompt TEXT,           -- Промпт (опционально)
  output_content TEXT NOT NULL, -- Сгенерированный контент (JSON или markdown)
  output_preview TEXT,          -- Краткий preview (первые 500 символов)

  -- Метрики этого примера
  quality_score NUMERIC(4,3),
  issues JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_sample UNIQUE (benchmark_id, sample_type, language)
);

-- Публичный доступ на чтение
CREATE POLICY samples_read_all ON llm_benchmark_samples FOR SELECT USING (true);
```

---

## Фаза 2: Server Actions

**Файл:** `packages/web/app/actions/benchmarks.ts`

```typescript
'use server';

// Публичные actions (без авторизации)
export async function getBenchmarkLeaderboard(params?: { minTier?: string; provider?: string });
export async function getBenchmarkBySlug(slug: string);
export async function getBenchmarkSamples(benchmarkId: string);
export async function compareBenchmarks(slug1: string, slug2: string);
```

**Особенность:** Используем Supabase Client напрямую (без tRPC), так как данные публичные.

---

## Фаза 3: UI Компоненты

**Директория:** `packages/web/components/benchmarks/`

| Компонент              | Описание                               |
| ---------------------- | -------------------------------------- |
| `TierBadge.tsx`        | Цветной badge (S/A/B/C/D)              |
| `LeaderboardTable.tsx` | Интерактивная таблица рейтинга         |
| `ModelCard.tsx`        | Карточка модели с ключевыми метриками  |
| `ScoreChart.tsx`       | Radar chart с breakdown по фильтрам    |
| `SampleViewer.tsx`     | Просмотр примера с syntax highlighting |
| `CompareView.tsx`      | Side-by-side сравнение двух моделей    |

**Используемые библиотеки:**

- shadcn: Badge, Card, Table, Tabs
- recharts: RadarChart для визуализации scores
- react-syntax-highlighter или встроенный для JSON/markdown

---

## Фаза 4: Страницы

### 4.1 Главная страница рейтинга

**Файл:** `packages/web/app/[locale]/benchmarks/page.tsx`

```tsx
import { Metadata } from 'next';

// Скрыть от поисковых систем
export const metadata: Metadata = {
  title: 'LLM Model Benchmarks',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

// Server Component - публичная страница
export default async function BenchmarksPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const benchmarks = await getBenchmarkLeaderboard();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <BenchmarksHeader />
      <LeaderboardTable data={benchmarks} />
      <MethodologySection />
    </div>
  );
}
```

**Функции:**

- Таблица с сортировкой по tier/score
- Фильтры: provider, tier
- Клик по модели → страница деталей
- Кнопка "Сравнить" для выбора двух моделей

### 4.2 Детальная страница модели

**Файл:** `packages/web/app/[locale]/benchmarks/[slug]/page.tsx`

**Содержимое:**

- Заголовок с названием и tier badge
- Карточки с ключевыми метриками
- Radar chart с breakdown по 12 фильтрам
- Таблица отдельных runs
- Секция "Примеры генерации" с табами (EN/RU, Lesson/Metadata)
- Кнопка "Сравнить с другой моделью"

### 4.3 Страница сравнения

**Файл:** `packages/web/app/[locale]/benchmarks/compare/page.tsx`

**Query params:** `?m1=deepseek-v32-exp&m2=kimi-k2-0905`

**Содержимое:**

- Side-by-side карточки двух моделей
- Разница в процентах по каждой метрике
- Наложенные radar charts
- Параллельное сравнение примеров генерации
- Winner badge

---

## Фаза 5: Миграция примеров

**Файл:** `scripts/benchmark-llm/migrate-samples.ts`

Парсит JSON файлы из `specs/008-*/quality-tests/` и сохраняет примеры в `llm_benchmark_samples`:

- Выбирает лучший run по score для каждой модели/языка
- Сохраняет output_content (JSON) и preview

---

## Критичные файлы

| Файл                                                    | Действие                           |
| ------------------------------------------------------- | ---------------------------------- |
| `supabase/migrations/20260129_*.sql`                    | CREATE TABLE llm_benchmark_samples |
| `packages/web/app/actions/benchmarks.ts`                | Server Actions                     |
| `packages/web/app/[locale]/benchmarks/page.tsx`         | Главная страница                   |
| `packages/web/app/[locale]/benchmarks/[slug]/page.tsx`  | Детали модели                      |
| `packages/web/app/[locale]/benchmarks/compare/page.tsx` | Сравнение                          |
| `packages/web/components/benchmarks/*.tsx`              | UI компоненты                      |
| `scripts/benchmark-llm/migrate-samples.ts`              | Миграция примеров                  |

---

## Верификация

1. **После миграции:**

   ```bash
   # Проверить данные в Supabase
   SELECT COUNT(*) FROM llm_benchmark_samples;
   ```

2. **Страница рейтинга:**

   ```
   http://localhost:3000/ru/benchmarks
   - Должна показать 11 моделей
   - Фильтры работают
   - Клик по модели ведёт на детали
   ```

3. **Детали модели:**

   ```
   http://localhost:3000/ru/benchmarks/deepseek-v32-exp
   - Показывает все метрики
   - Radar chart отображается
   - Примеры генерации видны
   ```

4. **Сравнение:**
   ```
   http://localhost:3000/ru/benchmarks/compare?m1=deepseek-v32-exp&m2=kimi-k2-0905
   - Side-by-side сравнение работает
   - Winner определяется корректно
   ```

---

## Фаза 6: Доработка скилла тестирования моделей

**Цель:** Создать/доработать скилл `llm-quality-tester` для автоматического тестирования новых моделей и добавления результатов в систему бенчмарков.

### Текущее состояние

- Тесты проводились вручную через скрипты в `docs/llm-testing/`
- В документации упоминается `@llm-quality-tester`, но агент не создан
- Методология описана в `docs/llm-testing/MODEL-QUALITY-TESTING-METHODOLOGY-V2.md`
- Результаты хранятся в `specs/008-*/quality-tests/` (JSON файлы)

### Что нужно создать

**Файл:** `.claude/skills/llm-quality-tester/SKILL.md`

**Функциональность:**

1. **Тестирование новой модели:**

   ```
   /test-model <model-slug> [--provider <provider>]
   ```

   - Запускает 12 API вызовов (4 сценария × 3 прогона)
   - Использует методологию V2 (quality-focused)
   - Сохраняет JSON outputs в `specs/008-*/quality-tests/<model-slug>/`

2. **Анализ качества:**
   - Применяет `heuristic-filter.ts` для расчёта CQS
   - Определяет Quality Tier (S/A/B/C/D)
   - Генерирует отчёт `QUALITY-TEST-REPORT.md`

3. **Добавление в benchmarks:**
   - Вставляет запись в `llm_model_benchmarks` таблицу
   - Вставляет runs в `llm_benchmark_runs`
   - Сохраняет лучшие примеры в `llm_benchmark_samples`
   - Обновляет `docs/reports/model-benchmarks/LEADERBOARD.md`

4. **Интеграция с CLI:**
   - Добавить команду в `pnpm benchmark-llm`:
     ```bash
     pnpm benchmark-llm test <model-slug> --provider <provider>
     pnpm benchmark-llm test deepseek/deepseek-r1 --provider deepseek
     ```

### Файлы для создания/изменения

| Файл                                                               | Действие                                 |
| ------------------------------------------------------------------ | ---------------------------------------- |
| `.claude/skills/llm-quality-tester/SKILL.md`                       | CREATE: Скилл для Claude Code            |
| `packages/course-gen-platform/scripts/benchmark-llm/test-model.ts` | CREATE: Скрипт тестирования              |
| `packages/course-gen-platform/scripts/benchmark-llm/index.ts`      | UPDATE: Добавить команду `test`          |
| `docs/llm-testing/test-config-template.json`                       | CREATE: Шаблон конфига для новых моделей |

### Workflow для тестирования новой модели

```
1. /test-model deepseek/deepseek-r1 --provider deepseek
2. Скилл запускает 12 API вызовов через OpenRouter
3. Результаты сохраняются в specs/008-*/quality-tests/deepseek-r1/
4. Запускается heuristic-filter анализ
5. Рассчитывается качество и tier
6. Данные добавляются в Supabase:
   - llm_model_benchmarks (агрегированные scores)
   - llm_benchmark_runs (12 индивидуальных runs)
   - llm_benchmark_samples (лучшие примеры)
7. Обновляется LEADERBOARD.md
8. Модель появляется на публичной странице /benchmarks
```

### Критерии качества (из методологии V2)

- **Schema Score (40%)**: Valid JSON, snake_case, required fields
- **Content Score (40%)**: Action verbs, Bloom's taxonomy, specificity
- **Language Score (20%)**: Grammar, terminology, native phrasing

### Tier определение

| Tier | Score  | Recommendation |
| ---- | ------ | -------------- |
| S    | ≥95%   | Primary model  |
| A    | 85-94% | Production     |
| B    | 75-84% | With review    |
| C    | 60-74% | Fallback only  |
| D    | <60%   | Do not use     |

---

## Критичные файлы (обновлённый список)

| Файл                                                    | Действие                           |
| ------------------------------------------------------- | ---------------------------------- |
| `supabase/migrations/20260129_*.sql`                    | CREATE TABLE llm_benchmark_samples |
| `packages/web/app/actions/benchmarks.ts`                | Server Actions                     |
| `packages/web/app/[locale]/benchmarks/page.tsx`         | Главная страница                   |
| `packages/web/app/[locale]/benchmarks/[slug]/page.tsx`  | Детали модели                      |
| `packages/web/app/[locale]/benchmarks/compare/page.tsx` | Сравнение                          |
| `packages/web/components/benchmarks/*.tsx`              | UI компоненты                      |
| `scripts/benchmark-llm/migrate-samples.ts`              | Миграция примеров                  |
| `.claude/skills/llm-quality-tester/SKILL.md`            | Скилл тестирования                 |
| `scripts/benchmark-llm/test-model.ts`                   | CLI для тестирования               |

---

## Ожидаемый результат

- Публичная страница для sharing: `https://ai.megacampus.ru/ru/benchmarks`
- Детальное сравнение моделей с примерами output
- **Скрыта от поисковых систем** (noindex, nofollow)
- Не требует авторизации
- Скрыта от основной навигации (только прямой доступ)
- **Скилл для тестирования новых моделей**: `/test-model <slug>`
- **CLI команда**: `pnpm benchmark-llm test <model-slug>`
- Автоматическое обновление leaderboard при добавлении модели
