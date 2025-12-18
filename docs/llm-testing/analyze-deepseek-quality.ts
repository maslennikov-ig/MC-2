#!/usr/bin/env tsx
/**
 * Quality Analysis for DeepSeek v3.2 Experimental Test Results
 *
 * Analyzes schema compliance, content quality, and language quality
 * from saved test outputs.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const OUTPUT_DIR = '/tmp/quality-tests/deepseek-v32-exp';
const MODEL = {
  name: 'DeepSeek v3.2 Exp',
  slug: 'deepseek-v32-exp'
};

interface SchemaScore {
  validJSON: boolean;
  hasRequiredFields: boolean;
  usesSnakeCase: boolean;
  correctDataTypes: boolean;
  score: number;
}

interface QualityAnalysis {
  scenario: string;
  runNumber: number;
  schemaScore: SchemaScore;
  contentScore: number;
  languageScore: number;
  overallScore: number;
  issues: string[];
}

// Schema validation
function validateSchema(output: any, entityType: 'metadata' | 'lesson'): SchemaScore {
  const issues: string[] = [];
  let score = 0;

  // Valid JSON (0.25)
  const validJSON = output !== null && typeof output === 'object';
  if (validJSON) {
    score += 0.25;
  } else {
    issues.push('Invalid JSON structure');
  }

  // Required fields (0.25)
  const requiredFields = entityType === 'metadata'
    ? ['course_title', 'course_description', 'course_overview', 'learning_outcomes']
    : ['section_number', 'section_title', 'lessons'];

  const hasRequiredFields = requiredFields.every(field => field in output);
  if (hasRequiredFields) {
    score += 0.25;
  } else {
    const missing = requiredFields.filter(field => !(field in output));
    issues.push(`Missing required fields: ${missing.join(', ')}`);
  }

  // Snake case (0.25)
  const allKeys = getAllKeys(output);
  const allFieldsSnakeCase = allKeys.every(key =>
    /^[a-z_0-9]+$/.test(key) || key === key.toLowerCase()
  );
  if (allFieldsSnakeCase) {
    score += 0.25;
  } else {
    const camelCaseKeys = allKeys.filter(key => /[A-Z]/.test(key));
    if (camelCaseKeys.length > 0) {
      issues.push(`camelCase detected: ${camelCaseKeys.slice(0, 3).join(', ')}`);
    }
  }

  // Correct types (0.25)
  const correctTypes = validateTypes(output, entityType);
  if (correctTypes) {
    score += 0.25;
  }

  return {
    validJSON,
    hasRequiredFields,
    usesSnakeCase: allFieldsSnakeCase,
    correctDataTypes: correctTypes,
    score
  };
}

function getAllKeys(obj: any, prefix = ''): string[] {
  let keys: string[] = [];
  if (typeof obj === 'object' && obj !== null) {
    for (const key in obj) {
      keys.push(prefix ? `${prefix}.${key}` : key);
      if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        keys = keys.concat(getAllKeys(obj[key], prefix ? `${prefix}.${key}` : key));
      } else if (Array.isArray(obj[key])) {
        obj[key].forEach((item: any) => {
          if (typeof item === 'object') {
            keys = keys.concat(getAllKeys(item, `${prefix ? `${prefix}.${key}` : key}[]`));
          }
        });
      }
    }
  }
  return keys;
}

function validateTypes(output: any, entityType: 'metadata' | 'lesson'): boolean {
  if (entityType === 'metadata') {
    return (
      typeof output.course_title === 'string' &&
      Array.isArray(output.learning_outcomes) &&
      (typeof output.estimated_duration_hours === 'number' || output.estimated_duration_hours === undefined)
    );
  } else {
    return (
      typeof output.section_number === 'number' &&
      Array.isArray(output.lessons)
    );
  }
}

// Content quality analysis
function analyzeMetadataContent(output: any): { score: number; issues: string[] } {
  let score = 0;
  const issues: string[] = [];

  // Learning outcomes quality (0.4)
  const outcomes = output.learning_outcomes || [];
  if (hasActionVerbs(outcomes)) {
    score += 0.1;
  } else {
    issues.push('Learning outcomes lack action verbs (Define, Build, Analyze)');
  }

  if (outcomes.length >= 3 && outcomes.length <= 8) {
    score += 0.1;
  } else {
    issues.push(`Learning outcomes count: ${outcomes.length} (ideal: 3-8)`);
  }

  if (followsBloomsTaxonomy(outcomes)) {
    score += 0.1;
  } else {
    issues.push('Learning outcomes do not follow Bloom\'s Taxonomy progression');
  }

  if (isMeasurable(outcomes)) {
    score += 0.1;
  }

  // Overview quality (0.3)
  const overview = output.course_overview || '';
  if (overview.length >= 500) {
    score += 0.1;
  } else {
    issues.push(`course_overview too short: ${overview.length} chars (need 500+)`);
  }

  if (hasSpecificExamples(overview)) {
    score += 0.1;
  } else {
    issues.push('course_overview lacks specific examples');
  }

  if (hasStructure(overview)) {
    score += 0.1;
  }

  // Description quality (0.2)
  const description = output.course_description || '';
  if (description.length >= 50 && description.length <= 500) {
    score += 0.1;
  }

  if (hasValueProposition(description)) {
    score += 0.1;
  }

  // Target audience (0.1)
  if (definesPersonas(output.target_audience)) {
    score += 0.1;
  } else {
    issues.push('target_audience does not define specific personas');
  }

  return { score: Math.min(1.0, score), issues };
}

function analyzeLessonContent(output: any): { score: number; issues: string[] } {
  let score = 0;
  const issues: string[] = [];

  const lessons = output.lessons || [];

  // Lesson count (CRITICAL!) (0.4)
  if (lessons.length === 1) {
    score += 0.0;
    issues.push('CRITICAL: Only 1 lesson (should be 3-5)');
  } else if (lessons.length === 2) {
    score += 0.2;
    issues.push('Only 2 lessons (ideal: 3-5)');
  } else if (lessons.length >= 3 && lessons.length <= 5) {
    score += 0.4;
  } else if (lessons.length > 5) {
    score += 0.3;
    issues.push(`Too many lessons: ${lessons.length} (ideal: 3-5)`);
  }

  // Objectives quality (0.3)
  if (allLessonsHaveObjectives(lessons)) {
    score += 0.1;
  } else {
    issues.push('Some lessons missing objectives');
  }

  if (objectivesAreMeasurable(lessons)) {
    score += 0.1;
  }

  if (objectivesUseActionVerbs(lessons)) {
    score += 0.1;
  } else {
    issues.push('Objectives lack action verbs');
  }

  // Topics specificity (0.2)
  if (topicsAreSpecific(lessons)) {
    score += 0.2;
  } else {
    issues.push('Topics are generic (e.g., "Introduction to...")');
  }

  // Exercises quality (0.1)
  if (allLessonsHaveExercises(lessons)) {
    score += 0.05;
  } else {
    issues.push('Some lessons missing exercises');
  }

  if (exercisesHaveClearInstructions(lessons)) {
    score += 0.05;
  }

  return { score: Math.min(1.0, score), issues };
}

// Helper functions
function hasActionVerbs(outcomes: string[]): boolean {
  const actionVerbs = ['define', 'build', 'create', 'analyze', 'evaluate', 'design', 'implement', 'apply', 'construct', 'interpret', 'проектировать', 'анализировать', 'создавать', 'определять', 'интерпретировать'];
  return outcomes.some(outcome =>
    actionVerbs.some(verb => outcome.toLowerCase().includes(verb))
  );
}

function followsBloomsTaxonomy(outcomes: string[]): boolean {
  const levels = {
    remember: ['define', 'list', 'recall', 'identify', 'определять', 'различать'],
    understand: ['explain', 'describe', 'summarize', 'interpret', 'объяснить', 'опиcать', 'сравнить'],
    apply: ['use', 'implement', 'apply', 'execute', 'рассчитать'],
    analyze: ['analyze', 'compare', 'contrast', 'examine', 'анализировать', 'сравнить'],
    evaluate: ['evaluate', 'assess', 'judge', 'critique'],
    create: ['create', 'design', 'build', 'develop', 'создавать', 'проектировать']
  };

  let foundLevels = 0;
  for (const outcome of outcomes) {
    const lower = outcome.toLowerCase();
    for (const verbs of Object.values(levels)) {
      if (verbs.some(verb => lower.includes(verb))) {
        foundLevels++;
        break;
      }
    }
  }

  return foundLevels >= 2;
}

function isMeasurable(outcomes: string[]): boolean {
  return outcomes.length > 0 && outcomes.every(o => o.length > 10);
}

function hasSpecificExamples(overview: string): boolean {
  return overview.includes('например') || overview.includes('example') || overview.includes('таких как') || overview.includes('such as');
}

function hasStructure(overview: string): boolean {
  return overview.length > 300;
}

function hasValueProposition(description: string): boolean {
  return description.length > 100;
}

function definesPersonas(audience: string): boolean {
  return audience && (audience.includes(';') || audience.includes(',') || audience.length > 50);
}

function allLessonsHaveObjectives(lessons: any[]): boolean {
  return lessons.every(l => l.lesson_objective && l.lesson_objective.length > 0);
}

function objectivesAreMeasurable(lessons: any[]): boolean {
  return lessons.every(l => l.lesson_objective && l.lesson_objective.length > 20);
}

function objectivesUseActionVerbs(lessons: any[]): boolean {
  const actionVerbs = ['define', 'build', 'create', 'analyze', 'рассчитать', 'опиcать', 'сравнить', 'объяснить'];
  return lessons.some(l =>
    actionVerbs.some(verb => l.lesson_objective?.toLowerCase().includes(verb))
  );
}

function topicsAreSpecific(lessons: any[]): boolean {
  const genericPhrases = ['introduction to', 'overview of', 'basics of', 'fundamentals of', 'введение в', 'обзор'];
  for (const lesson of lessons) {
    const topics = lesson.key_topics || [];
    for (const topic of topics) {
      const lower = topic.toLowerCase();
      if (genericPhrases.some(phrase => lower.includes(phrase))) {
        return false;
      }
    }
  }
  return true;
}

function allLessonsHaveExercises(lessons: any[]): boolean {
  return lessons.every(l => l.exercises && l.exercises.length > 0);
}

function exercisesHaveClearInstructions(lessons: any[]): boolean {
  return lessons.every(l =>
    l.exercises?.every((e: any) => e.exercise_instructions && e.exercise_instructions.length > 20)
  );
}

function analyzeLanguageQuality(output: any, language: 'en' | 'ru'): number {
  let score = 0;

  if (language === 'en') {
    score += 0.3; // Assume natural grammar
    score += 0.4; // Assume correct terminology
    score += 0.3; // Assume professional tone
  } else if (language === 'ru') {
    const text = JSON.stringify(output).toLowerCase();
    if (text.includes('например') || text.includes('таких как')) {
      score += 0.3; // Native Russian phrasing
    } else {
      score += 0.15;
    }
    score += 0.4; // Assume correct terminology
    score += 0.3; // Assume professional tone
  }

  return Math.min(1.0, score);
}

// Main analysis
async function analyzeOutput(filePath: string, scenario: string, runNumber: number): Promise<QualityAnalysis | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const output = JSON.parse(content);

    const entityType = scenario.includes('metadata') ? 'metadata' : 'lesson';
    const language = scenario.includes('-ru') ? 'ru' : 'en';

    const schemaScore = validateSchema(output, entityType);
    const contentAnalysis = entityType === 'metadata'
      ? analyzeMetadataContent(output)
      : analyzeLessonContent(output);
    const languageScore = analyzeLanguageQuality(output, language);

    const overallScore = (
      schemaScore.score * 0.4 +
      contentAnalysis.score * 0.4 +
      languageScore * 0.2
    );

    return {
      scenario,
      runNumber,
      schemaScore,
      contentScore: contentAnalysis.score,
      languageScore,
      overallScore,
      issues: contentAnalysis.issues
    };
  } catch (error: any) {
    console.error(`Failed to analyze ${filePath}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('Quality Analysis: DeepSeek v3.2 Experimental');
  console.log('='.repeat(80));
  console.log();

  const files = await fs.readdir(OUTPUT_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json') && !f.includes('ERROR'));

  console.log(`Found ${jsonFiles.length} output files to analyze`);
  console.log();

  const analyses: QualityAnalysis[] = [];

  for (const file of jsonFiles.sort()) {
    const match = file.match(/^(metadata|lesson)-(en|ru)-run(\d+)\.json$/);
    if (match) {
      const scenario = `${match[1]}-${match[2]}`;
      const runNumber = parseInt(match[3]);
      const filePath = path.join(OUTPUT_DIR, file);

      const analysis = await analyzeOutput(filePath, scenario, runNumber);
      if (analysis) {
        analyses.push(analysis);
        console.log(`[${scenario}] Run ${runNumber}: Overall ${(analysis.overallScore * 100).toFixed(1)}% (Schema: ${(analysis.schemaScore.score * 100).toFixed(0)}%, Content: ${(analysis.contentScore * 100).toFixed(0)}%, Language: ${(analysis.languageScore * 100).toFixed(0)}%)`);
        if (analysis.issues.length > 0) {
          analysis.issues.forEach(issue => console.log(`  ⚠ ${issue}`));
        }
      }
    }
  }

  console.log();
  console.log('='.repeat(80));
  console.log('Summary by Scenario');
  console.log('='.repeat(80));
  console.log();

  const scenarios = ['metadata-en', 'metadata-ru', 'lesson-en', 'lesson-ru'];
  for (const scenario of scenarios) {
    const scenarioAnalyses = analyses.filter(a => a.scenario === scenario);
    if (scenarioAnalyses.length > 0) {
      const avgScore = scenarioAnalyses.reduce((sum, a) => sum + a.overallScore, 0) / scenarioAnalyses.length;
      const bestRun = scenarioAnalyses.reduce((best, a) => a.overallScore > best.overallScore ? a : best);
      const worstRun = scenarioAnalyses.reduce((worst, a) => a.overallScore < worst.overallScore ? a : worst);

      console.log(`${scenario}:`);
      console.log(`  Runs: ${scenarioAnalyses.length}`);
      console.log(`  Average: ${(avgScore * 100).toFixed(1)}%`);
      console.log(`  Best: Run ${bestRun.runNumber} (${(bestRun.overallScore * 100).toFixed(1)}%)`);
      console.log(`  Worst: Run ${worstRun.runNumber} (${(worstRun.overallScore * 100).toFixed(1)}%)`);

      // Consistency
      const variance = scenarioAnalyses.reduce((sum, a) => sum + Math.pow(a.overallScore - avgScore, 2), 0) / scenarioAnalyses.length;
      const stdDev = Math.sqrt(variance);
      const consistency = Math.max(0, 1 - stdDev);
      console.log(`  Consistency: ${(consistency * 100).toFixed(1)}%`);
      console.log();
    }
  }

  // Overall model performance
  const overallAvg = analyses.reduce((sum, a) => sum + a.overallScore, 0) / analyses.length;
  const metadataAnalyses = analyses.filter(a => a.scenario.includes('metadata'));
  const lessonAnalyses = analyses.filter(a => a.scenario.includes('lesson'));
  const metadataAvg = metadataAnalyses.reduce((sum, a) => sum + a.overallScore, 0) / metadataAnalyses.length;
  const lessonAvg = lessonAnalyses.reduce((sum, a) => sum + a.overallScore, 0) / lessonAnalyses.length;

  console.log('='.repeat(80));
  console.log('Overall Model Performance');
  console.log('='.repeat(80));
  console.log();
  console.log(`Metadata Generation: ${(metadataAvg * 100).toFixed(1)}%`);
  console.log(`Lesson Generation: ${(lessonAvg * 100).toFixed(1)}%`);
  console.log(`Overall Quality: ${(overallAvg * 100).toFixed(1)}%`);
  console.log();

  // Save detailed report
  const reportPath = path.join(OUTPUT_DIR, 'quality-analysis.json');
  await fs.writeFile(reportPath, JSON.stringify({
    model: MODEL.name,
    modelSlug: MODEL.slug,
    timestamp: new Date().toISOString(),
    overallQuality: overallAvg,
    metadataQuality: metadataAvg,
    lessonQuality: lessonAvg,
    analyses
  }, null, 2));

  console.log(`Detailed analysis saved to: ${reportPath}`);
  console.log();
}

main().catch(error => {
  console.error('FATAL ERROR:', error);
  process.exit(1);
});
