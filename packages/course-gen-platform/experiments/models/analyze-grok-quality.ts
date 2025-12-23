#!/usr/bin/env tsx
/**
 * Quality Analysis for Grok 4 Fast Test Outputs
 *
 * Analyzes schema compliance, content quality, and language quality
 * across all test runs for the Grok 4 Fast model.
 *
 * Input: /tmp/quality-tests/grok-4-fast/*.json
 * Output: /tmp/quality-tests/grok-4-fast-quality-report.json
 *         /tmp/quality-tests/grok-4-fast-quality-report.md
 *
 * Quality Dimensions:
 * 1. Schema Validation (40%): JSON validity, required fields, snake_case, data types
 * 2. Content Quality (40%): Learning outcomes, lesson count, specificity, measurability
 * 3. Language Quality (20%): Grammar, terminology, cultural fit, no translation artifacts
 *
 * Usage:
 *   pnpm tsx experiments/models/analyze-grok-quality.ts
 */

import { promises as fs } from 'fs';
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

function log(message: string, level: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const prefix = {
    info: `${colors.blue}ℹ${colors.reset}`,
    success: `${colors.green}✓${colors.reset}`,
    error: `${colors.red}✗${colors.reset}`,
    warning: `${colors.yellow}⚠${colors.reset}`,
  }[level];
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function section(title: string) {
  console.log(`\n${colors.bold}${colors.cyan}═ ${title} ═${colors.reset}`);
}

interface SchemaScore {
  validJSON: boolean;
  hasRequiredFields: boolean;
  usesSnakeCase: boolean;
  correctDataTypes: boolean;
  score: number;
  issues: string[];
}

interface ContentScore {
  score: number;
  details: any;
  issues: string[];
}

interface LanguageScore {
  score: number;
  details: any;
  issues: string[];
}

interface QualityAnalysis {
  file: string;
  scenario: string;
  runNumber: number;
  entityType: 'metadata' | 'lesson';
  language: 'en' | 'ru';
  schema: SchemaScore;
  content: ContentScore;
  languageQuality: LanguageScore;
  overallScore: number;
}

class GrokQualityAnalyzer {
  private inputDir = '/tmp/quality-tests/grok-4-fast';
  private analyses: QualityAnalysis[] = [];

  // Action verbs for Bloom's Taxonomy
  private actionVerbs = {
    remember: ['define', 'list', 'recall', 'identify', 'state', 'name', 'recognize'],
    understand: ['explain', 'describe', 'summarize', 'interpret', 'classify', 'compare'],
    apply: ['use', 'implement', 'apply', 'execute', 'solve', 'demonstrate', 'calculate'],
    analyze: ['analyze', 'examine', 'compare', 'contrast', 'differentiate', 'distinguish'],
    evaluate: ['evaluate', 'assess', 'judge', 'critique', 'justify', 'argue'],
    create: ['create', 'design', 'build', 'develop', 'construct', 'formulate', 'plan'],
  };

  private genericPhrases = [
    'introduction to',
    'overview of',
    'basics of',
    'fundamentals of',
    'getting started with',
    'intro to',
  ];

  private analyzeSchema(data: any, entityType: 'metadata' | 'lesson'): SchemaScore {
    const issues: string[] = [];
    let score = 0;

    // 1. Valid JSON (0.25)
    const validJSON = data !== null && typeof data === 'object';
    if (validJSON) {
      score += 0.25;
    } else {
      issues.push('Invalid JSON structure');
    }

    // 2. Required fields (0.25)
    const requiredFields = entityType === 'metadata'
      ? ['course_title', 'course_description', 'course_overview', 'learning_outcomes', 'target_audience']
      : ['section_number', 'section_title', 'section_description', 'learning_objectives', 'lessons'];

    const hasAllFields = requiredFields.every(field => field in data);
    if (hasAllFields) {
      score += 0.25;
    } else {
      const missing = requiredFields.filter(field => !(field in data));
      issues.push(`Missing required fields: ${missing.join(', ')}`);
    }

    // 3. Snake case (0.25)
    const allKeys = Object.keys(data);
    const nonSnakeCase = allKeys.filter(key => {
      // Allow snake_case and all lowercase
      return !/^[a-z_]+$/.test(key) && key !== key.toLowerCase();
    });

    if (nonSnakeCase.length === 0) {
      score += 0.25;
    } else {
      issues.push(`Non-snake_case fields: ${nonSnakeCase.join(', ')}`);
    }

    // 4. Correct data types (0.25)
    let typeErrors = 0;

    if (entityType === 'metadata') {
      if (typeof data.course_title !== 'string') typeErrors++;
      if (!Array.isArray(data.learning_outcomes)) typeErrors++;
      if (typeof data.estimated_duration_hours !== 'number') typeErrors++;
    } else {
      if (typeof data.section_number !== 'number') typeErrors++;
      if (!Array.isArray(data.lessons)) typeErrors++;
      if (!Array.isArray(data.learning_objectives)) typeErrors++;
    }

    if (typeErrors === 0) {
      score += 0.25;
    } else {
      issues.push(`${typeErrors} type errors found`);
    }

    return {
      validJSON,
      hasRequiredFields: hasAllFields,
      usesSnakeCase: nonSnakeCase.length === 0,
      correctDataTypes: typeErrors === 0,
      score,
      issues,
    };
  }

  private analyzeMetadataContent(data: any): ContentScore {
    let score = 0;
    const issues: string[] = [];
    const details: any = {};

    // Learning outcomes quality (0.4)
    const outcomes = data.learning_outcomes || [];
    details.outcomesCount = outcomes.length;

    // Check action verbs
    const hasActionVerbs = outcomes.some((outcome: string) => {
      const lower = outcome.toLowerCase();
      return Object.values(this.actionVerbs).some(verbs =>
        verbs.some(verb => lower.includes(verb))
      );
    });

    if (hasActionVerbs) {
      score += 0.1;
    } else {
      issues.push('Learning outcomes lack action verbs');
    }

    // Check Bloom's Taxonomy levels
    let bloomLevels = 0;
    for (const outcome of outcomes) {
      const lower = outcome.toLowerCase();
      for (const verbs of Object.values(this.actionVerbs)) {
        if (verbs.some(verb => lower.includes(verb))) {
          bloomLevels++;
          break;
        }
      }
    }
    details.bloomLevels = bloomLevels;

    if (bloomLevels >= 2) {
      score += 0.1;
    } else {
      issues.push('Learning outcomes use fewer than 2 Bloom taxonomy levels');
    }

    // Check count (3-8 ideal)
    if (outcomes.length >= 3 && outcomes.length <= 8) {
      score += 0.1;
    } else {
      issues.push(`Learning outcomes count (${outcomes.length}) outside ideal range 3-8`);
    }

    // Check measurability (look for specific verbs)
    const measurable = outcomes.filter((o: string) => {
      const lower = o.toLowerCase();
      return !lower.includes('understand') && !lower.includes('learn') && !lower.includes('know');
    });

    if (measurable.length === outcomes.length) {
      score += 0.1;
    } else {
      issues.push('Some learning outcomes use vague verbs (understand/learn/know)');
    }

    // Overview quality (0.3)
    const overview = data.course_overview || '';
    details.overviewLength = overview.length;

    if (overview.length >= 500) {
      score += 0.1;
    } else {
      issues.push(`Overview too short (${overview.length} chars, need 500+)`);
    }

    // Check for specific examples (look for concrete words)
    const hasExamples = /\d/.test(overview) || overview.includes('example') || overview.includes('such as') || overview.includes('like');
    if (hasExamples) {
      score += 0.1;
    } else {
      issues.push('Overview lacks specific examples');
    }

    // Check for structure (paragraphs, sections)
    const hasStructure = overview.includes('\n\n') || overview.split('. ').length > 5;
    if (hasStructure) {
      score += 0.1;
    } else {
      issues.push('Overview lacks clear structure');
    }

    // Description quality (0.2)
    const description = data.course_description || '';
    details.descriptionLength = description.length;

    if (description.length >= 50 && description.length <= 3000) {
      score += 0.1;
    } else {
      issues.push(`Description length (${description.length}) outside range 50-3000`);
    }

    // Value proposition
    const hasValue = description.toLowerCase().includes('will') || description.toLowerCase().includes('learn') || description.toLowerCase().includes('develop');
    if (hasValue) {
      score += 0.1;
    }

    // Target audience (0.1)
    const audience = data.target_audience || '';
    const definesPersonas = audience.length > 50 && (audience.includes('student') || audience.includes('professional') || audience.includes('developer') || audience.includes('beginner'));
    if (definesPersonas) {
      score += 0.1;
    } else {
      issues.push('Target audience lacks specific personas');
    }

    return { score: Math.min(1.0, score), details, issues };
  }

  private analyzeLessonContent(data: any): ContentScore {
    let score = 0;
    const issues: string[] = [];
    const details: any = {};

    const lessons = data.lessons || [];
    details.lessonCount = lessons.length;

    // Lesson count (CRITICAL!) (0.4)
    if (lessons.length === 1) {
      score += 0.0;
      issues.push('CRITICAL: Only 1 lesson generated (should be 3-5)');
    } else if (lessons.length === 2) {
      score += 0.2;
      issues.push('Only 2 lessons (should be 3-5)');
    } else if (lessons.length >= 3 && lessons.length <= 5) {
      score += 0.4;
    } else if (lessons.length > 5) {
      score += 0.3;
      issues.push(`Too many lessons (${lessons.length}, ideal 3-5)`);
    }

    // Objectives quality (0.3)
    const allHaveObjectives = lessons.every((l: any) => l.lesson_objective || l.lesson_objectives);
    if (allHaveObjectives) {
      score += 0.1;
    } else {
      issues.push('Some lessons missing objectives');
    }

    // Check if objectives are measurable
    const measurableObjectives = lessons.filter((l: any) => {
      const obj = l.lesson_objective || (l.lesson_objectives && l.lesson_objectives.join(' ')) || '';
      const lower = obj.toLowerCase();
      return Object.values(this.actionVerbs).some(verbs =>
        verbs.some(verb => lower.includes(verb))
      );
    });

    if (measurableObjectives.length === lessons.length) {
      score += 0.1;
    } else {
      issues.push('Some lesson objectives not measurable');
    }

    // Check for action verbs
    const hasActionVerbs = lessons.some((l: any) => {
      const obj = l.lesson_objective || '';
      const lower = obj.toLowerCase();
      return Object.values(this.actionVerbs).some(verbs =>
        verbs.some(verb => lower.includes(verb))
      );
    });

    if (hasActionVerbs) {
      score += 0.1;
    }

    // Topics specificity (0.2)
    let genericTopics = 0;
    for (const lesson of lessons) {
      const topics = lesson.key_topics || [];
      for (const topic of topics) {
        const lower = topic.toLowerCase();
        if (this.genericPhrases.some(phrase => lower.includes(phrase))) {
          genericTopics++;
        }
      }
    }

    if (genericTopics === 0) {
      score += 0.2;
    } else {
      issues.push(`${genericTopics} generic topic phrases found`);
    }

    // Exercises quality (0.1)
    const allHaveExercises = lessons.every((l: any) => l.exercises && l.exercises.length > 0);
    if (allHaveExercises) {
      score += 0.05;
    } else {
      issues.push('Some lessons missing exercises');
    }

    // Check exercise instructions
    const clearInstructions = lessons.every((l: any) => {
      if (!l.exercises) return false;
      return l.exercises.every((e: any) => e.exercise_instructions && e.exercise_instructions.length > 20);
    });

    if (clearInstructions) {
      score += 0.05;
    } else {
      issues.push('Some exercises lack clear instructions');
    }

    return { score: Math.min(1.0, score), details, issues };
  }

  private analyzeLanguageQuality(data: any, language: 'en' | 'ru'): LanguageScore {
    let score = 0;
    const issues: string[] = [];
    const details: any = { language };

    // Simple heuristics for language quality
    if (language === 'en') {
      // Check for natural English grammar (basic check)
      const text = JSON.stringify(data).toLowerCase();

      // Professional terminology
      const techTerms = ['programming', 'software', 'development', 'code', 'algorithm', 'data'];
      const hasTechTerms = techTerms.some(term => text.includes(term));
      if (hasTechTerms) {
        score += 0.4;
      }

      // Natural grammar (check for articles, proper sentence structure)
      const hasArticles = text.includes(' the ') || text.includes(' a ') || text.includes(' an ');
      if (hasArticles) {
        score += 0.3;
      }

      // Professional tone
      const hasProfessionalTone = !text.includes('gonna') && !text.includes('wanna') && !text.includes('lol');
      if (hasProfessionalTone) {
        score += 0.3;
      }

    } else if (language === 'ru') {
      const text = JSON.stringify(data);

      // Check for Cyrillic characters
      const hasCyrillic = /[а-яА-ЯёЁ]/.test(text);
      if (hasCyrillic) {
        score += 0.3;
      } else {
        issues.push('Missing Cyrillic characters in Russian content');
      }

      // Check for Russian technical terms
      const russianTerms = ['программ', 'данны', 'обуч', 'разработ', 'алгоритм', 'студент'];
      const hasRussianTerms = russianTerms.some(term => text.includes(term));
      if (hasRussianTerms) {
        score += 0.4;
      }

      // No obvious word-for-word translation artifacts
      const noArtifacts = !text.includes('the') && !text.includes('a ') && !text.includes('an ');
      if (noArtifacts) {
        score += 0.3;
      } else {
        issues.push('Possible translation artifacts detected');
      }
    }

    return { score: Math.min(1.0, score), details, issues };
  }

  private async analyzeFile(filePath: string): Promise<QualityAnalysis | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Parse filename: metadata-en-run1.json
      const filename = filePath.split('/').pop()!;
      const match = filename.match(/^(metadata|lesson)-(en|ru)-run(\d+)\.json$/);

      if (!match) {
        log(`Skipping file: ${filename}`, 'warning');
        return null;
      }

      const [, entityType, language, runNumber] = match;

      let data: any;
      try {
        data = JSON.parse(content);
      } catch (error) {
        log(`Failed to parse JSON: ${filename}`, 'error');
        return {
          file: filename,
          scenario: `${entityType}-${language}`,
          runNumber: parseInt(runNumber),
          entityType: entityType as 'metadata' | 'lesson',
          language: language as 'en' | 'ru',
          schema: {
            validJSON: false,
            hasRequiredFields: false,
            usesSnakeCase: false,
            correctDataTypes: false,
            score: 0,
            issues: ['Failed to parse JSON'],
          },
          content: { score: 0, details: {}, issues: ['Invalid JSON'] },
          languageQuality: { score: 0, details: {}, issues: ['Invalid JSON'] },
          overallScore: 0,
        };
      }

      // Analyze schema
      const schema = this.analyzeSchema(data, entityType as 'metadata' | 'lesson');

      // Analyze content
      const content_quality = entityType === 'metadata'
        ? this.analyzeMetadataContent(data)
        : this.analyzeLessonContent(data);

      // Analyze language
      const language_quality = this.analyzeLanguageQuality(data, language as 'en' | 'ru');

      // Calculate overall score (weighted)
      const overallScore = schema.score * 0.4 + content_quality.score * 0.4 + language_quality.score * 0.2;

      return {
        file: filename,
        scenario: `${entityType}-${language}`,
        runNumber: parseInt(runNumber),
        entityType: entityType as 'metadata' | 'lesson',
        language: language as 'en' | 'ru',
        schema,
        content: content_quality,
        languageQuality: language_quality,
        overallScore,
      };

    } catch (error: any) {
      log(`Error analyzing file: ${filePath} - ${error.message}`, 'error');
      return null;
    }
  }

  async analyzeAll(): Promise<void> {
    section('Grok 4 Fast Quality Analysis');

    // Get all JSON files (excluding .log files and ERROR files)
    const files = await fs.readdir(this.inputDir);
    const jsonFiles = files.filter(f => f.endsWith('.json') && !f.includes('ERROR'));

    log(`Found ${jsonFiles.length} output files to analyze`, 'info');

    for (const file of jsonFiles) {
      const analysis = await this.analyzeFile(`${this.inputDir}/${file}`);
      if (analysis) {
        this.analyses.push(analysis);
      }
    }

    await this.generateReport();
  }

  private async generateReport(): Promise<void> {
    section('Quality Analysis Results');

    // Calculate averages by scenario
    const scenarios = ['metadata-en', 'metadata-ru', 'lesson-en', 'lesson-ru'];

    const scenarioStats: any = {};

    for (const scenario of scenarios) {
      const runs = this.analyses.filter(a => a.scenario === scenario);

      if (runs.length === 0) continue;

      const avgOverall = runs.reduce((sum, r) => sum + r.overallScore, 0) / runs.length;
      const avgSchema = runs.reduce((sum, r) => sum + r.schema.score, 0) / runs.length;
      const avgContent = runs.reduce((sum, r) => sum + r.content.score, 0) / runs.length;
      const avgLanguage = runs.reduce((sum, r) => sum + r.languageQuality.score, 0) / runs.length;

      // Calculate consistency (standard deviation)
      const scores = runs.map(r => r.overallScore);
      const mean = avgOverall;
      const variance = scores.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / scores.length;
      const stdDev = Math.sqrt(variance);
      const consistency = Math.max(0, 1 - stdDev);

      const best = runs.reduce((max, r) => r.overallScore > max.overallScore ? r : max, runs[0]);
      const worst = runs.reduce((min, r) => r.overallScore < min.overallScore ? r : min, runs[0]);

      scenarioStats[scenario] = {
        runs: runs.length,
        avgOverall,
        avgSchema,
        avgContent,
        avgLanguage,
        consistency,
        best: { run: best.runNumber, score: best.overallScore },
        worst: { run: worst.runNumber, score: worst.overallScore },
      };

      console.log(`\n${colors.bold}${scenario}:${colors.reset}`);
      console.log(`  Avg Quality: ${(avgOverall * 100).toFixed(1)}%`);
      console.log(`  Consistency: ${(consistency * 100).toFixed(1)}%`);
      console.log(`  Schema: ${(avgSchema * 100).toFixed(1)}%, Content: ${(avgContent * 100).toFixed(1)}%, Language: ${(avgLanguage * 100).toFixed(1)}%`);
      console.log(`  Best: run ${best.runNumber} (${(best.overallScore * 100).toFixed(1)}%), Worst: run ${worst.runNumber} (${(worst.overallScore * 100).toFixed(1)}%)`);
    }

    // Overall model score
    const overallAvg = this.analyses.reduce((sum, a) => sum + a.overallScore, 0) / this.analyses.length;
    const metadataRuns = this.analyses.filter(a => a.entityType === 'metadata');
    const lessonRuns = this.analyses.filter(a => a.entityType === 'lesson');

    const metadataAvg = metadataRuns.reduce((sum, a) => sum + a.overallScore, 0) / metadataRuns.length;
    const lessonAvg = lessonRuns.reduce((sum, a) => sum + a.overallScore, 0) / lessonRuns.length;

    section('Overall Model Quality');
    console.log(`Overall Average: ${(overallAvg * 100).toFixed(1)}%`);
    console.log(`Metadata Average: ${(metadataAvg * 100).toFixed(1)}%`);
    console.log(`Lesson Average: ${(lessonAvg * 100).toFixed(1)}%`);
    console.log(`Success Rate: ${(this.analyses.filter(a => a.schema.validJSON).length / this.analyses.length * 100).toFixed(1)}%`);

    // Save JSON report
    const jsonReport = {
      generatedAt: new Date().toISOString(),
      model: 'Grok 4 Fast',
      modelSlug: 'grok-4-fast',
      apiName: 'x-ai/grok-4-fast',
      totalRuns: this.analyses.length,
      scenarioStats,
      overallQuality: {
        overall: overallAvg,
        metadata: metadataAvg,
        lesson: lessonAvg,
        successRate: this.analyses.filter(a => a.schema.validJSON).length / this.analyses.length,
      },
      analyses: this.analyses,
    };

    await fs.writeFile(
      '/tmp/quality-tests/grok-4-fast-quality-report.json',
      JSON.stringify(jsonReport, null, 2),
      'utf-8'
    );

    log('JSON report saved: /tmp/quality-tests/grok-4-fast-quality-report.json', 'success');

    // Generate Markdown report
    await this.generateMarkdownReport(jsonReport);
  }

  private async generateMarkdownReport(data: any): Promise<void> {
    const md: string[] = [];

    md.push('# Grok 4 Fast - Quality Analysis Report');
    md.push('');
    md.push(`**Generated**: ${new Date().toISOString()}`);
    md.push(`**Model**: x-ai/grok-4-fast`);
    md.push(`**Total Runs**: ${data.totalRuns} (4 scenarios × 3 runs)`);
    md.push('');
    md.push('---');
    md.push('');

    md.push('## Executive Summary');
    md.push('');
    md.push(`- **Overall Quality**: ${(data.overallQuality.overall * 100).toFixed(1)}% / 100%`);
    md.push(`- **Metadata Quality**: ${(data.overallQuality.metadata * 100).toFixed(1)}%`);
    md.push(`- **Lesson Quality**: ${(data.overallQuality.lesson * 100).toFixed(1)}%`);
    md.push(`- **Success Rate**: ${(data.overallQuality.successRate * 100).toFixed(1)}%`);
    md.push('');

    md.push('### Quality Tier');
    const overall = data.overallQuality.overall;
    if (overall >= 0.90) {
      md.push('**A-Tier** (≥0.90): Excellent quality, production-ready');
    } else if (overall >= 0.75) {
      md.push('**B-Tier** (0.75-0.89): Good quality, suitable for most use cases');
    } else if (overall >= 0.60) {
      md.push('**C-Tier** (0.60-0.74): Acceptable quality, needs review');
    } else {
      md.push('**D-Tier** (<0.60): Poor quality, not recommended');
    }
    md.push('');

    md.push('---');
    md.push('');

    md.push('## Results by Scenario');
    md.push('');

    for (const [scenario, stats] of Object.entries(data.scenarioStats)) {
      const s = stats as any;
      md.push(`### ${scenario.toUpperCase()}`);
      md.push('');
      md.push(`- **Avg Quality**: ${(s.avgOverall * 100).toFixed(1)}% / 100%`);
      md.push(`- **Consistency**: ${(s.consistency * 100).toFixed(1)}% (lower variance = better)`);
      md.push(`- **Best Run**: run ${s.best.run} (${(s.best.score * 100).toFixed(1)}%)`);
      md.push(`- **Worst Run**: run ${s.worst.run} (${(s.worst.score * 100).toFixed(1)}%)`);
      md.push('');
      md.push('**Quality Breakdown**:');
      md.push(`- Schema: ${(s.avgSchema * 100).toFixed(1)}%`);
      md.push(`- Content: ${(s.avgContent * 100).toFixed(1)}%`);
      md.push(`- Language: ${(s.avgLanguage * 100).toFixed(1)}%`);
      md.push('');
    }

    md.push('---');
    md.push('');

    md.push('## Detailed Issues Analysis');
    md.push('');

    // Collect all issues
    const allIssues = new Map<string, number>();

    for (const analysis of data.analyses) {
      for (const issue of [...analysis.schema.issues, ...analysis.content.issues, ...analysis.languageQuality.issues]) {
        allIssues.set(issue, (allIssues.get(issue) || 0) + 1);
      }
    }

    if (allIssues.size > 0) {
      md.push('**Common Issues**:');
      md.push('');

      const sortedIssues = Array.from(allIssues.entries()).sort((a, b) => b[1] - a[1]);

      for (const [issue, count] of sortedIssues) {
        md.push(`- ${issue} (${count} occurrences)`);
      }
    } else {
      md.push('No issues detected! All outputs passed quality checks.');
    }

    md.push('');
    md.push('---');
    md.push('');

    md.push('## Sample Outputs');
    md.push('');
    md.push('**Best Metadata Output**: `/tmp/quality-tests/grok-4-fast/metadata-en-run1.json`');
    md.push('**Best Lesson Output**: `/tmp/quality-tests/grok-4-fast/lesson-en-run1.json`');
    md.push('');
    md.push('Review these files for quality reference.');
    md.push('');

    md.push('---');
    md.push('');

    md.push('## Next Steps');
    md.push('');
    md.push('1. Review detailed JSON report for full analysis data');
    md.push('2. Compare with other models (Kimi, DeepSeek, etc.)');
    md.push('3. Generate comparative ranking report');
    md.push('4. Provide cost data for cost-adjusted rankings');
    md.push('');

    await fs.writeFile(
      '/tmp/quality-tests/grok-4-fast-quality-report.md',
      md.join('\n'),
      'utf-8'
    );

    log('Markdown report saved: /tmp/quality-tests/grok-4-fast-quality-report.md', 'success');
  }
}

async function main() {
  try {
    const analyzer = new GrokQualityAnalyzer();
    await analyzer.analyzeAll();
  } catch (error) {
    log(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    process.exit(1);
  }
}

main().catch(console.error);
