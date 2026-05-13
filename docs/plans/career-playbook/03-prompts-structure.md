# Career Playbook — Prompts Structure (Phase 2-3)

Все промпты регистрируются в `career-playbook-prompts.ts` и грузятся через существующий `PromptService.getPrompt()`. Каждый промпт имеет ru + en версии (плюс остальные content languages добавляются позже как fallback к en).

## Prompt registry

```typescript
// packages/course-gen-platform/src/shared/prompts/career-playbook-prompts.ts

export const CAREER_PLAYBOOK_PROMPTS = {
  // Phase A → Phase B bridge: генерация follow-up вопросов
  'career_playbook_followup_generator': { /* ... */ },

  // Phase Q&A → spec
  'career_playbook_spec_builder': { /* ... */ },

  // Generation groups (1 промпт на группу × N языков; 26 блоков встроены в structured output spec)
  'career_playbook_group_1_foundation': { /* Header + 1 Mission + 2 Anti-goals + 5 Decision Matrix */ },
  'career_playbook_group_2_operations': { /* 3 Responsibility + 4 Duties + 6 KPI + 8 Tools */ },
  'career_playbook_group_3_people': { /* 7 Competencies + 9 Human-AI + 12 Candidate + 13 Day */ },
  'career_playbook_group_4_growth': { /* 11 Career + 14 Onboarding + 15 Motivation + 17 Red flags */ },
  'career_playbook_group_5_system': { /* 10 Dependencies + 16 Processes + 19 Industry + 20 Business + 21 Failure */ },
  'career_playbook_group_6_wrap': { /* 18 FAQ + 22 README + 23 Continuity + 24 Canvas + 25 Footer */ },

  // Cross-block judge
  'career_playbook_cross_block_judge': { /* ... */ },

  // Block regenerator (с targeted instruction)
  'career_playbook_block_regenerator': { /* ... */ },

  // Course bridge (для генерации course_brief из Role Guide)
  'career_playbook_course_brief_extractor': { /* ... */ },
} satisfies HardcodedPromptRegistry;
```

## RoleProfileSpec schema

Контракт между Q&A и генерацией блоков. Заполняется `spec-builder` нодой.

```typescript
interface RoleProfileSpec {
  // Identity (из fixed answers)
  position: {
    title: string;             // "Менеджер по продажам B2B"
    slug: string;              // "sales-manager-b2b"
    department: string;        // 'sales'
    specialization?: string;   // "Enterprise sales" (опционально, из LLM или fixed Q)
    level: 'junior' | 'middle' | 'senior' | 'lead' | 'director' | 'c-level';
  };

  // Context
  context: {
    company_stage?: 'pre-pmf' | 'growth' | 'scale' | 'mature';
    team_size: '1-10' | '11-50' | '51-200' | '201-1000' | '1000+';
    reports_to: string;        // "CRO"
    has_subordinates: boolean;
    subordinates_description?: string;
    industry?: string;         // выводится LLM из department + context
    region?: string;           // если в Q&A был указан
  };

  // Focus (LLM из всех ответов извлекает)
  focus_areas: {
    primary_kpis: string[];          // 3-5 ключевых метрик роли
    key_tools: string[];             // top 5-8 инструментов
    critical_competencies: string[]; // 4-6 must-have навыков
    anti_goals: string[];            // 4-6 чего эта роль НЕ делает (важно для блока 2)
    failure_patterns: string[];      // 3-5 typical failure modes (для блока 21)
  };

  // Research (от web-research ноды)
  research: {
    kpis_insights: string[];      // факты из web search про KPI
    trends_insights: string[];    // trends + AI impact
    onboarding_insights: string[];// onboarding best practices
    sources: string[];            // URLs (для аудита)
  } | null;

  // Boundaries (anti-repetition contract)
  block_boundaries: {
    // Какие темы упоминаются в каком блоке (чтобы другие не повторяли)
    [blockId: string]: {
      primary_topics: string[];       // основные темы
      do_not_repeat: string[];        // что уже сказано в других блоках
    };
  };

  // Language (для контента)
  content_language: string;  // 'ru' | 'en' | 'es' | ...
}
```

## Prompt templates

### `career_playbook_followup_generator`

Цель: после Phase A — LLM генерирует 3-7 adaptive follow-up вопросов.

```
SYSTEM:
Ты — HR-эксперт, который помогает создать operational role guide.
Тебе дали ответы пользователя на стартовые вопросы. Сгенерируй 3-7 дополнительных
вопросов, которые помогут собрать критичные данные для качественного Role Guide
по методологиям Netflix/Amazon/Toyota/Spotify/Bridgewater.

Учитывай department-specific direction:
- sales: ACV, типы сделок, цикл, воронка
- engineering: стек, scale challenges, prod issues
- ... (см. fixed-questions-seed.md "Department-specific")

Каждый вопрос:
- Сфокусирован на ОДНОМ конкретном аспекте
- Имеет clear value для Role Guide (не любопытство)
- Mix форматов: предпочитай single_choice / multi_choice если можешь дать sensible options

Верни JSON:
{
  "questions": [
    {
      "question_id": "uuid_v4_string",
      "question_text": "...",
      "question_type": "open" | "single_choice" | "multi_choice",
      "options": [{value, label}, ...] | null,
      "rationale": "почему это важно для Role Guide"
    }
  ],
  "completeness_score": 0.0-1.0,
  "stop_recommendation": "ask_more" | "ready_to_generate"
}

completeness_score:
- 0.0-0.4 — критически мало данных, точно нужны ещё вопросы
- 0.4-0.7 — middle, желательны ещё 2-3
- 0.7-0.95 — достаточно для generation, можно один уточняющий
- 0.95+ — готовы генерировать

USER:
Position: {{position}}
Department: {{department}}
Level: {{level}}
Team size: {{team_size}}
Company stage: {{company_stage}}
Reports to / subordinates: {{reporting}}
Content language: {{content_language}}

Free-form context (если есть): {{freeform_text}}

Previous follow-ups answered: {{previous_followups_json}}
```

Output validation (Zod):

```typescript
const FollowupResponseSchema = z.object({
  questions: z.array(z.object({
    question_id: z.string(),
    question_text: z.string(),
    question_type: z.enum(['open', 'single_choice', 'multi_choice']),
    options: z.array(z.object({value: z.string(), label: z.string()})).nullable(),
    rationale: z.string()
  })).min(0).max(7),
  completeness_score: z.number().min(0).max(1),
  stop_recommendation: z.enum(['ask_more', 'ready_to_generate'])
});
```

### `career_playbook_spec_builder`

Цель: из Q&A + web research → RoleProfileSpec.

```
SYSTEM:
Из ответов пользователя на вопросы и web research результатов сформируй
RoleProfileSpec. Это контракт, который будет использоваться при генерации
26 блоков Role Guide. Качество спецификации напрямую влияет на качество
всего документа.

Особенно важно:
- block_boundaries — что упоминается в каком блоке. Это предотвращает
  повторы. Например, если competencies (block 7) уже упоминают "переговоры",
  блок 4 (duties) НЕ должен повторять "переговоры" как competency, только
  как activity.
- anti_goals — что роль НЕ делает (для блока 2)
- failure_patterns — типичные провалы (для блока 21)

Верни JSON по схеме RoleProfileSpec.

USER:
Q&A answers: {{qa_data_json}}
Web research:
- KPI insights: {{kpi_insights}}
- Trends: {{trends_insights}}
- Onboarding: {{onboarding_insights}}

Output language: {{content_language}}
```

### Group prompts (1-6)

Шаблон для группы — каждый блок имеет explicit table/structure spec.

Пример `career_playbook_group_1_foundation`:

```
SYSTEM:
Сгенерируй Role Guide блоки группы 1 (Foundation): Header + Block 1 (Mission/KR) +
Block 2 (Anti-goals) + Block 5 (Decision Matrix).

Методология:
- Block 1 — Job Scorecard (Geoff Smart "Who"): миссия 2-3 предложения + 3-5 measurable KR в таблице
- Block 2 — Anti-goals (Charlie Munger inversion): таблица 4-6 explicit "что НЕ делает" + чья ответственность
- Block 5 — Decision Authority Matrix (Management 3.0 + Amazon One-Way/Two-Way Door): таблица решение → автономия → действие, ≥4 решений

Format requirements:
- Markdown с tables, без HTML
- Russian language: "По данным {source}..." natural citations
- Для блока 1: обязательно North Star Metric в metadata
- Для блока 2: min 4 anti-goals
- Для блока 5: min 4 decisions, span autonomy levels

USER:
RoleProfileSpec: {{spec_json}}
Content language: {{content_language}}

Return markdown content for groups in this exact order:
## Header
{content}

## 1. Миссия и ключевые результаты
{content}

## 2. Анти-цели: что эта роль НЕ делает
{content}

## 5. Матрица решений (Decision Authority)
{content}
```

Аналогично — для остальных групп. Они опираются на skill SKILL.md (lines 124-697 содержат detailed spec для каждого блока).

### `career_playbook_cross_block_judge`

Цель: проверить согласованность сгенерированной группы относительно предыдущих.

```
SYSTEM:
Проверь сгенерированную группу блоков {{group_id}} на согласованность с предыдущими
группами и RoleProfileSpec.

Checks:
1. **No repetition**: темы не повторяются с другими блоками (см. block_boundaries)
2. **Cross-references**: упомянутые элементы существуют в других блоках:
   - competencies из блока 7 ↔ tools из блока 8
   - KPI из блока 6 ↔ responsibilities из блока 3
   - anti-goals из блока 2 не противоречат duties из блока 4
3. **Format**: tables present where required, mermaid syntax valid, min items satisfied
4. **Quality**: actionable, measurable, business-owner language (не HR jargon)

Верни JSON:
{
  "pass": boolean,
  "score": 0-100,
  "issues": [
    {
      "block_id": "block_5",
      "severity": "critical" | "warning" | "info",
      "description": "...",
      "suggestion": "..."
    }
  ],
  "needs_regeneration": ["block_5", ...]  // которые нужно перегенерировать
}

USER:
RoleProfileSpec: {{spec_json}}
Previous groups output: {{prev_groups_content}}
Current group output: {{current_group_content}}
```

### `career_playbook_block_regenerator`

Цель: перегенерировать один блок с targeted instruction.

```
SYSTEM:
Перегенерируй блок {{block_id}} ({{block_name}}) с учётом замечания.

Original block content:
{{original_content}}

Issue from judge:
{{issue_description}}
Suggestion:
{{suggestion}}

User edit instruction (если есть от пользователя — Edit с "Что изменить?"):
{{user_instruction}}

Контракт блока — см. RoleProfileSpec.block_boundaries[{{block_id}}] и
оригинальный prompt для группы (preservation of format requirements).

Верни только markdown для этого блока.

USER:
RoleProfileSpec: {{spec_json}}
Other blocks summary (для cross-reference consistency): {{other_blocks_brief}}
Content language: {{content_language}}
```

### `career_playbook_course_brief_extractor`

Цель: извлечь course brief из Role Guide для генерации курса.

```
SYSTEM:
Из готового Role Guide извлеки course_brief — JSON структуру для генерации
обучающего курса для этой роли. Также сгенерируй 5-10 web search queries
для сбора synthetic source corpus.

Course brief:
{
  "position_title": "...",
  "target_audience": "...",  // кто будет учиться
  "learning_goals": [...],   // 4-6 целей из competencies + KPIs
  "suggested_modules": [
    {
      "title": "...",
      "based_on_block": "competencies" | "tools" | "kpi" | "processes",
      "skills": [...],
      "estimated_lessons": 3-7
    }
  ],
  "course_size": "small" | "medium" | "large",  // S=5-7 lessons, M=10-15, L=20-30
  "estimated_duration_hours": number,
  "web_search_queries": [
    "best practices {role} {competency} 2026",
    "{tool} tutorial",
    ...
  ]
}

USER:
Role Guide markdown:
{{role_guide_md}}

Content language: {{content_language}}
```

## Model selection

Через `ModelConfigService`. Новые stage keys:
- `stage_career_playbook_followup` — fast model (Sonnet/Haiku)
- `stage_career_playbook_spec` — quality model (Sonnet/Opus)
- `stage_career_playbook_group_1` ... `group_6` — quality model
- `stage_career_playbook_judge` — quality model (Sonnet)
- `stage_career_playbook_regenerator` — quality model
- `stage_career_playbook_course_brief` — fast model

Fallback model — `google/gemini-3-flash-preview` (как Stage 6).

## Variable conventions

- `{{position}}`, `{{department}}`, ... — простые скаляры
- `{{qa_data_json}}`, `{{spec_json}}` — сериализованный JSON
- `{{content_language}}` — целевой язык контента
- `{{previous_followups_json}}` — массив объектов

Все variables валидируются Zod через `PromptVariable[]` (паттерн `stage6-prompts.ts`).

## Caching

`PromptService.getPrompt()` уже кеширует 5 мин TTL. Никакой доп. работы.
