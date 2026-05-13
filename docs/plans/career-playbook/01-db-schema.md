# Career Playbook — DB Schema (Phase 1)

Полная Supabase миграция. Файл будет в `packages/course-gen-platform/supabase/migrations/YYYYMMDD_career_playbook.sql`.

## Tables

### `career_playbooks`

Главная таблица с состоянием каждого Role Guide (draft + generated).

```sql
CREATE TABLE career_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  status TEXT NOT NULL CHECK (status IN (
    'draft',              -- создан, Q&A не закончен
    'answering_fixed',    -- идёт Phase A
    'awaiting_followups', -- ждём LLM follow-ups job
    'answering_followups',-- идёт Phase B
    'ready_to_generate',  -- Q&A завершён, можно жать "Сгенерировать"
    'generating',         -- LangGraph pipeline в работе
    'completed',          -- готов
    'failed'              -- terminal failure
  )),

  -- Контентный язык (тот же набор, что Stage 6: ru, en, es, de, fr, pt, it, ...).
  -- UI язык хранится в user preferences отдельно.
  language TEXT NOT NULL DEFAULT 'ru',

  -- Семантическая метаинформация (заполняется specBuilder после Q&A)
  slug TEXT,
  position_title TEXT,
  department TEXT,
  specialization TEXT,
  level TEXT,            -- 'junior' | 'middle' | 'senior' | 'lead' | 'director' | 'c-level'

  -- Q&A состояние
  q_a_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- shape:
  -- {
  --   fixed: [{question_key, value: string|string[], answered_at}],
  --   followups: [{question_id, question_text, type, value, skipped, answered_at}],
  --   freeform: [{text, parsed_signals: {...}, submitted_at}],
  --   completeness_score: 0.0-1.0
  -- }

  -- Spec contract (после specBuilder)
  role_profile_spec JSONB,
  -- shape: см. 03-prompts-structure.md "RoleProfileSpec schema"

  -- Сгенерированные блоки (key by block_id 1..26 + header)
  generated_blocks JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- shape:
  -- {
  --   block_1: {
  --     content: "markdown text",
  --     status: 'generated' | 'failed' | 'regenerating',
  --     judge_verdict: {pass: bool, issues: string[], score: 0-100},
  --     generated_at: ISO,
  --     llm_model: string,
  --     attempt: number
  --   },
  --   ...
  -- }

  -- Финальный собранный markdown (после finalAssembler)
  final_markdown TEXT,

  -- Web research результаты (для аудита)
  web_research JSONB,
  -- shape: { kpis: [...], trends: [...], onboarding: [...] }

  -- Cost tracking
  cost_breakdown JSONB,
  -- shape: { nodeCosts: [{node, model, input_tokens, output_tokens, cost_usd}], total_cost_usd }

  -- Sharing
  share_slug TEXT UNIQUE,           -- генерируется при включении шеринга
  is_public BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_career_playbooks_user ON career_playbooks(user_id);
CREATE INDEX idx_career_playbooks_org ON career_playbooks(organization_id);
CREATE INDEX idx_career_playbooks_status ON career_playbooks(status) WHERE status IN ('generating', 'awaiting_followups');
CREATE UNIQUE INDEX idx_career_playbooks_share_slug ON career_playbooks(share_slug) WHERE share_slug IS NOT NULL;

-- Auto-update updated_at trigger
CREATE TRIGGER career_playbooks_updated_at
  BEFORE UPDATE ON career_playbooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- (использует существующую функцию update_updated_at_column() из других таблиц)
```

### `career_playbook_fixed_questions`

Seed-таблица фиксированных стартовых вопросов (Phase A).

```sql
CREATE TABLE career_playbook_fixed_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  language TEXT NOT NULL,        -- 'ru' | 'en' (UI язык)
  position INT NOT NULL,          -- порядок отображения (1..N)
  question_key TEXT NOT NULL,     -- semantic key (e.g., 'position', 'department', 'team_size')

  question_type TEXT NOT NULL CHECK (question_type IN ('open', 'single_choice', 'multi_choice')),
  question_text TEXT NOT NULL,
  helper_text TEXT,               -- подсказка под полем

  options JSONB,                  -- для choice questions: [{value, label, helper?}, ...]

  -- Branching: показывать только если в другом вопросе выбрали option
  branching_rules JSONB,
  -- shape: {when: {question_key: 'department', value: 'sales'}}

  is_required BOOLEAN NOT NULL DEFAULT true,

  UNIQUE(language, question_key)
);
```

### `career_playbook_job_events` (опционально, можно использовать общий job_status)

Если общий `job_status` table не подходит — отдельная таблица для streaming прогресса. Чаще — переиспользуем существующий `job_status`.

## Row-Level Security

```sql
ALTER TABLE career_playbooks ENABLE ROW LEVEL SECURITY;

-- Read: own or same org
CREATE POLICY "career_playbooks_read_own_or_org" ON career_playbooks
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Write: own only
CREATE POLICY "career_playbooks_write_own" ON career_playbooks
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Public viewer route (/share/career-playbook/[slug]) — НЕ через RLS.
-- Используется service-role клиент с explicit check:
--   if (row.is_public !== true) return 404
-- См. share.router.ts handler.

ALTER TABLE career_playbook_fixed_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fixed_questions_read_all" ON career_playbook_fixed_questions
  FOR SELECT USING (true);  -- всем читать (это статичный seed)
```

## Seed Data — Fixed Questions

См. `02-fixed-questions-seed.md` — там полный JSON со всеми вопросами на RU+EN. Этот файл вставляется через `INSERT INTO career_playbook_fixed_questions ...` в той же миграции или отдельным seed-скриптом.

## Migration Order

1. Tables (career_playbooks, career_playbook_fixed_questions)
2. Indexes
3. Trigger
4. RLS policies
5. INSERT seed data

## Verification

После миграции:

```sql
-- Tables exist
SELECT tablename FROM pg_tables WHERE tablename LIKE 'career_playbook%';
-- Expected: career_playbooks, career_playbook_fixed_questions

-- RLS enabled
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('career_playbooks', 'career_playbook_fixed_questions');
-- Both should be true

-- Seed counts (≥ 7 questions × 2 languages = ≥ 14 rows; с branching больше)
SELECT language, COUNT(*) FROM career_playbook_fixed_questions GROUP BY language;
```

## Out of scope для этой миграции

- `job_status` extension — переиспользуем существующую
- `documents` extension для synthetic web articles — Phase 9 либо добавит column `source='web_research'`, либо переиспользует существующий source_type enum
- Versioning блоков (история правок) — отдельная миграция в будущей итерации
