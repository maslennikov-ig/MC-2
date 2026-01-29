# LLM Benchmarks Page

Public page displaying LLM model quality rankings based on benchmark results.

**URLs**: `/ru/benchmarks`, `/en/benchmarks`

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         page.tsx (Server)                        │
│  - SEO metadata (generateMetadata)                               │
│  - Initial data fetch (getTopModelsAction, getLatestTestDate)   │
│  - Renders BenchmarksClient                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BenchmarksClient (Client)                     │
│  - Layout container                                              │
│  - Renders TopModelsCards + ModelsRankingTable                  │
└─────────────────────────────────────────────────────────────────┘
                    │                       │
                    ▼                       ▼
┌──────────────────────────┐  ┌──────────────────────────────────┐
│   TopModelsCards         │  │      ModelsRankingTable          │
│   - Top 3 models         │  │   - TanStack Table               │
│   - Gold/Silver/Bronze   │  │   - Sorting, filtering           │
│   - Hover animations     │  │   - Pagination                   │
└──────────────────────────┘  └──────────────────────────────────┘
```

## File Structure

```
packages/web/
├── app/
│   ├── [locale]/benchmarks/
│   │   ├── page.tsx                    # Server component + metadata
│   │   ├── README.md                   # This file
│   │   └── components/
│   │       ├── benchmarks-client.tsx   # Main client container
│   │       ├── top-models-cards.tsx    # Top 3 podium cards
│   │       └── models-ranking-table.tsx # Full ranking table
│   └── actions/
│       └── benchmarks.ts               # Server actions
├── messages/
│   ├── en/benchmarks.json              # English translations
│   └── ru/benchmarks.json              # Russian translations
└── types/
    └── i18n.d.ts                       # Type declaration (includes BenchmarksMessages)

packages/course-gen-platform/
└── supabase/migrations/
    └── 20260128201300_create_benchmark_tables.sql  # DB schema

packages/shared-types/
└── src/database.types.ts               # Includes llm_model_leaderboard view type
```

## Database Schema

### Tables

#### `llm_model_benchmarks`

Aggregated benchmark results per model/date.

| Column                    | Type         | Description                                |
| ------------------------- | ------------ | ------------------------------------------ |
| `id`                      | UUID         | Primary key                                |
| `model_slug`              | TEXT         | URL-friendly ID (e.g., `deepseek-v3`)      |
| `model_name`              | TEXT         | Display name (e.g., `DeepSeek V3`)         |
| `provider`                | TEXT         | Provider name (e.g., `DeepSeek`, `OpenAI`) |
| `test_date`               | DATE         | Benchmark date                             |
| `test_version`            | TEXT         | Test suite version                         |
| `overall_quality_score`   | NUMERIC(4,3) | 0-1 scale                                  |
| `content_quality_score`   | NUMERIC(4,3) | 0-1 scale                                  |
| `schema_compliance_score` | NUMERIC(4,3) | 0-1 scale                                  |
| `language_quality_score`  | NUMERIC(4,3) | 0-1 scale                                  |
| `heuristic_scores`        | JSONB        | Per-filter breakdown                       |
| `total_issues`            | INTEGER      | Count of all issues                        |
| `critical_issues`         | INTEGER      | Count of critical issues                   |
| `error_rate`              | NUMERIC(4,3) | 0-1 scale                                  |
| `quality_tier`            | TEXT         | S/A/B/C/D                                  |

**Unique constraint**: `(model_slug, test_date)`

#### `llm_benchmark_runs`

Individual test run results (linked to benchmarks).

| Column             | Type         | Description                |
| ------------------ | ------------ | -------------------------- |
| `id`               | UUID         | Primary key                |
| `benchmark_id`     | UUID         | FK to llm_model_benchmarks |
| `scenario`         | TEXT         | Test scenario name         |
| `run_number`       | INTEGER      | Run sequence               |
| `language`         | TEXT         | en/ru/zh                   |
| `schema_score`     | NUMERIC(4,3) | 0-1                        |
| `content_score`    | NUMERIC(4,3) | 0-1                        |
| `language_score`   | NUMERIC(4,3) | 0-1                        |
| `overall_score`    | NUMERIC(4,3) | 0-1                        |
| `heuristic_result` | JSONB        | Full filter output         |
| `issues`           | JSONB        | Array of issues            |
| `is_error`         | BOOLEAN      | Error flag                 |
| `error_message`    | TEXT         | Error details              |

### View: `llm_model_leaderboard`

Convenience view showing latest benchmark for each model, ordered by tier and score.

```sql
SELECT * FROM llm_model_leaderboard;
```

### Quality Tier System

| Tier | Score Range | Usage         |
| ---- | ----------- | ------------- |
| S    | 0.95+       | Primary model |
| A    | 0.85-0.94   | Production    |
| B    | 0.75-0.84   | With review   |
| C    | 0.60-0.74   | Fallback only |
| D    | <0.60       | Do not use    |

### RLS Policies

- **Read**: Public (anyone can view)
- **Write**: SuperAdmin only

## Server Actions

Location: `packages/web/app/actions/benchmarks.ts`

### `getBenchmarksAction(params)`

Fetch paginated benchmark data with filtering and sorting.

```typescript
interface Params {
  sortBy?: 'overall_quality_score' | 'content_quality_score' | ...
  sortOrder?: 'asc' | 'desc'
  provider?: string
  tier?: 'S' | 'A' | 'B' | 'C' | 'D'
  scenario?: string    // 'lesson-en', 'lesson-ru', 'metadata-en', 'metadata-ru'
  testDate?: string    // '2026-01-28'
  limit?: number
  offset?: number
}

const { data, total } = await getBenchmarksAction({
  sortBy: 'overall_quality_score',
  sortOrder: 'desc',
  provider: 'OpenAI',
  limit: 20,
  offset: 0
});
```

### `getTopModelsAction(limit)`

Get top N models by overall score.

```typescript
const topModels = await getTopModelsAction(3)
```

### `getProvidersAction()`

Get list of unique providers for filter dropdown.

```typescript
const providers = await getProvidersAction()
// ['Anthropic', 'DeepSeek', 'Google', 'Meta', 'Mistral', 'OpenAI', 'xAI']
```

### `getScenariosAction()`

Get list of unique test scenarios.

```typescript
const scenarios = await getScenariosAction()
// ['lesson-en', 'lesson-ru', 'metadata-en', 'metadata-ru']
```

### `getTestDatesAction()`

Get list of unique test dates.

```typescript
const dates = await getTestDatesAction()
// ['2026-01-28', '2025-11-13']
```

### `getModelScenarioResultsAction(modelSlug)`

Get detailed scenario results for expandable rows.

```typescript
const results = await getModelScenarioResultsAction('deepseek-v32-exp')
// [{ scenario: 'lesson-en', runNumber: 1, schemaScore: 1.0, ... }, ...]
```

### `getLatestTestDateAction()`

Get most recent benchmark test date.

```typescript
const date = await getLatestTestDateAction()
// '2026-01-28'
```

## Components

### TopModelsCards

Displays top 3 models as podium cards with trophy/medal/award icons.

**Props:**

```typescript
interface TopModelsCardsProps {
  models: BenchmarkData[]
}
```

**Styling:**

- Gold gradient for #1 (Trophy icon)
- Silver gradient for #2 (Medal icon)
- Bronze gradient for #3 (Award icon)
- Tier badge with color coding
- Hover scale animation

### ModelsRankingTable

Full ranking table with TanStack Table.

**Props:**

```typescript
interface ModelsRankingTableProps {
  locale: string
}
```

**Features:**

- Sortable columns (click header)
- Filter by provider (dropdown)
- Filter by tier (dropdown)
- Filter by scenario (lesson-en/ru, metadata-en/ru)
- Filter by test date
- Expandable rows with detailed scenario results
- Pagination (10/20/50/100 per page)
- Responsive design

**State management:**

- Uses React useState for filters/sorting
- Fetches data via server actions
- Loading states with skeleton

## Localization

Namespace: `benchmarks`

### Adding new translations

1. Add key to `messages/en/benchmarks.json`
2. Add key to `messages/ru/benchmarks.json`
3. Use in component: `const t = useTranslations('benchmarks'); t('key')`

### Key structure

```json
{
  "metadata": { "title", "description", ... },
  "hero": { "title", "subtitle", "lastUpdated" },
  "topModels": { "title" },
  "ranking": { "title" },
  "tiers": { "S", "A", "B", "C", "D" },
  "metrics": { "quality", "content", "schema", "language", "errorRate", "criticalIssues" },
  "table": { "rank", "model", "provider", "tier", ... },
  "filters": { "title", "provider", "tier", ... },
  "pagination": { "showing", "previous", "next" }
}
```

## Adding Benchmark Data

### Via SQL (manual)

```sql
INSERT INTO llm_model_benchmarks (
  model_slug, model_name, provider, test_date, test_version,
  overall_quality_score, content_quality_score, schema_compliance_score,
  language_quality_score, heuristic_scores, total_issues, critical_issues,
  error_rate, quality_tier
) VALUES (
  'new-model-v1',
  'New Model V1',
  'NewProvider',
  '2026-01-29',
  '1.0.0',
  0.875,  -- overall
  0.860,  -- content
  0.910,  -- schema
  0.855,  -- language
  '{"wordCount": 0.85, "fleschKincaid": 0.82}',
  15,     -- total issues
  2,      -- critical issues
  0.05,   -- error rate
  'A'     -- tier (must match score!)
);
```

### Via Benchmark Script

Location: `packages/course-gen-platform/scripts/benchmark-llm/`

```bash
pnpm benchmark:run --model deepseek-v3
```

## Modifying the Page

### Adding a new metric column

1. **Database**: Add column to `llm_model_benchmarks` table via migration
2. **View**: Update `llm_model_leaderboard` view to include new column
3. **Types**: Regenerate types or add to `BenchmarkData` interface
4. **Server Action**: Include in `getBenchmarksAction` select
5. **Table**: Add column definition in `ModelsRankingTable`
6. **i18n**: Add translation keys

### Changing tier thresholds

1. Update `calculate_quality_tier()` function in database
2. Update tier display logic in `TopModelsCards` and `ModelsRankingTable`
3. Update tier descriptions in translation files

### Adding comparison feature

Potential locations:

- New component: `components/model-comparison-modal.tsx`
- Add selection state to `ModelsRankingTable`
- Use radar chart (recharts) for visual comparison

## Testing

### Manual testing

1. Navigate to `/ru/benchmarks` or `/en/benchmarks`
2. Verify top 3 cards display correctly
3. Test table sorting (click each header)
4. Test provider filter
5. Test tier filter
6. Test pagination
7. Test responsive design (mobile view)

### Database verification

```sql
-- Check data exists
SELECT COUNT(*) FROM llm_model_benchmarks;

-- Check view works
SELECT * FROM llm_model_leaderboard LIMIT 5;

-- Check RLS (should work for anon)
SET ROLE anon;
SELECT * FROM llm_model_leaderboard;
```

## Related Files

- **Heuristic filters**: `packages/course-gen-platform/src/stages/.../heuristic-filter.ts`
- **Model configs**: `llm_model_configs` table
- **Plan document**: `docs/plans/refactored-hugging-dewdrop.md`
