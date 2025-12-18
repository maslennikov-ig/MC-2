/**
 * Lesson Content Generation Quality Testing Script
 *
 * Tests lesson content generation quality across multiple LLM models.
 * Based on real course structure from Supabase database.
 *
 * Models tested:
 * - nvidia/nemotron-3-nano-30b-a3b:free
 * - openai/gpt-oss-120b
 * - openai/gpt-oss-20b
 * - qwen/qwen3-235b-a22b-thinking-2507
 * - mistralai/devstral-2512:free
 *
 * Test scenarios:
 * - 2 lessons in Russian (from real course structure)
 * - 2 lessons in English (translated versions)
 *
 * Total: 5 models x 4 lessons = 20 API calls
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OUTPUT_DIR = '/home/me/code/megacampus2/docs/lessons-testing/test-results';

if (!OPENROUTER_API_KEY) {
  console.error('OPENROUTER_API_KEY environment variable is required');
  process.exit(1);
}

// Models to test
const MODELS = [
  { slug: 'nemotron-nano-30b', apiName: 'nvidia/nemotron-3-nano-30b-a3b:free', name: 'Nemotron 3 Nano 30B' },
  { slug: 'gpt-oss-120b', apiName: 'openai/gpt-oss-120b', name: 'GPT OSS 120B' },
  { slug: 'gpt-oss-20b', apiName: 'openai/gpt-oss-20b', name: 'GPT OSS 20B' },
  { slug: 'qwen3-235b-thinking', apiName: 'qwen/qwen3-235b-a22b-thinking-2507', name: 'Qwen3 235B Thinking' },
  { slug: 'devstral-2512', apiName: 'mistralai/devstral-2512:free', name: 'Devstral 2512' },
];

// ============================================================================
// LESSON SPECIFICATIONS (from real Supabase course structure)
// ============================================================================

/**
 * Lesson 1.1 - Russian
 * Source: courses.course_structure -> sections[0].lessons[0]
 */
const LESSON_1_1_RU = {
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
};

/**
 * Lesson 1.2 - Russian
 * Source: courses.course_structure -> sections[0].lessons[1]
 */
const LESSON_1_2_RU = {
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
};

/**
 * Lesson 1.1 - English (translated version)
 */
const LESSON_1_1_EN = {
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
};

/**
 * Lesson 1.2 - English (translated version)
 */
const LESSON_1_2_EN = {
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
};

const LESSONS = [LESSON_1_1_RU, LESSON_1_2_RU, LESSON_1_1_EN, LESSON_1_2_EN];

// ============================================================================
// PROMPT TEMPLATE
// ============================================================================

/**
 * Generate lesson content prompt based on Stage 6 orchestrator format
 */
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

Generate a complete lesson in JSON format with the following structure:

\`\`\`json
{
  "title": "Lesson title",
  "intro": "Engaging introduction paragraph (100-150 words) that hooks the learner and previews the content",
  "sections": [
    {
      "title": "Section heading",
      "content": "Detailed section content in markdown format (200-400 words per section). Include examples, explanations, and practical insights."
    }
  ],
  "examples": [
    {
      "title": "Example title",
      "content": "Example description and context",
      "code": "Optional code snippet if applicable"
    }
  ],
  "exercises": [
    {
      "question": "Practice question or task",
      "hints": ["Hint 1", "Hint 2"]
    }
  ],
  "summary": "Key takeaways from the lesson (3-5 bullet points)"
}
\`\`\`

## Quality Guidelines

1. **Depth**: Provide substantive content, not superficial overviews
2. **Practical Focus**: Include real-world examples and actionable advice
3. **Clear Structure**: Use logical progression from concept to application
4. **Engaging Tone**: Write in a professional but conversational style
5. **Completeness**: Cover ALL learning objectives and key topics
6. **Language**: Write ONLY in ${languageName}

Generate 3-5 main sections covering all key topics. Include at least 2 practical examples and 2 exercises.

CRITICAL: Return ONLY valid JSON. No markdown code blocks around the JSON, no explanations before or after.`;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function cleanJsonResponse(text) {
  // Remove markdown code blocks
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  // Trim whitespace
  cleaned = cleaned.trim();
  // Find first { and last }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

// ============================================================================
// QUALITY METRICS
// ============================================================================

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

  // Check structure
  metrics.hasIntro = !!content.intro && content.intro.length > 50;
  metrics.hasSections = Array.isArray(content.sections) && content.sections.length > 0;
  metrics.hasExamples = Array.isArray(content.examples) && content.examples.length > 0;
  metrics.hasExercises = Array.isArray(content.exercises) && content.exercises.length > 0;
  metrics.hasSummary = !!content.summary;

  // Count elements
  metrics.sectionsCount = content.sections?.length || 0;
  metrics.examplesCount = content.examples?.length || 0;
  metrics.exercisesCount = content.exercises?.length || 0;

  // Word counts
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

  // Check objective coverage (simple heuristic)
  const fullText = JSON.stringify(content).toLowerCase();
  lesson.learning_objectives.forEach(obj => {
    const keywords = obj.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const covered = keywords.some(kw => fullText.includes(kw));
    if (covered) metrics.coversObjectives++;
  });

  // Check topic coverage
  lesson.key_topics.forEach(topic => {
    const keywords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const covered = keywords.some(kw => fullText.includes(kw));
    if (covered) metrics.coversTopics++;
  });

  // Calculate quality score (0-100)
  let score = 0;
  score += metrics.hasIntro ? 10 : 0;
  score += metrics.hasSections ? 15 : 0;
  score += metrics.hasExamples ? 10 : 0;
  score += metrics.hasExercises ? 10 : 0;
  score += metrics.hasSummary ? 5 : 0;
  score += Math.min(metrics.sectionsCount, 5) * 4; // up to 20 points
  score += Math.min(metrics.examplesCount, 3) * 5; // up to 15 points
  score += Math.min(metrics.exercisesCount, 3) * 5; // up to 15 points
  score += (metrics.coversObjectives / lesson.learning_objectives.length) * 10;
  score += (metrics.coversTopics / lesson.key_topics.length) * 10;

  // Bonus for word count
  if (metrics.totalWordCount > 500) score += 5;
  if (metrics.totalWordCount > 1000) score += 5;

  metrics.qualityScore = Math.min(Math.round(score), 100);

  return metrics;
}

// ============================================================================
// TEST RUNNER
// ============================================================================

async function runSingleTest(model, lesson) {
  const startTime = Date.now();
  const testId = `${model.slug}_${lesson.id}`;

  try {
    console.log(`  [${model.slug}] ${lesson.id} (${lesson.language}) - Starting...`);

    const prompt = buildLessonPrompt(lesson);
    const { content, usage } = await callOpenRouter(model.apiName, prompt);
    const duration = Date.now() - startTime;

    const cleaned = cleanJsonResponse(content);

    // Try to parse JSON
    let parsed;
    let parseError = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      parseError = e.message;
      parsed = null;
    }

    // Evaluate quality
    const quality = parsed ? evaluateContentQuality(parsed, lesson) : null;

    // Save result
    const modelDir = join(OUTPUT_DIR, model.slug);
    if (!existsSync(modelDir)) {
      mkdirSync(modelDir, { recursive: true });
    }

    const outputFile = join(modelDir, `lesson-${lesson.id}.json`);
    const rawFile = join(modelDir, `lesson-${lesson.id}.raw`);
    const metricsFile = join(modelDir, `lesson-${lesson.id}-metrics.json`);

    // Save raw response
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

    // Save metrics
    const metrics = {
      model: model.name,
      modelSlug: model.slug,
      modelApiName: model.apiName,
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
    console.log(`  [${model.slug}] ${lesson.id} - ${status} (${(duration / 1000).toFixed(1)}s)`);

    return metrics;

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error.message || String(error);

    console.log(`  [${model.slug}] ${lesson.id} - Error: ${errorMsg.substring(0, 80)}`);

    // Save error
    const modelDir = join(OUTPUT_DIR, model.slug);
    if (!existsSync(modelDir)) {
      mkdirSync(modelDir, { recursive: true });
    }

    const errorFile = join(modelDir, `lesson-${lesson.id}-ERROR.json`);
    const errorData = {
      model: model.name,
      modelSlug: model.slug,
      lessonId: lesson.id,
      error: errorMsg,
      duration,
      timestamp: new Date().toISOString()
    };
    writeFileSync(errorFile, JSON.stringify(errorData, null, 2), 'utf-8');

    return errorData;
  }
}

async function runModelTests(model) {
  console.log(`\nStarting tests for ${model.name}...`);

  // Run all lessons for this model in PARALLEL
  const results = await Promise.all(
    LESSONS.map(lesson => runSingleTest(model, lesson))
  );

  const successCount = results.filter(r => r.parseSuccess).length;
  const avgScore = results
    .filter(r => r.quality?.qualityScore)
    .reduce((sum, r) => sum + r.quality.qualityScore, 0) / Math.max(successCount, 1);

  console.log(`${model.name} completed: ${successCount}/${results.length} success, avg score: ${avgScore.toFixed(1)}\n`);

  return results;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('');
  console.log('        LESSON CONTENT GENERATION QUALITY TEST');
  console.log('');
  console.log('='.repeat(70));
  console.log('');

  console.log('Test Configuration:');
  console.log(`   Models: ${MODELS.length}`);
  MODELS.forEach(m => console.log(`     - ${m.name} (${m.apiName})`));
  console.log(`   Lessons: ${LESSONS.length}`);
  LESSONS.forEach(l => console.log(`     - ${l.id}: ${l.title} (${l.language})`));
  console.log(`   Total API calls: ${MODELS.length * LESSONS.length}`);
  console.log(`   Output directory: ${OUTPUT_DIR}`);
  console.log('');

  // Create output directory
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const overallStartTime = Date.now();

  // Run ALL models in PARALLEL (each model runs its lessons in parallel too)
  console.log('\nRunning all models in PARALLEL...\n');
  const modelResultsArray = await Promise.all(
    MODELS.map(model => runModelTests(model))
  );
  const allResults = modelResultsArray.flat();

  const overallDuration = Date.now() - overallStartTime;

  // Calculate summary statistics
  const successfulTests = allResults.filter(r => r.parseSuccess);
  const qualityScores = successfulTests
    .filter(r => r.quality?.qualityScore)
    .map(r => r.quality.qualityScore);

  const summary = {
    testRunId: `lesson-quality-test-${new Date().toISOString().split('T')[0]}`,
    timestamp: new Date().toISOString(),
    duration: overallDuration,
    durationMinutes: (overallDuration / 1000 / 60).toFixed(2),
    models: MODELS.length,
    lessons: LESSONS.length,
    totalTests: allResults.length,
    successfulTests: successfulTests.length,
    failedTests: allResults.length - successfulTests.length,
    successRate: ((successfulTests.length / allResults.length) * 100).toFixed(1),
    avgQualityScore: qualityScores.length > 0
      ? (qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length).toFixed(1)
      : 0,
    modelSummary: MODELS.map(model => {
      const modelResults = allResults.filter(r => r.modelSlug === model.slug);
      const modelSuccess = modelResults.filter(r => r.parseSuccess);
      const modelScores = modelSuccess
        .filter(r => r.quality?.qualityScore)
        .map(r => r.quality.qualityScore);

      return {
        model: model.name,
        slug: model.slug,
        apiName: model.apiName,
        totalTests: modelResults.length,
        successful: modelSuccess.length,
        failed: modelResults.length - modelSuccess.length,
        avgQualityScore: modelScores.length > 0
          ? (modelScores.reduce((a, b) => a + b, 0) / modelScores.length).toFixed(1)
          : 'N/A',
        scores: {
          ru: modelSuccess.filter(r => r.language === 'ru').map(r => r.quality?.qualityScore || 0),
          en: modelSuccess.filter(r => r.language === 'en').map(r => r.quality?.qualityScore || 0)
        }
      };
    }),
    lessonSummary: LESSONS.map(lesson => {
      const lessonResults = allResults.filter(r => r.lessonId === lesson.id);
      const lessonSuccess = lessonResults.filter(r => r.parseSuccess);
      const lessonScores = lessonSuccess
        .filter(r => r.quality?.qualityScore)
        .map(r => r.quality.qualityScore);

      return {
        lessonId: lesson.id,
        title: lesson.title,
        language: lesson.language,
        totalTests: lessonResults.length,
        successful: lessonSuccess.length,
        avgQualityScore: lessonScores.length > 0
          ? (lessonScores.reduce((a, b) => a + b, 0) / lessonScores.length).toFixed(1)
          : 'N/A'
      };
    }),
    results: allResults
  };

  // Save summary
  const summaryFile = join(OUTPUT_DIR, 'summary.json');
  writeFileSync(summaryFile, JSON.stringify(summary, null, 2), 'utf-8');

  // Print final statistics
  console.log('='.repeat(70));
  console.log('');
  console.log('                    TEST COMPLETE');
  console.log('');
  console.log('='.repeat(70));
  console.log('');

  console.log('Overall Statistics:');
  console.log(`   Total duration: ${summary.durationMinutes} minutes`);
  console.log(`   Total tests: ${summary.totalTests}`);
  console.log(`   Successful: ${summary.successfulTests} (${summary.successRate}%)`);
  console.log(`   Failed: ${summary.failedTests}`);
  console.log(`   Avg quality score: ${summary.avgQualityScore}`);
  console.log('');

  console.log('Results saved to: ' + OUTPUT_DIR);
  console.log('Summary: ' + summaryFile);
  console.log('');

  console.log('Per-Model Summary:');
  console.log('');
  summary.modelSummary.forEach(m => {
    const score = parseFloat(m.avgQualityScore) || 0;
    const icon = score >= 70 ? 'OK' : score >= 50 ? 'WARN' : 'FAIL';
    console.log(`   [${icon}] ${m.model.padEnd(25)} ${m.successful}/${m.totalTests} success, avg: ${m.avgQualityScore}`);
  });

  console.log('');
  console.log('Per-Lesson Summary:');
  console.log('');
  summary.lessonSummary.forEach(l => {
    console.log(`   ${l.lessonId.padEnd(8)} ${l.title.substring(0, 40).padEnd(42)} (${l.language}) avg: ${l.avgQualityScore}`);
  });

  console.log('');
  console.log('All tests completed!');
  console.log('');
}

// Run main
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
