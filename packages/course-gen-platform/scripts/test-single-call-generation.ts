#!/usr/bin/env tsx
/**
 * Single-Call vs Section-by-Section Generation A/B Test
 *
 * Compares lesson generation approaches:
 * - Approach A: Single LLM call for entire lesson (intro + sections + summary + exercises)
 * - Approach B: Two LLM calls (1: lesson body, 2: exercises + digest)
 *
 * Uses real LessonSpecificationV2 from course "Как стать счастливым"
 *
 * Usage:
 *   pnpm tsx scripts/test-single-call-generation.ts
 *   pnpm tsx scripts/test-single-call-generation.ts --lessons 1.1,1.2
 *   pnpm tsx scripts/test-single-call-generation.ts --model google/gemini-2.5-flash
 */

import 'dotenv/config';
import { program } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createOpenRouterModel } from '@/shared/llm/langchain-models';
import { getContentLabels, getLanguageName, getStylePrompt } from '@megacampus/shared-types';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';

// ============================================================================
// TYPES
// ============================================================================

interface GenerationResult {
  approach: string;
  lessonId: string;
  lessonTitle: string;
  model: string;
  content: string;
  wordCount: number;
  charCount: number;
  h2Headers: string[];
  durationMs: number;
  tokensUsed: number;
  error?: string;
}

// ============================================================================
// REAL LESSON SPECS FROM DB (course "Как стать счастливым")
// ============================================================================

const LESSON_SPECS: Record<string, LessonSpecificationV2> = {
  '1.1': {
    lesson_id: '1.1',
    title: 'Счастье = EBITDA: считаем деньги, которые теряет уставший сотрудник',
    description:
      'Рассчитать стоимость одного дня презентеизма для своей команды через формулу «ФОТ × 0,31 × коэффициент ошибок»',
    estimated_duration_minutes: 5,
    difficulty_level: 'beginner',
    metadata: {
      tone: 'conversational-professional',
      target_audience: 'practitioner',
      compliance_level: 'standard',
      content_archetype: 'concept_explainer',
    },
    learning_objectives: [
      {
        id: 'LO-1.1-1',
        objective:
          'Рассчитать стоимость одного дня презентеизма для своей команды через формулу «ФОТ × 0,31 × коэффициент ошибок»',
        bloom_level: 'apply',
      },
      {
        id: 'LO-1.1-2',
        objective:
          'Сопоставить пик кортизола и количество дефектов в коде: построить scatter-plot по данным Jira и Google Calendar',
        bloom_level: 'analyze',
      },
      {
        id: 'LO-1.1-3',
        objective:
          'Сформулировать CFO-дружественный аргумент: «Каждый час сонного stand-up стоит нам 17 400 ₽ прямого ущерба»',
        bloom_level: 'apply',
      },
    ],
    intro_blueprint: {
      hook_strategy: 'question',
      hook_topic: 'Счастье = EBITDA: считаем деньги, которые теряет уставший сотрудник',
      key_learning_objectives:
        'Рассчитать стоимость презентеизма, сопоставить кортизол и дефекты, сформулировать CFO-аргумент',
    },
    sections: [
      {
        title: 'Пик кортизол-кривой vs количество багов: корреляция 0,74 по данным 312 релизов',
        content_archetype: 'concept_explainer',
        rag_context_id: '1',
        constraints: { depth: 'detailed_analysis', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Пик кортизол-кривой vs количество багов'],
      },
      {
        title:
          'Презентеизм-коэффициент: как 1 час «пустого» времени в 9:00 превращается в 31 % снижение story-points',
        content_archetype: 'concept_explainer',
        rag_context_id: '1',
        constraints: { depth: 'detailed_analysis', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Презентеизм-коэффициент'],
      },
      {
        title: 'ROI-шаблон «Сон → Код → Деньги»: таблица для быстрого заполнения в Google Sheets',
        content_archetype: 'concept_explainer',
        rag_context_id: '1',
        constraints: { depth: 'detailed_analysis', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['ROI-шаблон'],
      },
      {
        title: 'Кейс «Яндекс»: перенос daily с 9:00 на 11:00 = –18 % ФОТ без увольнений',
        content_archetype: 'concept_explainer',
        rag_context_id: '1',
        constraints: { depth: 'detailed_analysis', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Кейс Яндекс'],
      },
      {
        title:
          'Антипаттерн «Кофе-машина ≠ Retention»: почему бесплатный капучино не снижает turnover-cost',
        content_archetype: 'concept_explainer',
        rag_context_id: '1',
        constraints: { depth: 'detailed_analysis', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Антипаттерн Кофе-машина'],
      },
      {
        title: 'Conclusion',
        content_archetype: 'concept_explainer',
        rag_context_id: '1',
        constraints: { depth: 'summary', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Key takeaways'],
      },
    ],
    exercises: [],
    rag_context: { search_queries: [], expected_chunks: 7, primary_documents: [] },
  },
  '1.2': {
    lesson_id: '1.2',
    title: 'Дорожная карта well-being: от CFO-ноу до подписи CEO за 90 дней',
    description:
      'Заполнить 1-страничный бюджетный чек-лист: capex vs opex, payback-period < 6 месяцев',
    estimated_duration_minutes: 5,
    difficulty_level: 'intermediate',
    metadata: {
      tone: 'conversational-professional',
      target_audience: 'practitioner',
      compliance_level: 'standard',
      content_archetype: 'concept_explainer',
    },
    learning_objectives: [
      {
        id: 'LO-1.2-1',
        objective:
          'Заполнить 1-страничный бюджетный чек-лист: capex vs opex, payback-period < 6 месяцев',
        bloom_level: 'apply',
      },
      {
        id: 'LO-1.2-2',
        objective:
          'Разбить 90-дневный пилот на три спринта: «Диагностика → Пилот → Масштаб» с gate-review для CFO',
        bloom_level: 'apply',
      },
      {
        id: 'LO-1.2-3',
        objective:
          'Сформировать KPI-доску в Notion: метрики happiness, speed, cost — без галочек «настроение 5/5»',
        bloom_level: 'apply',
      },
    ],
    intro_blueprint: {
      hook_strategy: 'analogy',
      hook_topic: 'Дорожная карта well-being: от CFO-ноу до подписи CEO за 90 дней',
      key_learning_objectives:
        'Заполнить бюджетный чек-лист, разбить 90-дневный пилот на спринты, сформировать KPI-доску',
    },
    sections: [
      {
        title: 'Gate 0: получение данных — как запросить HRV-анонимайзер без GDPR-риска',
        content_archetype: 'concept_explainer',
        rag_context_id: '1',
        constraints: { depth: 'detailed_analysis', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Gate 0: получение данных'],
      },
      {
        title: 'Gate 1: пилот 25 человек — выбор команды с наибольшим attrition-cost',
        content_archetype: 'concept_explainer',
        rag_context_id: '1',
        constraints: { depth: 'detailed_analysis', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Gate 1: пилот'],
      },
      {
        title: 'Gate 2: масштаб — шаблон email «Мы экономим 1,2 млн ₽ в год, вот скриншоты Jira»',
        content_archetype: 'concept_explainer',
        rag_context_id: '1',
        constraints: { depth: 'detailed_analysis', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Gate 2: масштаб'],
      },
      {
        title: 'Шаблон 3-слайдового питча: проблема → расчёт → следующий шаг',
        content_archetype: 'concept_explainer',
        rag_context_id: '1',
        constraints: { depth: 'detailed_analysis', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Шаблон питча'],
      },
      {
        title: 'Метрика «Счастье в деньгах»: переводим отпускные часы в сохранённый ФОТ',
        content_archetype: 'concept_explainer',
        rag_context_id: '1',
        constraints: { depth: 'detailed_analysis', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Метрика счастья'],
      },
      {
        title: 'Антириск-лист: 5 фраз CFO и готовые цифровые ответы',
        content_archetype: 'concept_explainer',
        rag_context_id: '1',
        constraints: { depth: 'detailed_analysis', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Антириск-лист'],
      },
      {
        title: 'Conclusion',
        content_archetype: 'concept_explainer',
        rag_context_id: '1',
        constraints: { depth: 'summary', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Key takeaways'],
      },
    ],
    exercises: [],
    rag_context: { search_queries: [], expected_chunks: 7, primary_documents: [] },
  },
  '4.1': {
    lesson_id: '4.1',
    title: 'Диагностика условий потока: от скуки к тревоге',
    description: 'Анализировать текущие задания сотрудников на соответствие 4 условиям потока',
    estimated_duration_minutes: 5,
    difficulty_level: 'beginner',
    metadata: {
      tone: 'conversational-professional',
      target_audience: 'practitioner',
      compliance_level: 'standard',
      content_archetype: 'concept_explainer',
    },
    learning_objectives: [
      {
        id: 'LO-4.1-1',
        objective: 'Анализировать текущие задания сотрудников на соответствие 4 условиям потока',
        bloom_level: 'analyze',
      },
      {
        id: 'LO-4.1-2',
        objective:
          'Классифицировать задачи по балансу сложности и навыков, чтобы найти зону потока',
        bloom_level: 'analyze',
      },
      {
        id: 'LO-4.1-3',
        objective:
          'Разработать конкретные изменения для перекладывания задачи из зоны скуки или тревоги в зону потока',
        bloom_level: 'apply',
      },
    ],
    intro_blueprint: {
      hook_strategy: 'question',
      hook_topic: 'Диагностика условий потока: от скуки к тревоге',
      key_learning_objectives:
        'Анализировать задания на соответствие условиям потока, классифицировать задачи, разработать изменения',
    },
    sections: [
      {
        title:
          '4 условия потока: ясность целей, баланс сложности и навыков, немедленная обратная связь, контроль действий',
        content_archetype: 'concept_explainer',
        rag_context_id: '4',
        constraints: { depth: 'detailed_analysis', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['4 условия потока'],
      },
      {
        title: 'Диагностика скуки (низкая сложность) и тревоги (высокая сложность)',
        content_archetype: 'concept_explainer',
        rag_context_id: '4',
        constraints: { depth: 'detailed_analysis', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Диагностика скуки и тревоги'],
      },
      {
        title: 'Создание «контракта потока» для задачи: четкий КПИ и границы решения',
        content_archetype: 'concept_explainer',
        rag_context_id: '4',
        constraints: { depth: 'detailed_analysis', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Контракт потока'],
      },
      {
        title:
          'Пример из бизнеса: как в Яндексе перераспределили встречи, чтобы создать блоки для глубокой работы',
        content_archetype: 'concept_explainer',
        rag_context_id: '4',
        constraints: { depth: 'detailed_analysis', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Кейс Яндекс'],
      },
      {
        title: 'Conclusion',
        content_archetype: 'concept_explainer',
        rag_context_id: '4',
        constraints: { depth: 'summary', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Key takeaways'],
      },
    ],
    exercises: [],
    rag_context: { search_queries: [], expected_chunks: 7, primary_documents: [] },
  },
  '6.2': {
    lesson_id: '6.2',
    title: 'Дизайн опросника и анализ PERMA-данных для предотвращения увольнений',
    description:
      'Сконструировать лаконичный 5-вопросный опросник PERMA для еженедельного запуска через корпоративный мессенджер',
    estimated_duration_minutes: 5,
    difficulty_level: 'beginner',
    metadata: {
      tone: 'conversational-professional',
      target_audience: 'practitioner',
      compliance_level: 'standard',
      content_archetype: 'concept_explainer',
    },
    learning_objectives: [
      {
        id: 'LO-6.2-1',
        objective:
          'Сконструировать лаконичный 5-вопросный опросник PERMA для еженедельного запуска через корпоративный мессенджер',
        bloom_level: 'apply',
      },
      {
        id: 'LO-6.2-2',
        objective:
          'Провести аудит PERMA-профиля сотрудника и выделить "красные флаги" риска увольнения',
        bloom_level: 'analyze',
      },
      {
        id: 'LO-6.2-3',
        objective: 'Интерпретировать групповую динамику PERMA-индекса для подразделения',
        bloom_level: 'analyze',
      },
      {
        id: 'LO-6.2-4',
        objective:
          'Интегрировать результаты PERMA-опроса в структуру 1-on-1 встречи для персонализации мотивации',
        bloom_level: 'apply',
      },
    ],
    intro_blueprint: {
      hook_strategy: 'statistic',
      hook_topic: 'Дизайн опросника и анализ PERMA-данных для предотвращения увольнений',
      key_learning_objectives:
        'Сконструировать опросник PERMA, провести аудит, интерпретировать динамику, интегрировать в 1-on-1',
    },
    sections: [
      {
        title:
          "Составление вопросов: от абстрактного 'как вы себя чувствуете' к конкретному 'какую задачу вы считаете наиболее осмысленной за неделю'",
        content_archetype: 'concept_explainer',
        rag_context_id: '6',
        constraints: { depth: 'detailed_analysis', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Составление вопросов'],
      },
      {
        title: 'Визуализация данных: построение радарной диаграммы PERMA-профиля',
        content_archetype: 'concept_explainer',
        rag_context_id: '6',
        constraints: { depth: 'detailed_analysis', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Визуализация PERMA'],
      },
      {
        title:
          "Корреляционный анализ: как падение индекса 'Отношений' предсказывает рост запросов на перевод",
        content_archetype: 'concept_explainer',
        rag_context_id: '6',
        constraints: { depth: 'detailed_analysis', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Корреляционный анализ'],
      },
      {
        title: "Шаблон беседы: как обсудить низкий PERMA-индекс без давления (кейс 'Сбер')",
        content_archetype: 'concept_explainer',
        rag_context_id: '6',
        constraints: { depth: 'detailed_analysis', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Шаблон беседы'],
      },
      {
        title: 'Алгоритм действий HR: если PERMA-индекс < 3.5 балла — запуск интервью Job Crafting',
        content_archetype: 'concept_explainer',
        rag_context_id: '6',
        constraints: { depth: 'detailed_analysis', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Алгоритм HR'],
      },
      {
        title: 'Conclusion',
        content_archetype: 'concept_explainer',
        rag_context_id: '6',
        constraints: { depth: 'summary', prohibited_terms: [], required_keywords: [] },
        key_points_to_cover: ['Key takeaways'],
      },
    ],
    exercises: [],
    rag_context: { search_queries: [], expected_chunks: 7, primary_documents: [] },
  },
};

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

function buildSingleCallPrompt(spec: LessonSpecificationV2, language: string): string {
  const headers = getContentLabels(language);
  const langName = getLanguageName(language);
  const durationMinutes = spec.estimated_duration_minutes || 5;
  const targetWordCount = Math.round(durationMinutes * 150); // ~150 words/min reading speed

  // Build sections list (exclude Conclusion - we generate Summary ourselves)
  const contentSections = spec.sections.filter(s => s.title !== 'Conclusion');
  const sectionsList = contentSections.map((s, i) => `${i + 1}. ${s.title}`).join('\n');

  const objectivesList = spec.learning_objectives
    .map((lo, i) => `${i + 1}. ${lo.objective}`)
    .join('\n');

  let stylePrompt = '';
  try {
    stylePrompt = getStylePrompt('professional');
  } catch {
    stylePrompt = '';
  }

  return `<lesson_specification>
  <title>${spec.title}</title>
  <description>${spec.description}</description>
  <duration_minutes>${durationMinutes}</duration_minutes>
  <target_word_count>${targetWordCount}</target_word_count>
  <target_audience>${spec.metadata.target_audience}</target_audience>
  <tone>${spec.metadata.tone}</tone>
  <difficulty>${spec.difficulty_level}</difficulty>

  <learning_objectives>
${objectivesList}
  </learning_objectives>

  <sections_to_cover>
${sectionsList}
  </sections_to_cover>

  <intro_blueprint>
    <hook_strategy>${spec.intro_blueprint.hook_strategy}</hook_strategy>
    <hook_topic>${spec.intro_blueprint.hook_topic}</hook_topic>
  </intro_blueprint>
</lesson_specification>

<content_style>
${stylePrompt}
</content_style>

<visual_toolkit>
Use actively to create engaging content:
1. **Mermaid Diagrams** — flowchart TD/LR, sequenceDiagram, mindmap, pie, timeline
2. **Math Formulas** (LaTeX): inline $E=mc^2$ or block $$\\sum_{i=1}^{n} x_i$$
3. **Callouts**: > [!TIP], > [!WARNING], > [!NOTE], > [!INFO]
4. **Tables** for comparisons
5. **Code blocks** with filenames when relevant
</visual_toolkit>

<output_language>
MANDATORY: Write ALL content in ${langName}.
Every word, header, example must be in ${langName}.
DO NOT mix languages (except code/syntax keywords).
</output_language>

<task>
Write a COMPLETE lesson for a ${durationMinutes}-minute reading session.
Target: approximately ${targetWordCount} words total.

STRUCTURE (use ## headers for each section):
1. ## ${headers.introduction} — Hook (${spec.intro_blueprint.hook_strategy}) + preview of learning objectives (100-150 words)
2. Content sections (one ## header per topic from sections_to_cover).
   All sections combined should be approximately ${targetWordCount - 300} words.
   Each section should be focused and proportional.
3. ## ${headers.summary} — Brief recap + next steps (80-120 words)
4. ## ${headers.exercises} — Exactly 2 practical exercises with hints and sample answers

CRITICAL RULES:
- This is a ${durationMinutes}-minute lesson. Be concise and focused.
- DO NOT repeat or re-explain topics between sections. Each section covers its own unique content.
- Transitions between sections: 1 sentence max. NO recaps of previous sections.
- Cover ALL topics from sections_to_cover, but keep each proportional to the total word budget.
- Include at least 1 visual element (diagram, table, or callout) in the lesson.
- DO NOT start sections with "As we discussed..." or "In the previous section..." patterns.
</task>`;
}

function buildTwoCallBodyPrompt(spec: LessonSpecificationV2, language: string): string {
  const headers = getContentLabels(language);
  const langName = getLanguageName(language);
  const durationMinutes = spec.estimated_duration_minutes || 5;
  const targetWordCount = Math.round(durationMinutes * 150);

  const contentSections = spec.sections.filter(s => s.title !== 'Conclusion');
  const sectionsList = contentSections.map((s, i) => `${i + 1}. ${s.title}`).join('\n');

  const objectivesList = spec.learning_objectives
    .map((lo, i) => `${i + 1}. ${lo.objective}`)
    .join('\n');

  let stylePrompt = '';
  try {
    stylePrompt = getStylePrompt('professional');
  } catch {
    stylePrompt = '';
  }

  return `<lesson_specification>
  <title>${spec.title}</title>
  <description>${spec.description}</description>
  <duration_minutes>${durationMinutes}</duration_minutes>
  <target_word_count>${targetWordCount}</target_word_count>
  <target_audience>${spec.metadata.target_audience}</target_audience>
  <tone>${spec.metadata.tone}</tone>
  <difficulty>${spec.difficulty_level}</difficulty>

  <learning_objectives>
${objectivesList}
  </learning_objectives>

  <sections_to_cover>
${sectionsList}
  </sections_to_cover>

  <intro_blueprint>
    <hook_strategy>${spec.intro_blueprint.hook_strategy}</hook_strategy>
    <hook_topic>${spec.intro_blueprint.hook_topic}</hook_topic>
  </intro_blueprint>
</lesson_specification>

<content_style>
${stylePrompt}
</content_style>

<visual_toolkit>
Use actively: Mermaid diagrams, LaTeX formulas, Callouts ([!TIP], [!WARNING], [!NOTE]), Tables, Code blocks.
</visual_toolkit>

<output_language>
MANDATORY: Write ALL content in ${langName}. DO NOT mix languages.
</output_language>

<task>
Write the LESSON BODY (without exercises) for a ${durationMinutes}-minute reading session.
Target: approximately ${targetWordCount - 200} words.

STRUCTURE:
1. ## ${headers.introduction} — Hook (${spec.intro_blueprint.hook_strategy}) + preview (100-150 words)
2. Content sections — one ## header per topic from sections_to_cover
3. ## ${headers.summary} — Brief recap + next steps (80-120 words)

CRITICAL: Be concise. No recaps between sections. ${durationMinutes}-minute lesson = focused content.
DO NOT include exercises — they will be generated separately.
</task>`;
}

function buildTwoCallExercisesPrompt(
  lessonBody: string,
  spec: LessonSpecificationV2,
  language: string
): string {
  const headers = getContentLabels(language);
  const langName = getLanguageName(language);

  return `<lesson_content>
${lessonBody}
</lesson_content>

<lesson_info>
  <title>${spec.title}</title>
  <target_audience>${spec.metadata.target_audience}</target_audience>
  <difficulty>${spec.difficulty_level}</difficulty>
</lesson_info>

<output_language>
MANDATORY: Write ALL content in ${langName}. DO NOT mix languages.
</output_language>

<task>
Based on the lesson content above, generate TWO things:

1. ## ${headers.exercises}
   Create EXACTLY 2 practical exercises based on the lesson content.
   Each exercise should have:
   - Clear task description (2-3 sentences)
   - A scenario if applicable
   - A hint
   - A sample answer

2. ## Lesson Digest
   Write a 2-3 sentence summary of this lesson's key concepts.
   This digest will be provided as context when generating the NEXT lesson,
   so focus on the main ideas a reader should remember.

Format exercises using these labels (in ${langName}):
### ${headers.exercise} 1: [Title]
**${headers.task}:** [description]
**${headers.scenario}:** [if applicable]
**${headers.yourAnswer}:**
> **${headers.hint}:** [hint]
> **${headers.sampleAnswer}:** [answer]

---
</task>`;
}

// ============================================================================
// GENERATION FUNCTIONS
// ============================================================================

async function generateSingleCall(
  spec: LessonSpecificationV2,
  modelId: string,
  language: string
): Promise<GenerationResult> {
  const startTime = Date.now();
  try {
    const model = createOpenRouterModel(modelId, 0.7, 8000);
    const prompt = buildSingleCallPrompt(spec, language);
    const response = await model.invoke(prompt);
    const content =
      typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    const tokensUsed = extractTokens(response);
    const durationMs = Date.now() - startTime;

    return {
      approach: 'single-call',
      lessonId: spec.lesson_id,
      lessonTitle: spec.title,
      model: modelId,
      content,
      wordCount: countWords(content),
      charCount: content.length,
      h2Headers: extractH2Headers(content),
      durationMs,
      tokensUsed,
    };
  } catch (error) {
    return {
      approach: 'single-call',
      lessonId: spec.lesson_id,
      lessonTitle: spec.title,
      model: modelId,
      content: '',
      wordCount: 0,
      charCount: 0,
      h2Headers: [],
      durationMs: Date.now() - startTime,
      tokensUsed: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function generateTwoCall(
  spec: LessonSpecificationV2,
  modelId: string,
  language: string
): Promise<GenerationResult> {
  const startTime = Date.now();
  try {
    const model = createOpenRouterModel(modelId, 0.7, 8000);

    // Call 1: Lesson body
    const bodyPrompt = buildTwoCallBodyPrompt(spec, language);
    const bodyResponse = await model.invoke(bodyPrompt);
    const bodyContent =
      typeof bodyResponse.content === 'string'
        ? bodyResponse.content
        : JSON.stringify(bodyResponse.content);
    const bodyTokens = extractTokens(bodyResponse);

    // Call 2: Exercises + digest
    const exPrompt = buildTwoCallExercisesPrompt(bodyContent, spec, language);
    const exResponse = await model.invoke(exPrompt);
    const exContent =
      typeof exResponse.content === 'string'
        ? exResponse.content
        : JSON.stringify(exResponse.content);
    const exTokens = extractTokens(exResponse);

    // Combine
    const fullContent = bodyContent + '\n\n' + exContent;
    const durationMs = Date.now() - startTime;

    return {
      approach: 'two-call',
      lessonId: spec.lesson_id,
      lessonTitle: spec.title,
      model: modelId,
      content: fullContent,
      wordCount: countWords(fullContent),
      charCount: fullContent.length,
      h2Headers: extractH2Headers(fullContent),
      durationMs,
      tokensUsed: bodyTokens + exTokens,
    };
  } catch (error) {
    return {
      approach: 'two-call',
      lessonId: spec.lesson_id,
      lessonTitle: spec.title,
      model: modelId,
      content: '',
      wordCount: 0,
      charCount: 0,
      h2Headers: [],
      durationMs: Date.now() - startTime,
      tokensUsed: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function countWords(text: string): number {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/[#*_~`]/g, '')
    .trim();
  return cleaned.split(/\s+/).filter(w => w.length > 0).length;
}

function extractH2Headers(text: string): string[] {
  const matches = text.match(/^## .+$/gm);
  return matches ? matches.map(h => h.replace('## ', '')) : [];
}

function extractTokens(response: { response_metadata?: Record<string, unknown> }): number {
  const meta = response.response_metadata;
  if (meta && typeof meta === 'object') {
    const usage = meta.usage as Record<string, unknown> | undefined;
    if (usage && typeof usage === 'object' && typeof usage.total_tokens === 'number') {
      return usage.total_tokens;
    }
  }
  return 0;
}

// ============================================================================
// REPORT
// ============================================================================

function generateReport(results: GenerationResult[]): string {
  let md = `# Single-Call vs Two-Call Generation Test\n\n`;
  md += `**Date**: ${new Date().toISOString()}\n`;
  md += `**Course**: Как стать счастливым\n\n`;
  md += `---\n\n`;

  // Summary table
  md += `## Summary\n\n`;
  md += `| Lesson | Approach | Words | Chars | H2 Count | Tokens | Duration | Status |\n`;
  md += `|--------|----------|-------|-------|----------|--------|----------|--------|\n`;

  for (const r of results) {
    const status = r.error ? `ERR` : `OK`;
    md += `| ${r.lessonId} | ${r.approach} | ${r.wordCount} | ${r.charCount} | ${r.h2Headers.length} | ${r.tokensUsed} | ${(r.durationMs / 1000).toFixed(1)}s | ${status} |\n`;
  }

  md += `\n---\n\n`;

  // Detailed results per lesson
  const lessonIds = [...new Set(results.map(r => r.lessonId))];
  for (const lessonId of lessonIds) {
    const lessonResults = results.filter(r => r.lessonId === lessonId);
    const spec = LESSON_SPECS[lessonId];
    md += `## Lesson ${lessonId}: ${spec?.title || 'Unknown'}\n\n`;
    md += `- **Duration**: ${spec?.estimated_duration_minutes || '?'} min\n`;
    md += `- **Sections in spec**: ${spec?.sections.length || '?'} (${spec?.sections.filter(s => s.title !== 'Conclusion').length} content + Conclusion)\n`;
    md += `- **Target words**: ~${(spec?.estimated_duration_minutes || 5) * 150}\n\n`;

    for (const r of lessonResults) {
      md += `### ${r.approach} (${r.model})\n\n`;
      if (r.error) {
        md += `**ERROR**: ${r.error}\n\n`;
        continue;
      }
      md += `- **Words**: ${r.wordCount}\n`;
      md += `- **Characters**: ${r.charCount}\n`;
      md += `- **H2 Headers**: ${r.h2Headers.join(' | ')}\n`;
      md += `- **Tokens used**: ${r.tokensUsed}\n`;
      md += `- **Duration**: ${(r.durationMs / 1000).toFixed(1)}s\n\n`;

      md += `<details>\n<summary>Full content (click to expand)</summary>\n\n`;
      md += '```markdown\n' + r.content + '\n```\n';
      md += `</details>\n\n`;
    }
    md += `---\n\n`;
  }

  return md;
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  program
    .option('--lessons <ids>', 'Comma-separated lesson IDs', '1.1,1.2')
    .option('--model <id>', 'Model ID to use', 'google/gemini-2.5-flash')
    .option('--approaches <list>', 'Approaches to test', 'single,two')
    .parse();

  const opts = program.opts();
  const lessonIds = opts.lessons.split(',').map((s: string) => s.trim());
  const modelId = opts.model;
  const approaches = opts.approaches.split(',').map((s: string) => s.trim());
  const language = 'ru';

  console.log('\n' + '='.repeat(70));
  console.log('SINGLE-CALL vs TWO-CALL GENERATION TEST');
  console.log('='.repeat(70));
  console.log(`Lessons: ${lessonIds.join(', ')}`);
  console.log(`Model: ${modelId}`);
  console.log(`Approaches: ${approaches.join(', ')}`);
  console.log(`Language: ${language}`);
  console.log('');

  const results: GenerationResult[] = [];

  for (const lessonId of lessonIds) {
    const spec = LESSON_SPECS[lessonId];
    if (!spec) {
      console.error(`Lesson spec not found for ${lessonId}`);
      continue;
    }

    console.log(`\n--- Lesson ${lessonId}: ${spec.title} ---`);
    console.log(`    ${spec.sections.length} sections, ${spec.estimated_duration_minutes} min`);

    if (approaches.includes('single')) {
      console.log(`\n  [single-call] Generating...`);
      const result = await generateSingleCall(spec, modelId, language);
      results.push(result);
      if (result.error) {
        console.log(`  [single-call] ERROR: ${result.error}`);
      } else {
        console.log(
          `  [single-call] Done: ${result.wordCount} words, ${result.charCount} chars, ${result.h2Headers.length} H2s, ${(result.durationMs / 1000).toFixed(1)}s`
        );
      }
    }

    if (approaches.includes('two')) {
      console.log(`\n  [two-call] Generating...`);
      const result = await generateTwoCall(spec, modelId, language);
      results.push(result);
      if (result.error) {
        console.log(`  [two-call] ERROR: ${result.error}`);
      } else {
        console.log(
          `  [two-call] Done: ${result.wordCount} words, ${result.charCount} chars, ${result.h2Headers.length} H2s, ${(result.durationMs / 1000).toFixed(1)}s`
        );
      }
    }
  }

  // Save results
  const outputDir = '.tmp/test-single-call';
  await fs.mkdir(outputDir, { recursive: true });

  // Save report
  const report = generateReport(results);
  const reportPath = path.join(outputDir, 'report.md');
  await fs.writeFile(reportPath, report, 'utf-8');

  // Save individual lesson outputs
  for (const r of results) {
    if (r.content) {
      const filename = `${r.lessonId}-${r.approach}.md`;
      await fs.writeFile(path.join(outputDir, filename), r.content, 'utf-8');
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(70));
  console.log('');
  console.log(
    `${'Lesson'.padEnd(8)} ${'Approach'.padEnd(14)} ${'Words'.padEnd(8)} ${'Chars'.padEnd(8)} ${'H2s'.padEnd(5)} ${'Time'.padEnd(8)} Status`
  );
  console.log('-'.repeat(70));

  for (const r of results) {
    const status = r.error ? 'ERR' : 'OK';
    console.log(
      `${r.lessonId.padEnd(8)} ${r.approach.padEnd(14)} ${String(r.wordCount).padEnd(8)} ${String(r.charCount).padEnd(8)} ${String(r.h2Headers.length).padEnd(5)} ${(r.durationMs / 1000).toFixed(1).padEnd(8)}s ${status}`
    );
  }

  console.log('');
  console.log(`Report saved: ${reportPath}`);
  console.log(`Lesson files saved: ${outputDir}/`);
  console.log('='.repeat(70) + '\n');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
