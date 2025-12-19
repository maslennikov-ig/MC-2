/**
 * Run tests for DeepSeek V3.2 model
 * API: deepseek/deepseek-v3.2
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OUTPUT_DIR = '/home/me/code/mc2/docs/lessons-testing/test-results';

if (!OPENROUTER_API_KEY) {
  console.error('OPENROUTER_API_KEY environment variable is required');
  process.exit(1);
}

const MODEL = {
  slug: 'xiaomi-mimo-v2-flash',
  apiName: 'xiaomi/mimo-v2-flash:free',
  name: 'Xiaomi Mimo V2 Flash'
};

const LESSONS = {
  '1.1': {
    id: '1.1',
    language: 'ru',
    title: 'Что такое нематериальный продукт: билет как товар',
    description: 'Урок о понимании билета как нематериального продукта и особенностях его продажи',
    section_title: 'Основы продаж билетов как нематериального продукта',
    learning_objectives: [
      'Распознать отличие билета от физического товара по пяти критериям',
      'Описать три ключевые особенности нематериального продукта в собственных словах',
      'Применить аналогию «навигатора» для объяснения роли CRM при продаже билетов'
    ],
    key_topics: [
      'Определение нематериального продукта',
      'Билет как право на участие, а не на владение',
      'Сравнение: билет vs физический товар',
      'Особенности потребления — немедленное и невозвратное',
      'CRM как навигатор клиента'
    ],
    difficulty_level: 'beginner',
    estimated_duration_minutes: 5,
    target_audience: 'Менеджеры отдела продаж, работающие с продажей билетов на мероприятия'
  },
  '1.2': {
    id: '1.2',
    language: 'ru',
    title: 'Ценообразование на билеты: как работают скидки и тарифы',
    description: 'Урок о принципах ценообразования и использовании скидок для увеличения продаж',
    section_title: 'Основы продаж билетов как нематериального продукта',
    learning_objectives: [
      'Применить early-bird скидку в коммуникации с клиентом',
      'Рассчитать разницу между базовым и VIP-тарифом для конкретного мероприятия',
      'Объяснить клиенту выгоду скидки с акцентом на ограниченности'
    ],
    key_topics: [
      'Эффект дефицита через early-bird',
      'VIP-тарифы и дополнительные опции',
      'Групповые скидки: условия и ограничения',
      'Календарь цен: когда и как менять',
      'Объяснение цены через ценность, а не стоимость'
    ],
    difficulty_level: 'beginner',
    estimated_duration_minutes: 5,
    target_audience: 'Менеджеры отдела продаж, работающие с продажей билетов на мероприятия'
  },
  '1.1-en': {
    id: '1.1-en',
    language: 'en',
    title: 'What is an Intangible Product: Ticket as a Product',
    description: 'Lesson about understanding tickets as intangible products and their sales specifics',
    section_title: 'Fundamentals of Selling Tickets as Intangible Products',
    learning_objectives: [
      'Identify five key differences between tickets and physical products',
      'Describe three key characteristics of intangible products in your own words',
      'Apply the "navigator" analogy to explain the role of CRM in ticket sales'
    ],
    key_topics: [
      'Definition of intangible products',
      'Ticket as a right to participate, not ownership',
      'Comparison: ticket vs physical product',
      'Consumption characteristics — immediate and non-refundable',
      'CRM as a customer navigator'
    ],
    difficulty_level: 'beginner',
    estimated_duration_minutes: 5,
    target_audience: 'Sales managers working with event ticket sales'
  },
  '1.2-en': {
    id: '1.2-en',
    language: 'en',
    title: 'Ticket Pricing: How Discounts and Tiers Work',
    description: 'Lesson about pricing principles and using discounts to increase sales',
    section_title: 'Fundamentals of Selling Tickets as Intangible Products',
    learning_objectives: [
      'Apply early-bird discounts in customer communication',
      'Calculate the difference between basic and VIP tiers for a specific event',
      'Explain discount benefits to customers with emphasis on scarcity'
    ],
    key_topics: [
      'Scarcity effect through early-bird pricing',
      'VIP tiers and additional options',
      'Group discounts: conditions and limitations',
      'Price calendar: when and how to adjust',
      'Explaining price through value, not cost'
    ],
    difficulty_level: 'beginner',
    estimated_duration_minutes: 5,
    target_audience: 'Sales managers working with event ticket sales'
  }
};

const ALL_LESSONS = ['1.1', '1.2', '1.1-en', '1.2-en'];

function buildLessonPrompt(lesson) {
  const languageName = lesson.language === 'ru' ? 'Russian' : 'English';

  return `You are an expert educational content creator. Generate comprehensive lesson content for an online course.

## Lesson Specification

**Title**: ${lesson.title}
**Section**: ${lesson.section_title}
**Language**: ${languageName} (ALL content must be in ${languageName})
**Difficulty**: ${lesson.difficulty_level}
**Duration**: ${lesson.estimated_duration_minutes} minutes
**Target Audience**: ${lesson.target_audience}

## Learning Objectives
${lesson.learning_objectives.map((obj, i) => `${i + 1}. ${obj}`).join('\n')}

## Key Topics to Cover
${lesson.key_topics.map((topic, i) => `- ${topic}`).join('\n')}

## Output Requirements

Return JSON with: title, intro, sections (THEORY ONLY - no examples here), examples (2-3 PRACTICAL SCENARIOS - required), exercises, summary

\`\`\`json
{
  "title": "Lesson title",
  "intro": "Engaging introduction (100-150 words)",
  "sections": [
    {
      "title": "Section heading",
      "content": "THEORY ONLY: concepts, explanations, frameworks (200-400 words). DO NOT put examples here!"
    }
  ],
  "examples": [
    {
      "title": "Practical scenario title",
      "content": "Real-world example, dialogue, or case study"
    }
  ],
  "exercises": [
    {
      "question": "Practice question or task",
      "hints": ["Hint 1", "Hint 2"]
    }
  ],
  "summary": ["Key takeaway 1", "Key takeaway 2", "Key takeaway 3"]
}
\`\`\`

## Quality Guidelines

1. **Depth**: Provide substantive content, not superficial overviews
2. **Practical Focus**: Include real-world examples in the "examples" array
3. **Clear Structure**: sections = theory, examples = practical application
4. **Engaging Tone**: Write in a professional but conversational style
5. **Completeness**: Cover ALL learning objectives and key topics
6. **Language**: Write ONLY in ${languageName}

Generate 3-5 sections (theory). Put ALL practical scenarios in the "examples" array (minimum 2).

CRITICAL: Return ONLY valid JSON. No markdown code blocks. Use only standard ASCII quotes (\\") in JSON strings.`;
}

function cleanJsonResponse(text) {
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  cleaned = cleaned.trim();
  cleaned = cleaned.replace(/[""]/g, '"');
  cleaned = cleaned.replace(/['']/g, "'");
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

async function callOpenRouter(model, prompt) {
  const response = await fetch(OPENROUTER_BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://megacampus.ai',
      'X-Title': 'MegaCampus Lesson Quality Testing'
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 8000
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    usage: data.usage || {}
  };
}

function evaluateContentQuality(content, lesson) {
  const metrics = {
    hasIntro: false,
    hasSections: false,
    hasExamples: false,
    hasExercises: false,
    hasSummary: false,
    sectionsCount: 0,
    examplesCount: 0,
    exercisesCount: 0,
    totalWordCount: 0,
    introWordCount: 0,
    coversObjectives: 0,
    coversTopics: 0,
    qualityScore: 0
  };

  if (!content) return metrics;

  metrics.hasIntro = !!content.intro && content.intro.length > 50;
  metrics.hasSections = Array.isArray(content.sections) && content.sections.length > 0;
  metrics.hasExamples = Array.isArray(content.examples) && content.examples.length > 0;
  metrics.hasExercises = Array.isArray(content.exercises) && content.exercises.length > 0;
  metrics.hasSummary = !!content.summary;

  metrics.sectionsCount = content.sections?.length || 0;
  metrics.examplesCount = content.examples?.length || 0;
  metrics.exercisesCount = content.exercises?.length || 0;

  if (content.intro) {
    metrics.introWordCount = content.intro.split(/\s+/).length;
  }

  let totalText = content.intro || '';
  if (content.sections) {
    content.sections.forEach(s => {
      totalText += ' ' + (s.content || '');
    });
  }
  metrics.totalWordCount = totalText.split(/\s+/).length;

  const fullText = JSON.stringify(content).toLowerCase();
  lesson.learning_objectives.forEach(obj => {
    const keywords = obj.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const covered = keywords.some(kw => fullText.includes(kw));
    if (covered) metrics.coversObjectives++;
  });

  lesson.key_topics.forEach(topic => {
    const keywords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const covered = keywords.some(kw => fullText.includes(kw));
    if (covered) metrics.coversTopics++;
  });

  let score = 0;
  score += metrics.hasIntro ? 10 : 0;
  score += metrics.hasSections ? 15 : 0;
  score += metrics.hasExamples ? 10 : 0;
  score += metrics.hasExercises ? 10 : 0;
  score += metrics.hasSummary ? 5 : 0;
  score += Math.min(metrics.sectionsCount, 5) * 4;
  score += Math.min(metrics.examplesCount, 3) * 5;
  score += Math.min(metrics.exercisesCount, 3) * 5;
  score += (metrics.coversObjectives / lesson.learning_objectives.length) * 10;
  score += (metrics.coversTopics / lesson.key_topics.length) * 10;

  if (metrics.totalWordCount > 500) score += 5;
  if (metrics.totalWordCount > 1000) score += 5;

  metrics.qualityScore = Math.min(Math.round(score), 100);

  return metrics;
}

async function runSingleTest(lessonId) {
  const lesson = LESSONS[lessonId];
  const startTime = Date.now();

  try {
    console.log(`  [${MODEL.slug}] ${lessonId} (${lesson.language}) - Starting...`);

    const prompt = buildLessonPrompt(lesson);
    const { content, usage } = await callOpenRouter(MODEL.apiName, prompt);
    const duration = Date.now() - startTime;

    const cleaned = cleanJsonResponse(content);

    let parsed;
    let parseError = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      parseError = e.message;
      parsed = null;
    }

    const quality = parsed ? evaluateContentQuality(parsed, lesson) : null;

    const modelDir = join(OUTPUT_DIR, MODEL.slug);
    if (!existsSync(modelDir)) {
      mkdirSync(modelDir, { recursive: true });
    }

    const outputFile = join(modelDir, `lesson-${lesson.id}.json`);
    const rawFile = join(modelDir, `lesson-${lesson.id}.raw`);
    const metricsFile = join(modelDir, `lesson-${lesson.id}-metrics.json`);

    writeFileSync(rawFile, content, 'utf-8');

    if (parsed) {
      writeFileSync(outputFile, JSON.stringify(parsed, null, 2), 'utf-8');
    } else {
      writeFileSync(outputFile, JSON.stringify({
        error: 'JSON parse error',
        parseError,
        rawContent: cleaned.substring(0, 1000) + '...'
      }, null, 2), 'utf-8');
    }

    const metrics = {
      model: MODEL.name,
      modelSlug: MODEL.slug,
      modelApiName: MODEL.apiName,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      language: lesson.language,
      duration,
      timestamp: new Date().toISOString(),
      parseSuccess: parsed !== null,
      parseError,
      usage,
      quality
    };
    writeFileSync(metricsFile, JSON.stringify(metrics, null, 2), 'utf-8');

    const status = parsed
      ? `Score: ${quality?.qualityScore || 0}/100`
      : 'JSON parse error';
    console.log(`  [${MODEL.slug}] ${lessonId} - ${status} (${(duration / 1000).toFixed(1)}s)`);

    return metrics;

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error.message || String(error);

    console.log(`  [${MODEL.slug}] ${lessonId} - Error: ${errorMsg.substring(0, 80)}`);

    const modelDir = join(OUTPUT_DIR, MODEL.slug);
    if (!existsSync(modelDir)) {
      mkdirSync(modelDir, { recursive: true });
    }

    const errorFile = join(modelDir, `lesson-${lessonId}-ERROR.json`);
    const errorData = {
      model: MODEL.name,
      modelSlug: MODEL.slug,
      lessonId: lessonId,
      error: errorMsg,
      duration,
      timestamp: new Date().toISOString()
    };
    writeFileSync(errorFile, JSON.stringify(errorData, null, 2), 'utf-8');

    return errorData;
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('');
  console.log('     XIAOMI MIMO V2 FLASH TEST (xiaomi/mimo-v2-flash:free)');
  console.log('');
  console.log('='.repeat(70));
  console.log('');

  console.log(`Model: ${MODEL.name}`);
  console.log(`API: ${MODEL.apiName}`);
  console.log(`Tests: ${ALL_LESSONS.length}`);
  console.log('');

  const startTime = Date.now();

  console.log('Running all 4 tests in PARALLEL...\n');
  const results = await Promise.all(
    ALL_LESSONS.map(lessonId => runSingleTest(lessonId))
  );

  const duration = Date.now() - startTime;

  console.log('');
  console.log('='.repeat(70));
  console.log('');
  console.log('                    TESTS COMPLETE');
  console.log('');
  console.log('='.repeat(70));
  console.log('');

  const successful = results.filter(r => r.parseSuccess);
  const avgScore = successful.length > 0
    ? successful.reduce((sum, r) => sum + (r.quality?.qualityScore || 0), 0) / successful.length
    : 0;

  console.log(`Duration: ${(duration / 1000).toFixed(1)}s`);
  console.log(`Successful: ${successful.length}/${results.length}`);
  console.log(`Average Score: ${avgScore.toFixed(1)}/100`);
  console.log('');

  results.forEach(r => {
    const status = r.parseSuccess
      ? `Score: ${r.quality?.qualityScore || 0}/100`
      : `Error: ${r.error?.substring(0, 50) || 'parse error'}`;
    console.log(`  [${r.lessonId}] ${status}`);
  });

  console.log('');
  console.log(`Results saved to: ${OUTPUT_DIR}/${MODEL.slug}/`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
