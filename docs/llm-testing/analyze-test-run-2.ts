/**
 * Comprehensive analysis script for LLM test run 2
 * Analyzes all models across 4 dimensions:
 * - Metadata generation (EN)
 * - Metadata generation (RU)
 * - Lesson structure generation (EN)
 * - Lesson structure generation (RU)
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

interface TestResult {
  model: string;
  scenario: string;
  run: number;
  success: boolean;
  schemaValid: boolean;
  contentQuality?: {
    score: number;
    schemaCompliance: number;
    contentQuality: number;
    languageQuality: number;
    details: string;
  };
  error?: string;
  rawOutput?: any;
}

interface ModelScores {
  model: string;
  metadataEN: {
    avgScore: number;
    avgSchema: number;
    avgContent: number;
    avgLanguage: number;
    successRate: number;
    runs: number;
  };
  metadataRU: {
    avgScore: number;
    avgSchema: number;
    avgContent: number;
    avgLanguage: number;
    successRate: number;
    runs: number;
  };
  lessonEN: {
    avgScore: number;
    avgSchema: number;
    avgContent: number;
    avgLanguage: number;
    successRate: number;
    runs: number;
  };
  lessonRU: {
    avgScore: number;
    avgSchema: number;
    avgContent: number;
    avgLanguage: number;
    successRate: number;
    runs: number;
  };
  overallScore: number;
}

const TEST_RUN_DIR = '/home/me/code/megacampus2-worktrees/generation-json/docs/llm-testing/test-run-2';
const OUTPUT_DIR = '/home/me/code/megacampus2-worktrees/generation-json/docs/llm-testing';

const MODELS = [
  'kimi-k2-0905',
  'kimi-k2-thinking',
  'deepseek-v32-exp',
  'deepseek-chat-v31',
  'grok-4-fast',
  'glm-46',
  'minimax-m2',
  'qwen3-32b',
  'qwen3-235b-thinking',
  'oss-120b',
  'qwen3-235b-a22b'
];

const MODEL_NAMES: Record<string, string> = {
  'kimi-k2-0905': 'Kimi K2 0905',
  'kimi-k2-thinking': 'Kimi K2 Thinking',
  'deepseek-v32-exp': 'DeepSeek v3.2 Exp',
  'deepseek-chat-v31': 'DeepSeek Chat v3.1',
  'grok-4-fast': 'Grok 4 Fast',
  'glm-46': 'GLM 4.6',
  'minimax-m2': 'MiniMax M2',
  'qwen3-32b': 'Qwen3 32B',
  'qwen3-235b-thinking': 'Qwen3 235B Thinking',
  'oss-120b': 'OSS 120B',
  'qwen3-235b-a22b': 'Qwen3 235B A22B'
};

function analyzeModelResults(modelSlug: string): ModelScores {
  const modelDir = join(TEST_RUN_DIR, modelSlug);

  if (!existsSync(modelDir)) {
    console.warn(`⚠️  Model directory not found: ${modelDir}`);
    return createEmptyScores(modelSlug);
  }

  const files = readdirSync(modelDir).filter(f => f.endsWith('.json'));

  const metadataEN: number[] = [];
  const metadataENSchema: number[] = [];
  const metadataENContent: number[] = [];
  const metadataENLanguage: number[] = [];
  let metadataENSuccess = 0;

  const metadataRU: number[] = [];
  const metadataRUSchema: number[] = [];
  const metadataRUContent: number[] = [];
  const metadataRULanguage: number[] = [];
  let metadataRUSuccess = 0;

  const lessonEN: number[] = [];
  const lessonENSchema: number[] = [];
  const lessonENContent: number[] = [];
  const lessonENLanguage: number[] = [];
  let lessonENSuccess = 0;

  const lessonRU: number[] = [];
  const lessonRUSchema: number[] = [];
  const lessonRUContent: number[] = [];
  const lessonRULanguage: number[] = [];
  let lessonRUSuccess = 0;

  for (const file of files) {
    try {
      const content = readFileSync(join(modelDir, file), 'utf-8');
      const result: TestResult = JSON.parse(content);

      if (!result.success || !result.schemaValid) {
        continue; // Skip failed runs
      }

      const quality = result.contentQuality;
      if (!quality) continue;

      const scenario = result.scenario;

      if (scenario === 'metadata-en') {
        metadataEN.push(quality.score);
        metadataENSchema.push(quality.schemaCompliance);
        metadataENContent.push(quality.contentQuality);
        metadataENLanguage.push(quality.languageQuality);
        metadataENSuccess++;
      } else if (scenario === 'metadata-ru') {
        metadataRU.push(quality.score);
        metadataRUSchema.push(quality.schemaCompliance);
        metadataRUContent.push(quality.contentQuality);
        metadataRULanguage.push(quality.languageQuality);
        metadataRUSuccess++;
      } else if (scenario === 'lesson-en') {
        lessonEN.push(quality.score);
        lessonENSchema.push(quality.schemaCompliance);
        lessonENContent.push(quality.contentQuality);
        lessonENLanguage.push(quality.languageQuality);
        lessonENSuccess++;
      } else if (scenario === 'lesson-ru') {
        lessonRU.push(quality.score);
        lessonRUSchema.push(quality.schemaCompliance);
        lessonRUContent.push(quality.contentQuality);
        lessonRULanguage.push(quality.languageQuality);
        lessonRUSuccess++;
      }
    } catch (err) {
      console.warn(`⚠️  Error reading ${file}:`, err);
    }
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const overallScores = [
    ...metadataEN,
    ...metadataRU,
    ...lessonEN,
    ...lessonRU
  ];

  return {
    model: modelSlug,
    metadataEN: {
      avgScore: avg(metadataEN),
      avgSchema: avg(metadataENSchema),
      avgContent: avg(metadataENContent),
      avgLanguage: avg(metadataENLanguage),
      successRate: metadataENSuccess / 3,
      runs: metadataENSuccess
    },
    metadataRU: {
      avgScore: avg(metadataRU),
      avgSchema: avg(metadataRUSchema),
      avgContent: avg(metadataRUContent),
      avgLanguage: avg(metadataRULanguage),
      successRate: metadataRUSuccess / 3,
      runs: metadataRUSuccess
    },
    lessonEN: {
      avgScore: avg(lessonEN),
      avgSchema: avg(lessonENSchema),
      avgContent: avg(lessonENContent),
      avgLanguage: avg(lessonENLanguage),
      successRate: lessonENSuccess / 3,
      runs: lessonENSuccess
    },
    lessonRU: {
      avgScore: avg(lessonRU),
      avgSchema: avg(lessonRUSchema),
      avgContent: avg(lessonRUContent),
      avgLanguage: avg(lessonRULanguage),
      successRate: lessonRUSuccess / 3,
      runs: lessonRUSuccess
    },
    overallScore: avg(overallScores)
  };
}

function createEmptyScores(modelSlug: string): ModelScores {
  const empty = {
    avgScore: 0,
    avgSchema: 0,
    avgContent: 0,
    avgLanguage: 0,
    successRate: 0,
    runs: 0
  };

  return {
    model: modelSlug,
    metadataEN: { ...empty },
    metadataRU: { ...empty },
    lessonEN: { ...empty },
    lessonRU: { ...empty },
    overallScore: 0
  };
}

function generateRankings(allScores: ModelScores[]) {
  // Filter out models with no successful runs
  const validModels = allScores.filter(s => s.overallScore > 0);

  // TOP-3 for Metadata EN
  const metadataENTop = [...validModels]
    .filter(s => s.metadataEN.runs > 0)
    .sort((a, b) => b.metadataEN.avgScore - a.metadataEN.avgScore)
    .slice(0, 3);

  // TOP-3 for Metadata RU
  const metadataRUTop = [...validModels]
    .filter(s => s.metadataRU.runs > 0)
    .sort((a, b) => b.metadataRU.avgScore - a.metadataRU.avgScore)
    .slice(0, 3);

  // TOP-3 for Lesson EN
  const lessonENTop = [...validModels]
    .filter(s => s.lessonEN.runs > 0)
    .sort((a, b) => b.lessonEN.avgScore - a.lessonEN.avgScore)
    .slice(0, 3);

  // TOP-3 for Lesson RU
  const lessonRUTop = [...validModels]
    .filter(s => s.lessonRU.runs > 0)
    .sort((a, b) => b.lessonRU.avgScore - a.lessonRU.avgScore)
    .slice(0, 3);

  return {
    metadataEN: metadataENTop,
    metadataRU: metadataRUTop,
    lessonEN: lessonENTop,
    lessonRU: lessonRUTop
  };
}

function generateBilingualReport(allScores: ModelScores[], rankings: any) {
  const date = new Date().toISOString().split('T')[0];

  let reportEN = `# LLM Test Run 2 - Comprehensive Quality Analysis\n\n`;
  reportEN += `**Test Date:** ${date}\n`;
  reportEN += `**Test Version:** v2\n`;
  reportEN += `**Models Tested:** ${MODELS.length}\n\n`;
  reportEN += `---\n\n`;

  reportEN += `## Executive Summary\n\n`;
  reportEN += `This report presents a comprehensive quality comparison of 11 LLM models across 4 key dimensions:\n\n`;
  reportEN += `1. **Metadata Generation (English)** - Course-level information quality\n`;
  reportEN += `2. **Metadata Generation (Russian)** - Course-level information quality\n`;
  reportEN += `3. **Lesson Structure Generation (English)** - Section/lesson organization quality\n`;
  reportEN += `4. **Lesson Structure Generation (Russian)** - Section/lesson organization quality\n\n`;
  reportEN += `Each model was tested with 3 runs per scenario (12 total runs per model).\n\n`;

  reportEN += `## Scoring Methodology\n\n`;
  reportEN += `Each generation is scored across three dimensions:\n\n`;
  reportEN += `- **Schema Compliance (0-100%)**: JSON schema validation and required field presence\n`;
  reportEN += `- **Content Quality (0-100%)**: Pedagogical value, depth, clarity, and structure\n`;
  reportEN += `- **Language Quality (0-100%)**: Native fluency, grammar, terminology, and style\n\n`;
  reportEN += `**Overall Score** = Average of all three dimensions\n\n`;

  // TOP-3 Rankings
  reportEN += `## TOP-3 Rankings by Category\n\n`;

  reportEN += `### 1. Metadata Generation (English)\n\n`;
  reportEN += `| Rank | Model | Overall Score | Schema | Content | Language | Success Rate |\n`;
  reportEN += `|------|-------|--------------|--------|---------|----------|-------------|\n`;
  rankings.metadataEN.forEach((m: ModelScores, i: number) => {
    reportEN += `| ${i + 1} | **${MODEL_NAMES[m.model]}** | ${m.metadataEN.avgScore.toFixed(1)}% | ${m.metadataEN.avgSchema.toFixed(1)}% | ${m.metadataEN.avgContent.toFixed(1)}% | ${m.metadataEN.avgLanguage.toFixed(1)}% | ${(m.metadataEN.successRate * 100).toFixed(0)}% |\n`;
  });
  reportEN += `\n`;

  reportEN += `### 2. Metadata Generation (Russian)\n\n`;
  reportEN += `| Rank | Model | Overall Score | Schema | Content | Language | Success Rate |\n`;
  reportEN += `|------|-------|--------------|--------|---------|----------|-------------|\n`;
  rankings.metadataRU.forEach((m: ModelScores, i: number) => {
    reportEN += `| ${i + 1} | **${MODEL_NAMES[m.model]}** | ${m.metadataRU.avgScore.toFixed(1)}% | ${m.metadataRU.avgSchema.toFixed(1)}% | ${m.metadataRU.avgContent.toFixed(1)}% | ${m.metadataRU.avgLanguage.toFixed(1)}% | ${(m.metadataRU.successRate * 100).toFixed(0)}% |\n`;
  });
  reportEN += `\n`;

  reportEN += `### 3. Lesson Structure Generation (English)\n\n`;
  reportEN += `| Rank | Model | Overall Score | Schema | Content | Language | Success Rate |\n`;
  reportEN += `|------|-------|--------------|--------|---------|----------|-------------|\n`;
  rankings.lessonEN.forEach((m: ModelScores, i: number) => {
    reportEN += `| ${i + 1} | **${MODEL_NAMES[m.model]}** | ${m.lessonEN.avgScore.toFixed(1)}% | ${m.lessonEN.avgSchema.toFixed(1)}% | ${m.lessonEN.avgContent.toFixed(1)}% | ${m.lessonEN.avgLanguage.toFixed(1)}% | ${(m.lessonEN.successRate * 100).toFixed(0)}% |\n`;
  });
  reportEN += `\n`;

  reportEN += `### 4. Lesson Structure Generation (Russian)\n\n`;
  reportEN += `| Rank | Model | Overall Score | Schema | Content | Language | Success Rate |\n`;
  reportEN += `|------|-------|--------------|--------|---------|----------|-------------|\n`;
  rankings.lessonRU.forEach((m: ModelScores, i: number) => {
    reportEN += `| ${i + 1} | **${MODEL_NAMES[m.model]}** | ${m.lessonRU.avgScore.toFixed(1)}% | ${m.lessonRU.avgSchema.toFixed(1)}% | ${m.lessonRU.avgContent.toFixed(1)}% | ${m.lessonRU.avgLanguage.toFixed(1)}% | ${(m.lessonRU.successRate * 100).toFixed(0)}% |\n`;
  });
  reportEN += `\n`;

  // Detailed Model Comparison
  reportEN += `## Detailed Model Comparison\n\n`;
  reportEN += `| Model | Metadata EN | Metadata RU | Lesson EN | Lesson RU | Overall |\n`;
  reportEN += `|-------|-------------|-------------|-----------|-----------|--------|\n`;

  const sortedByOverall = [...allScores].sort((a, b) => b.overallScore - a.overallScore);
  sortedByOverall.forEach(m => {
    if (m.overallScore === 0) return; // Skip models with no data
    reportEN += `| **${MODEL_NAMES[m.model]}** | ${m.metadataEN.avgScore.toFixed(1)}% | ${m.metadataRU.avgScore.toFixed(1)}% | ${m.lessonEN.avgScore.toFixed(1)}% | ${m.lessonRU.avgScore.toFixed(1)}% | ${m.overallScore.toFixed(1)}% |\n`;
  });
  reportEN += `\n`;

  // Key Findings
  reportEN += `## Key Findings\n\n`;

  const metadataENWinner = rankings.metadataEN[0];
  const metadataRUWinner = rankings.metadataRU[0];
  const lessonENWinner = rankings.lessonEN[0];
  const lessonRUWinner = rankings.lessonRU[0];

  reportEN += `### Category Winners\n\n`;
  reportEN += `- **Best for Metadata (English):** ${MODEL_NAMES[metadataENWinner.model]} (${metadataENWinner.metadataEN.avgScore.toFixed(1)}%)\n`;
  reportEN += `- **Best for Metadata (Russian):** ${MODEL_NAMES[metadataRUWinner.model]} (${metadataRUWinner.metadataRU.avgScore.toFixed(1)}%)\n`;
  reportEN += `- **Best for Lesson Structure (English):** ${MODEL_NAMES[lessonENWinner.model]} (${lessonENWinner.lessonEN.avgScore.toFixed(1)}%)\n`;
  reportEN += `- **Best for Lesson Structure (Russian):** ${MODEL_NAMES[lessonRUWinner.model]} (${lessonRUWinner.lessonRU.avgScore.toFixed(1)}%)\n\n`;

  // Russian version
  let reportRU = `# LLM Test Run 2 - Комплексный анализ качества\n\n`;
  reportRU += `**Дата теста:** ${date}\n`;
  reportRU += `**Версия теста:** v2\n`;
  reportRU += `**Протестировано моделей:** ${MODELS.length}\n\n`;
  reportRU += `---\n\n`;

  reportRU += `## Краткое резюме\n\n`;
  reportRU += `В данном отчёте представлено комплексное сравнение качества 11 LLM моделей по 4 ключевым измерениям:\n\n`;
  reportRU += `1. **Генерация метаданных (Английский)** - Качество информации на уровне курса\n`;
  reportRU += `2. **Генерация метаданных (Русский)** - Качество информации на уровне курса\n`;
  reportRU += `3. **Генерация структуры урока (Английский)** - Качество организации секций/уроков\n`;
  reportRU += `4. **Генерация структуры урока (Русский)** - Качество организации секций/уроков\n\n`;
  reportRU += `Каждая модель была протестирована 3 раза на каждый сценарий (12 запусков на модель).\n\n`;

  reportRU += `## Методология оценки\n\n`;
  reportRU += `Каждая генерация оценивается по трём измерениям:\n\n`;
  reportRU += `- **Соответствие схеме (0-100%)**: Валидация JSON схемы и наличие обязательных полей\n`;
  reportRU += `- **Качество контента (0-100%)**: Педагогическая ценность, глубина, ясность и структура\n`;
  reportRU += `- **Качество языка (0-100%)**: Естественность, грамматика, терминология и стиль\n\n`;
  reportRU += `**Общий балл** = Среднее значение всех трёх измерений\n\n`;

  // TOP-3 Rankings (Russian)
  reportRU += `## TOP-3 рейтинги по категориям\n\n`;

  reportRU += `### 1. Генерация метаданных (Английский)\n\n`;
  reportRU += `| Место | Модель | Общий балл | Схема | Контент | Язык | Успешность |\n`;
  reportRU += `|-------|--------|-----------|-------|---------|------|------------|\n`;
  rankings.metadataEN.forEach((m: ModelScores, i: number) => {
    reportRU += `| ${i + 1} | **${MODEL_NAMES[m.model]}** | ${m.metadataEN.avgScore.toFixed(1)}% | ${m.metadataEN.avgSchema.toFixed(1)}% | ${m.metadataEN.avgContent.toFixed(1)}% | ${m.metadataEN.avgLanguage.toFixed(1)}% | ${(m.metadataEN.successRate * 100).toFixed(0)}% |\n`;
  });
  reportRU += `\n`;

  reportRU += `### 2. Генерация метаданных (Русский)\n\n`;
  reportRU += `| Место | Модель | Общий балл | Схема | Контент | Язык | Успешность |\n`;
  reportRU += `|-------|--------|-----------|-------|---------|------|------------|\n`;
  rankings.metadataRU.forEach((m: ModelScores, i: number) => {
    reportRU += `| ${i + 1} | **${MODEL_NAMES[m.model]}** | ${m.metadataRU.avgScore.toFixed(1)}% | ${m.metadataRU.avgSchema.toFixed(1)}% | ${m.metadataRU.avgContent.toFixed(1)}% | ${m.metadataRU.avgLanguage.toFixed(1)}% | ${(m.metadataRU.successRate * 100).toFixed(0)}% |\n`;
  });
  reportRU += `\n`;

  reportRU += `### 3. Генерация структуры урока (Английский)\n\n`;
  reportRU += `| Место | Модель | Общий балл | Схема | Контент | Язык | Успешность |\n`;
  reportRU += `|-------|--------|-----------|-------|---------|------|------------|\n`;
  rankings.lessonEN.forEach((m: ModelScores, i: number) => {
    reportRU += `| ${i + 1} | **${MODEL_NAMES[m.model]}** | ${m.lessonEN.avgScore.toFixed(1)}% | ${m.lessonEN.avgSchema.toFixed(1)}% | ${m.lessonEN.avgContent.toFixed(1)}% | ${m.lessonEN.avgLanguage.toFixed(1)}% | ${(m.lessonEN.successRate * 100).toFixed(0)}% |\n`;
  });
  reportRU += `\n`;

  reportRU += `### 4. Генерация структуры урока (Русский)\n\n`;
  reportRU += `| Место | Модель | Общий балл | Схема | Контент | Язык | Успешность |\n`;
  reportRU += `|-------|--------|-----------|-------|---------|------|------------|\n`;
  rankings.lessonRU.forEach((m: ModelScores, i: number) => {
    reportRU += `| ${i + 1} | **${MODEL_NAMES[m.model]}** | ${m.lessonRU.avgScore.toFixed(1)}% | ${m.lessonRU.avgSchema.toFixed(1)}% | ${m.lessonRU.avgContent.toFixed(1)}% | ${m.lessonRU.avgLanguage.toFixed(1)}% | ${(m.lessonRU.successRate * 100).toFixed(0)}% |\n`;
  });
  reportRU += `\n`;

  // Detailed Model Comparison (Russian)
  reportRU += `## Детальное сравнение моделей\n\n`;
  reportRU += `| Модель | Метаданные EN | Метаданные RU | Урок EN | Урок RU | Общий балл |\n`;
  reportRU += `|--------|--------------|--------------|---------|---------|------------|\n`;

  sortedByOverall.forEach(m => {
    if (m.overallScore === 0) return;
    reportRU += `| **${MODEL_NAMES[m.model]}** | ${m.metadataEN.avgScore.toFixed(1)}% | ${m.metadataRU.avgScore.toFixed(1)}% | ${m.lessonEN.avgScore.toFixed(1)}% | ${m.lessonRU.avgScore.toFixed(1)}% | ${m.overallScore.toFixed(1)}% |\n`;
  });
  reportRU += `\n`;

  // Key Findings (Russian)
  reportRU += `## Ключевые выводы\n\n`;

  reportRU += `### Победители по категориям\n\n`;
  reportRU += `- **Лучшая для метаданных (Английский):** ${MODEL_NAMES[metadataENWinner.model]} (${metadataENWinner.metadataEN.avgScore.toFixed(1)}%)\n`;
  reportRU += `- **Лучшая для метаданных (Русский):** ${MODEL_NAMES[metadataRUWinner.model]} (${metadataRUWinner.metadataRU.avgScore.toFixed(1)}%)\n`;
  reportRU += `- **Лучшая для структуры урока (Английский):** ${MODEL_NAMES[lessonENWinner.model]} (${lessonENWinner.lessonEN.avgScore.toFixed(1)}%)\n`;
  reportRU += `- **Лучшая для структуры урока (Русский):** ${MODEL_NAMES[lessonRUWinner.model]} (${lessonRUWinner.lessonRU.avgScore.toFixed(1)}%)\n\n`;

  return { reportEN, reportRU };
}

// Main execution
console.log('🔍 Analyzing test run 2 results...\n');

const allScores: ModelScores[] = [];

for (const model of MODELS) {
  console.log(`📊 Analyzing ${MODEL_NAMES[model]}...`);
  const scores = analyzeModelResults(model);
  allScores.push(scores);
}

console.log('\n✅ Analysis complete. Generating rankings...\n');

const rankings = generateRankings(allScores);

console.log('📝 Generating bilingual reports...\n');

const { reportEN, reportRU } = generateBilingualReport(allScores, rankings);

// Save results
const outputFileEN = join(OUTPUT_DIR, 'TEST-RUN-2-ANALYSIS-EN.md');
const outputFileRU = join(OUTPUT_DIR, 'TEST-RUN-2-ANALYSIS-RU.md');
const outputJSON = join(OUTPUT_DIR, 'test-run-2-analysis.json');

writeFileSync(outputFileEN, reportEN, 'utf-8');
writeFileSync(outputFileRU, reportRU, 'utf-8');
writeFileSync(outputJSON, JSON.stringify({ allScores, rankings }, null, 2), 'utf-8');

console.log(`✅ English report saved: ${outputFileEN}`);
console.log(`✅ Russian report saved: ${outputFileRU}`);
console.log(`✅ JSON data saved: ${outputJSON}`);

console.log('\n📊 TOP-3 Summary:\n');
console.log('Metadata EN:');
rankings.metadataEN.forEach((m: ModelScores, i: number) => {
  console.log(`  ${i + 1}. ${MODEL_NAMES[m.model]}: ${m.metadataEN.avgScore.toFixed(1)}%`);
});

console.log('\nMetadata RU:');
rankings.metadataRU.forEach((m: ModelScores, i: number) => {
  console.log(`  ${i + 1}. ${MODEL_NAMES[m.model]}: ${m.metadataRU.avgScore.toFixed(1)}%`);
});

console.log('\nLesson EN:');
rankings.lessonEN.forEach((m: ModelScores, i: number) => {
  console.log(`  ${i + 1}. ${MODEL_NAMES[m.model]}: ${m.lessonEN.avgScore.toFixed(1)}%`);
});

console.log('\nLesson RU:');
rankings.lessonRU.forEach((m: ModelScores, i: number) => {
  console.log(`  ${i + 1}. ${MODEL_NAMES[m.model]}: ${m.lessonRU.avgScore.toFixed(1)}%`);
});
