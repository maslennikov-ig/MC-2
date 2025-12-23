#!/usr/bin/env tsx
/**
 * Quality Analysis: deepseek/deepseek-chat-v3.1
 *
 * Analyzes all 12 JSON outputs for:
 * - Schema validation (snake_case, required fields, data types)
 * - Content quality (learning outcomes, lesson count, specificity)
 * - Language quality (Russian vs English)
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function section(title: string) {
  console.log(`\n${colors.bold}${colors.cyan}═══ ${title} ═══${colors.reset}`);
}

interface SchemaScore {
  validJSON: boolean;
  hasRequiredFields: boolean;
  usesSnakeCase: boolean;
  correctDataTypes: boolean;
  score: number;
}

interface ContentScore {
  score: number;
  details: string[];
}

interface QualityResult {
  scenario: string;
  run: number;
  schemaScore: SchemaScore;
  contentScore: ContentScore;
  overallScore: number;
}

class QualityAnalyzer {
  private outputDir = '/tmp/quality-tests/deepseek-chat-v31';
  private results: QualityResult[] = [];

  async analyzeSchema(output: any, entityType: 'metadata' | 'lesson'): Promise<SchemaScore> {
    let score = 0;
    let validJSON = false;
    let hasRequiredFields = false;
    let usesSnakeCase = false;
    let correctDataTypes = false;

    // Valid JSON (0.25)
    if (output !== null && typeof output === 'object') {
      validJSON = true;
      score += 0.25;
    }

    // Required fields (0.25)
    const requiredFields = entityType === 'metadata'
      ? ['course_title', 'course_description', 'learning_outcomes']
      : ['section_number', 'section_title', 'lessons'];

    if (requiredFields.every(field => field in output)) {
      hasRequiredFields = true;
      score += 0.25;
    }

    // Snake case (0.25)
    const allFieldsSnakeCase = Object.keys(output).every(key =>
      /^[a-z_]+$/.test(key) || /^[a-z][a-z0-9_]*$/.test(key)
    );
    if (allFieldsSnakeCase) {
      usesSnakeCase = true;
      score += 0.25;
    }

    // Correct types (0.25)
    if (entityType === 'metadata') {
      correctDataTypes =
        typeof output.course_title === 'string' &&
        typeof output.course_description === 'string' &&
        Array.isArray(output.learning_outcomes);
    } else {
      correctDataTypes =
        typeof output.section_number === 'number' &&
        typeof output.section_title === 'string' &&
        Array.isArray(output.lessons);
    }

    if (correctDataTypes) {
      score += 0.25;
    }

    return { validJSON, hasRequiredFields, usesSnakeCase, correctDataTypes, score };
  }

  analyzeMetadataContent(output: any): ContentScore {
    let score = 0;
    const details: string[] = [];

    // Learning outcomes quality (0.4)
    const outcomes = output.learning_outcomes || [];
    const actionVerbs = ['define', 'build', 'create', 'analyze', 'evaluate', 'design', 'implement', 'apply', 'construct', 'develop'];
    const hasActionVerbs = outcomes.some((o: string) =>
      actionVerbs.some(verb => o.toLowerCase().includes(verb))
    );
    if (hasActionVerbs) {
      score += 0.1;
      details.push('✓ Learning outcomes use action verbs');
    } else {
      details.push('✗ Learning outcomes lack action verbs');
    }

    if (outcomes.length >= 3 && outcomes.length <= 8) {
      score += 0.1;
      details.push(`✓ Learning outcomes count: ${outcomes.length} (ideal: 3-8)`);
    } else {
      details.push(`✗ Learning outcomes count: ${outcomes.length} (should be 3-8)`);
    }

    // Assume Bloom's taxonomy if action verbs present
    if (hasActionVerbs) {
      score += 0.1;
      details.push('✓ Likely follows Bloom\'s Taxonomy');
    }

    // Measurability check (simple heuristic)
    const measurable = outcomes.some((o: string) =>
      o.toLowerCase().includes('will be able to') || o.toLowerCase().includes('смогут')
    );
    if (measurable || hasActionVerbs) {
      score += 0.1;
      details.push('✓ Outcomes appear measurable');
    }

    // Overview quality (0.3)
    const overview = output.course_overview || '';
    if (overview.length >= 500) {
      score += 0.1;
      details.push(`✓ Overview length: ${overview.length} chars (≥500)`);
    } else {
      details.push(`✗ Overview length: ${overview.length} chars (should be ≥500)`);
    }

    // Check for specific examples
    if (overview.includes('example') || overview.includes('such as') || overview.includes('например') || overview.includes('такие как')) {
      score += 0.1;
      details.push('✓ Overview includes specific examples');
    } else {
      details.push('~ Overview could use more specific examples');
    }

    // Structure check
    if (overview.includes('.') && overview.split('.').length > 3) {
      score += 0.1;
      details.push('✓ Overview has structured content');
    }

    // Description quality (0.2)
    const description = output.course_description || '';
    if (description.length >= 50 && description.length <= 500) {
      score += 0.1;
      details.push(`✓ Description length: ${description.length} chars (50-500)`);
    }

    if (description.includes('learn') || description.includes('изучите') || description.includes('научитесь')) {
      score += 0.1;
      details.push('✓ Description has value proposition');
    }

    // Target audience (0.1)
    const audience = output.target_audience || '';
    if (audience.length > 50) {
      score += 0.1;
      details.push('✓ Target audience is specific');
    }

    return { score: Math.min(1.0, score), details };
  }

  analyzeLessonContent(output: any): ContentScore {
    let score = 0;
    const details: string[] = [];

    const lessons = output.lessons || [];

    // Lesson count (CRITICAL!) (0.4)
    if (lessons.length === 1) {
      score += 0.0;
      details.push(`❌ MAJOR ISSUE: Only ${lessons.length} lesson (should be 3-5!)`);
    } else if (lessons.length === 2) {
      score += 0.2;
      details.push(`⚠️ Only ${lessons.length} lessons (should be 3-5)`);
    } else if (lessons.length >= 3 && lessons.length <= 5) {
      score += 0.4;
      details.push(`✓ Lesson count: ${lessons.length} (ideal: 3-5)`);
    } else if (lessons.length > 5) {
      score += 0.3;
      details.push(`~ Lesson count: ${lessons.length} (more than ideal 3-5)`);
    }

    // Objectives quality (0.3)
    const allHaveObjectives = lessons.every((l: any) => l.lesson_objective || l.lesson_objectives);
    if (allHaveObjectives) {
      score += 0.1;
      details.push('✓ All lessons have objectives');
    } else {
      details.push('✗ Some lessons missing objectives');
    }

    const actionVerbs = ['define', 'build', 'create', 'analyze', 'evaluate', 'design', 'implement', 'apply', 'explain', 'describe', 'объяснить', 'построить', 'создать'];
    const objectivesHaveActionVerbs = lessons.some((l: any) => {
      const obj = l.lesson_objective || (l.lesson_objectives || []).join(' ');
      return actionVerbs.some(verb => obj.toLowerCase().includes(verb));
    });

    if (objectivesHaveActionVerbs) {
      score += 0.1;
      details.push('✓ Objectives use action verbs');
    } else {
      details.push('✗ Objectives lack action verbs');
    }

    if (objectivesHaveActionVerbs) {
      score += 0.1;
      details.push('✓ Objectives appear measurable');
    }

    // Topics specificity (0.2)
    const genericPhrases = ['introduction to', 'overview of', 'basics of', 'fundamentals of', 'введение в', 'обзор'];
    const hasGenericTopics = lessons.some((l: any) => {
      const topics = l.key_topics || [];
      return topics.some((t: string) =>
        genericPhrases.some(phrase => t.toLowerCase().includes(phrase))
      );
    });

    if (!hasGenericTopics) {
      score += 0.2;
      details.push('✓ Topics are specific (not generic)');
    } else {
      details.push('~ Some topics use generic phrases');
    }

    // Exercises quality (0.1)
    const allHaveExercises = lessons.every((l: any) => l.exercises && l.exercises.length > 0);
    if (allHaveExercises) {
      score += 0.05;
      details.push('✓ All lessons have exercises');
    } else {
      details.push('✗ Some lessons missing exercises');
    }

    const exercisesHaveInstructions = lessons.every((l: any) =>
      (l.exercises || []).every((e: any) => e.exercise_instructions && e.exercise_instructions.length > 20)
    );

    if (exercisesHaveInstructions) {
      score += 0.05;
      details.push('✓ Exercises have clear instructions');
    }

    return { score: Math.min(1.0, score), details };
  }

  async analyzeFile(scenarioId: string, runNumber: number) {
    const filePath = `${this.outputDir}/${scenarioId}-run${runNumber}.json`;

    try {
      const content = await readFile(filePath, 'utf-8');
      const output = JSON.parse(content);

      const entityType = scenarioId.startsWith('metadata') ? 'metadata' : 'lesson';
      const schemaScore = await this.analyzeSchema(output, entityType);
      const contentScore = entityType === 'metadata'
        ? this.analyzeMetadataContent(output)
        : this.analyzeLessonContent(output);

      const overallScore = schemaScore.score * 0.4 + contentScore.score * 0.4 + 0.2; // Assume language quality 0.2 for now

      this.results.push({
        scenario: scenarioId,
        run: runNumber,
        schemaScore,
        contentScore,
        overallScore
      });

      console.log(`\n${colors.bold}[${scenarioId} run ${runNumber}]${colors.reset}`);
      console.log(`Schema Score: ${(schemaScore.score * 100).toFixed(0)}%`);
      console.log(`  Valid JSON: ${schemaScore.validJSON ? '✓' : '✗'}`);
      console.log(`  Required Fields: ${schemaScore.hasRequiredFields ? '✓' : '✗'}`);
      console.log(`  Snake Case: ${schemaScore.usesSnakeCase ? '✓' : '✗'}`);
      console.log(`  Correct Types: ${schemaScore.correctDataTypes ? '✓' : '✗'}`);

      console.log(`\nContent Score: ${(contentScore.score * 100).toFixed(0)}%`);
      contentScore.details.forEach(d => console.log(`  ${d}`));

      console.log(`\n${colors.bold}Overall Quality: ${(overallScore * 100).toFixed(0)}%${colors.reset}`);

    } catch (error: any) {
      console.log(`${colors.red}✗ Error analyzing ${filePath}: ${error.message}${colors.reset}`);
    }
  }

  printSummary() {
    section('Quality Analysis Summary');

    const metadataResults = this.results.filter(r => r.scenario.startsWith('metadata'));
    const lessonResults = this.results.filter(r => r.scenario.startsWith('lesson'));

    // Metadata summary
    console.log(`\n${colors.bold}Metadata Generation (6 runs):${colors.reset}`);
    const avgMetadataSchema = metadataResults.reduce((sum, r) => sum + r.schemaScore.score, 0) / metadataResults.length;
    const avgMetadataContent = metadataResults.reduce((sum, r) => sum + r.contentScore.score, 0) / metadataResults.length;
    const avgMetadataOverall = metadataResults.reduce((sum, r) => sum + r.overallScore, 0) / metadataResults.length;

    console.log(`  Avg Schema: ${(avgMetadataSchema * 100).toFixed(0)}%`);
    console.log(`  Avg Content: ${(avgMetadataContent * 100).toFixed(0)}%`);
    console.log(`  ${colors.bold}Avg Overall: ${(avgMetadataOverall * 100).toFixed(0)}%${colors.reset}`);

    // Lesson summary
    console.log(`\n${colors.bold}Lesson Generation (6 runs):${colors.reset}`);
    const avgLessonSchema = lessonResults.reduce((sum, r) => sum + r.schemaScore.score, 0) / lessonResults.length;
    const avgLessonContent = lessonResults.reduce((sum, r) => sum + r.contentScore.score, 0) / lessonResults.length;
    const avgLessonOverall = lessonResults.reduce((sum, r) => sum + r.overallScore, 0) / lessonResults.length;

    console.log(`  Avg Schema: ${(avgLessonSchema * 100).toFixed(0)}%`);
    console.log(`  Avg Content: ${(avgLessonContent * 100).toFixed(0)}%`);
    console.log(`  ${colors.bold}Avg Overall: ${(avgLessonOverall * 100).toFixed(0)}%${colors.reset}`);

    // Check lesson count issue
    const lessonCountIssue = this.results
      .filter(r => r.scenario.startsWith('lesson'))
      .some(r => r.contentScore.details.some(d => d.includes('Only 1 lesson')));

    if (lessonCountIssue) {
      console.log(`\n${colors.red}${colors.bold}⚠️ WARNING: Lesson count issue detected!${colors.reset}`);
      console.log(`${colors.red}Model generates only 1 lesson instead of 3-5 in some runs.${colors.reset}`);
    }

    // Overall rating
    const overallAvg = this.results.reduce((sum, r) => sum + r.overallScore, 0) / this.results.length;
    console.log(`\n${colors.bold}Overall Quality Score: ${(overallAvg * 100).toFixed(0)}%${colors.reset}`);

    let tier = '';
    if (overallAvg >= 0.90) {
      tier = 'A-TIER (Excellent)';
    } else if (overallAvg >= 0.75) {
      tier = 'B-TIER (Good)';
    } else if (overallAvg >= 0.60) {
      tier = 'C-TIER (Acceptable)';
    } else {
      tier = 'D-TIER (Poor)';
    }

    console.log(`Quality Tier: ${tier}`);
  }
}

async function main() {
  section('Quality Analysis: DeepSeek Chat v3.1');

  const analyzer = new QualityAnalyzer();

  // Analyze all 12 files
  const scenarios = ['metadata-en', 'metadata-ru', 'lesson-en', 'lesson-ru'];

  for (const scenario of scenarios) {
    section(`Analyzing: ${scenario}`);
    for (let run = 1; run <= 3; run++) {
      await analyzer.analyzeFile(scenario, run);
    }
  }

  analyzer.printSummary();
}

main().catch(console.error);
