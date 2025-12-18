#!/usr/bin/env tsx
/**
 * Quality Analysis for Kimi K2 0905 Test Results
 * Analyzes schema compliance, content quality, and language quality
 */

import fs from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = '/tmp/quality-tests/kimi-k2-0905';
const MODEL_NAME = 'Kimi K2 0905';

interface QualityScore {
  schemaScore: number;
  contentScore: number;
  languageScore: number;
  overallScore: number;
  details: string[];
  issues: string[];
}

// Schema validation
function validateSchema(data: any, type: 'metadata' | 'lesson'): { score: number; details: string[]; issues: string[] } {
  const details: string[] = [];
  const issues: string[] = [];
  let score = 0;

  // Valid JSON (0.25)
  if (data && typeof data === 'object') {
    score += 0.25;
    details.push('✓ Valid JSON structure');
  } else {
    issues.push('✗ Invalid JSON');
    return { score, details, issues };
  }

  // Check for snake_case vs camelCase
  const allKeys = Object.keys(data);
  const hasSnakeCase = allKeys.every(key => /^[a-z_0-9]+$/.test(key));
  const hasCamelCase = allKeys.some(key => /[A-Z]/.test(key));

  if (hasSnakeCase && !hasCamelCase) {
    score += 0.25;
    details.push('✓ All fields use snake_case');
  } else {
    issues.push('✗ Found camelCase fields: ' + allKeys.filter(k => /[A-Z]/.test(k)).join(', '));
  }

  // Required fields
  if (type === 'metadata') {
    const required = ['course_title', 'course_description', 'learning_outcomes', 'course_overview', 'target_audience'];
    const missing = required.filter(f => !(f in data));
    if (missing.length === 0) {
      score += 0.25;
      details.push('✓ All required metadata fields present');
    } else {
      issues.push('✗ Missing fields: ' + missing.join(', '));
    }
  } else {
    const required = ['section_number', 'section_title', 'lessons'];
    const missing = required.filter(f => !(f in data));
    if (missing.length === 0) {
      score += 0.25;
      details.push('✓ All required lesson fields present');
    } else {
      issues.push('✗ Missing fields: ' + missing.join(', '));
    }
  }

  // Type validation
  let typesCorrect = true;
  if (type === 'metadata') {
    if (!Array.isArray(data.learning_outcomes)) {
      issues.push('✗ learning_outcomes is not an array');
      typesCorrect = false;
    }
  } else {
    if (!Array.isArray(data.lessons)) {
      issues.push('✗ lessons is not an array');
      typesCorrect = false;
    }
  }

  if (typesCorrect) {
    score += 0.25;
    details.push('✓ Correct data types');
  }

  return { score, details, issues };
}

// Content quality analysis
function analyzeMetadataContent(data: any): { score: number; details: string[]; issues: string[] } {
  const details: string[] = [];
  const issues: string[] = [];
  let score = 0;

  // Learning outcomes quality (0.4)
  const outcomes = data.learning_outcomes || [];
  const actionVerbs = ['define', 'build', 'create', 'analyze', 'evaluate', 'design', 'implement', 'apply', 'demonstrate', 'convert'];
  const hasActionVerbs = outcomes.some((o: string) =>
    actionVerbs.some(verb => o.toLowerCase().includes(verb))
  );

  if (hasActionVerbs) {
    score += 0.1;
    details.push('✓ Learning outcomes use action verbs');
  } else {
    issues.push('✗ Learning outcomes lack action verbs');
  }

  if (outcomes.length >= 3 && outcomes.length <= 8) {
    score += 0.1;
    details.push(`✓ Good number of learning outcomes (${outcomes.length})`);
  } else {
    issues.push(`✗ Learning outcomes count: ${outcomes.length} (expected 3-8)`);
  }

  const avgOutcomeLength = outcomes.reduce((sum: number, o: string) => sum + o.length, 0) / outcomes.length;
  if (avgOutcomeLength >= 40) {
    score += 0.1;
    details.push('✓ Learning outcomes are detailed');
  }

  const measurableTerms = ['able to', 'will be able', 'can', 'students will'];
  const isMeasurable = outcomes.some((o: string) =>
    measurableTerms.some(term => o.toLowerCase().includes(term))
  );
  if (isMeasurable) {
    score += 0.1;
    details.push('✓ Learning outcomes are measurable');
  }

  // Overview quality (0.3)
  const overview = data.course_overview || '';
  if (overview.length >= 500) {
    score += 0.15;
    details.push(`✓ Comprehensive course overview (${overview.length} chars)`);
  } else {
    issues.push(`✗ Course overview too short (${overview.length} chars, expected 500+)`);
  }

  if (overview.includes('Module') || overview.includes('Section') || overview.includes('раздел')) {
    score += 0.15;
    details.push('✓ Overview has clear structure');
  }

  // Description quality (0.2)
  const description = data.course_description || '';
  if (description.length >= 50 && description.length <= 500) {
    score += 0.1;
    details.push(`✓ Good description length (${description.length} chars)`);
  }

  if (description.toLowerCase().includes('learn') || description.toLowerCase().includes('course') || description.toLowerCase().includes('курс')) {
    score += 0.1;
    details.push('✓ Description provides value proposition');
  }

  // Target audience (0.1)
  const audience = data.target_audience || '';
  if (audience.length >= 50) {
    score += 0.1;
    details.push('✓ Target audience is well-defined');
  } else {
    issues.push('✗ Target audience too brief');
  }

  return { score, details, issues };
}

function analyzeLessonContent(data: any): { score: number; details: string[]; issues: string[] } {
  const details: string[] = [];
  const issues: string[] = [];
  let score = 0;

  const lessons = data.lessons || [];

  // Lesson count (CRITICAL!) (0.4)
  if (lessons.length === 1) {
    score += 0.0;
    issues.push('✗ CRITICAL: Only 1 lesson (expected 3-5)');
  } else if (lessons.length === 2) {
    score += 0.2;
    issues.push('⚠ Only 2 lessons (expected 3-5)');
  } else if (lessons.length >= 3 && lessons.length <= 5) {
    score += 0.4;
    details.push(`✓ EXCELLENT: ${lessons.length} lessons (ideal range)`);
  } else if (lessons.length > 5) {
    score += 0.3;
    issues.push(`⚠ ${lessons.length} lessons (slightly too many, expected 3-5)`);
  }

  // All lessons have objectives (0.1)
  const allHaveObjectives = lessons.every((l: any) => l.lesson_objective || l.key_topics);
  if (allHaveObjectives) {
    score += 0.1;
    details.push('✓ All lessons have objectives');
  } else {
    issues.push('✗ Some lessons missing objectives');
  }

  // Objectives are measurable (0.1)
  const objectiveTexts = lessons.map((l: any) => l.lesson_objective || '').join(' ');
  if (objectiveTexts.includes('able to') || objectiveTexts.includes('will be able') || objectiveTexts.includes('смогут')) {
    score += 0.1;
    details.push('✓ Objectives are measurable');
  }

  // Action verbs in objectives (0.1)
  const actionVerbs = ['create', 'build', 'implement', 'analyze', 'demonstrate', 'apply', 'построить', 'реализовать', 'вычислять'];
  const hasActionVerbs = actionVerbs.some(verb => objectiveTexts.toLowerCase().includes(verb));
  if (hasActionVerbs) {
    score += 0.1;
    details.push('✓ Objectives use action verbs');
  }

  // Topics are specific (0.2)
  const allTopics = lessons.flatMap((l: any) => l.key_topics || []).join(' ').toLowerCase();
  const genericPhrases = ['introduction to', 'overview of', 'basics of', 'введение в', 'обзор'];
  const hasGeneric = genericPhrases.some(phrase => allTopics.includes(phrase));
  if (!hasGeneric) {
    score += 0.2;
    details.push('✓ Topics are specific (no generic phrases)');
  } else {
    issues.push('✗ Topics contain generic phrases like "Introduction to..."');
  }

  // Exercises present (0.1)
  const allHaveExercises = lessons.every((l: any) => l.exercises && l.exercises.length > 0);
  if (allHaveExercises) {
    score += 0.1;
    details.push('✓ All lessons have exercises');
  } else {
    issues.push('✗ Some lessons missing exercises');
  }

  return { score, details, issues };
}

// Language quality (simplified)
function analyzeLanguageQuality(data: any, language: 'en' | 'ru'): { score: number; details: string[] } {
  const details: string[] = [];
  let score = 0.8; // Default good score (comprehensive analysis would need NLP)

  const allText = JSON.stringify(data).toLowerCase();

  if (language === 'en') {
    // Check for Russian characters (should not be present)
    if (/[а-яё]/i.test(allText)) {
      score -= 0.3;
      details.push('⚠ Contains Russian characters in English content');
    } else {
      details.push('✓ English-only content');
    }
  } else {
    // Check for sufficient Cyrillic
    const cyrillicCount = (allText.match(/[а-яё]/gi) || []).length;
    if (cyrillicCount > 50) {
      details.push('✓ Rich Russian language content');
    } else {
      score -= 0.2;
      details.push('⚠ Limited Russian language usage');
    }
  }

  details.push(`✓ Language quality score: ${score.toFixed(2)}`);
  return { score, details };
}

// Main analysis
async function analyzeFile(filename: string, scenario: string): Promise<QualityScore | null> {
  const filePath = path.join(OUTPUT_DIR, filename);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);

    const type = scenario.startsWith('metadata') ? 'metadata' : 'lesson';
    const language = scenario.endsWith('-en') ? 'en' : 'ru';

    const schemaAnalysis = validateSchema(data, type);
    const contentAnalysis = type === 'metadata'
      ? analyzeMetadataContent(data)
      : analyzeLessonContent(data);
    const languageAnalysis = analyzeLanguageQuality(data, language);

    const overallScore = (
      schemaAnalysis.score * 0.4 +
      contentAnalysis.score * 0.4 +
      languageAnalysis.score * 0.2
    );

    return {
      schemaScore: schemaAnalysis.score,
      contentScore: contentAnalysis.score,
      languageScore: languageAnalysis.score,
      overallScore,
      details: [...schemaAnalysis.details, ...contentAnalysis.details, ...languageAnalysis.details],
      issues: [...schemaAnalysis.issues, ...contentAnalysis.issues]
    };

  } catch (error: any) {
    console.error(`Error analyzing ${filename}: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log(`\n=== Quality Analysis: ${MODEL_NAME} ===\n`);

  const scenarios = ['metadata-en', 'metadata-ru', 'lesson-en', 'lesson-ru'];
  const results: Record<string, QualityScore[]> = {};

  for (const scenario of scenarios) {
    console.log(`\n--- ${scenario.toUpperCase()} ---\n`);
    results[scenario] = [];

    for (let run = 1; run <= 3; run++) {
      const filename = `${scenario}-run${run}.json`;
      console.log(`Analyzing ${filename}...`);

      const analysis = await analyzeFile(filename, scenario);
      if (analysis) {
        results[scenario].push(analysis);

        console.log(`  Overall: ${(analysis.overallScore * 100).toFixed(1)}% (Schema: ${(analysis.schemaScore * 100).toFixed(0)}%, Content: ${(analysis.contentScore * 100).toFixed(0)}%, Language: ${(analysis.languageScore * 100).toFixed(0)}%)`);

        if (analysis.details.length > 0) {
          console.log(`  ${analysis.details.slice(0, 3).join('\n  ')}`);
        }
        if (analysis.issues.length > 0) {
          console.log(`  ${analysis.issues.join('\n  ')}`);
        }
      }
    }

    // Calculate scenario average
    const avg = results[scenario].reduce((sum, r) => sum + r.overallScore, 0) / results[scenario].length;
    const consistency = 1 - Math.sqrt(
      results[scenario].reduce((sum, r) => sum + Math.pow(r.overallScore - avg, 2), 0) / results[scenario].length
    );

    console.log(`\n  Scenario Average: ${(avg * 100).toFixed(1)}%`);
    console.log(`  Consistency: ${(consistency * 100).toFixed(1)}%`);
  }

  // Overall summary
  console.log(`\n\n=== OVERALL SUMMARY ===\n`);

  const metadataScores = [...results['metadata-en'], ...results['metadata-ru']];
  const lessonScores = [...results['lesson-en'], ...results['lesson-ru']];
  const allScores = [...metadataScores, ...lessonScores];

  const metadataAvg = metadataScores.reduce((sum, r) => sum + r.overallScore, 0) / metadataScores.length;
  const lessonAvg = lessonScores.reduce((sum, r) => sum + r.overallScore, 0) / lessonScores.length;
  const overallAvg = allScores.reduce((sum, r) => sum + r.overallScore, 0) / allScores.length;

  console.log(`Metadata Quality: ${(metadataAvg * 100).toFixed(1)}%`);
  console.log(`Lesson Quality: ${(lessonAvg * 100).toFixed(1)}%`);
  console.log(`Overall Quality: ${(overallAvg * 100).toFixed(1)}%`);

  // Determine tier
  let tier = 'D-TIER';
  if (overallAvg >= 0.90) tier = 'S-TIER';
  else if (overallAvg >= 0.75) tier = 'A-TIER';
  else if (overallAvg >= 0.60) tier = 'B-TIER';
  else if (overallAvg >= 0.50) tier = 'C-TIER';

  console.log(`\nModel Tier: ${tier}`);

  // Save analysis report
  const reportPath = path.join(OUTPUT_DIR, 'quality-analysis.json');
  await fs.writeFile(reportPath, JSON.stringify({
    model: MODEL_NAME,
    timestamp: new Date().toISOString(),
    scenarios: results,
    summary: {
      metadataAvg,
      lessonAvg,
      overallAvg,
      tier
    }
  }, null, 2));

  console.log(`\nAnalysis saved to: ${reportPath}`);
}

main().catch(console.error);
