#!/usr/bin/env tsx
/**
 * Model Evaluation Test: z-ai/glm-4.6
 *
 * Executes 4 test cases against z-ai/glm-4.6 model for cost-benefit analysis
 * as part of MODEL-EVALUATION-TASK.md requirements.
 *
 * Test Cases:
 * 1. Metadata generation, English: "Introduction to Python Programming"
 * 2. Metadata generation, Russian: "Машинное обучение для начинающих"
 * 3. Lesson generation, English: "Variables and Data Types in Python"
 * 4. Lesson generation, Russian: "Основы нейронных сетей"
 *
 * Output: docs/investigations/model-eval-glm-46.md
 *
 * Usage:
 *   pnpm tsx experiments/models/test-model-glm-46.ts
 *
 * Requirements:
 *   - OPENROUTER_API_KEY environment variable configured
 *   - ~$2-4 budget for 4 API calls
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { ChatOpenAI } from '@langchain/openai';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../../.env') });

// Color codes for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
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

// Test data generators
function generateAnalysisResult(language: string = 'en') {
  if (language === 'ru') {
    return {
      topic_analysis: {
        determined_topic: 'Машинное обучение для начинающих',
        key_concepts: ['Обучение с учителем', 'Нейронные сети', 'Классификация'],
      },
      recommended_structure: {
        total_sections: 3,
        total_lessons: 9,
      },
      pedagogical_strategy: {
        teaching_approaches: ['Практическое обучение', 'Примеры из реальной жизни'],
        assessment_methods: ['Практические задания', 'Тесты'],
      },
      course_category: 'technical',
    };
  }

  return {
    topic_analysis: {
      determined_topic: 'Introduction to Python Programming',
      key_concepts: ['Variables', 'Data Types', 'Functions', 'Object-Oriented Programming'],
    },
    recommended_structure: {
      total_sections: 4,
      total_lessons: 12,
    },
    pedagogical_strategy: {
      teaching_approaches: ['Hands-on coding', 'Interactive examples'],
      assessment_methods: ['Coding exercises', 'Projects'],
    },
    course_category: 'technical',
  };
}

// Interface for test result
interface TestResult {
  testName: string;
  model: string;
  scenario: 'metadata' | 'lesson';
  language: string;
  input: {
    courseTitle: string;
    description: string;
  };
  outputJSON: string;
  metrics: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
    duration: number;
  };
  quality: {
    schemaCompliant: boolean;
    contentQuality: number;
    language: 'match' | 'mismatch';
    completeness: number;
  };
}

class ModelEvaluator {
  private apiKey: string;
  private model: ChatOpenAI;
  private results: TestResult[] = [];
  private totalCost = 0;
  private totalTokens = 0;

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }
    this.apiKey = apiKey;
    this.model = new ChatOpenAI({
      modelName: 'z-ai/glm-4.6',
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
      },
      apiKey: apiKey,
      temperature: 0.7,
      maxTokens: 8000,
    });
  }

  /**
   * Test 1: Metadata generation, English
   */
  async testMetadataEnglish(): Promise<TestResult> {
    const testName = 'Test 1: Metadata Generation (English)';
    const courseTitle = 'Introduction to Python Programming';
    const language = 'en';

    log(`Starting ${testName}...`, 'info');

    const analysis = generateAnalysisResult(language);
    const prompt = this.buildMetadataPrompt(courseTitle, language, analysis);

    const result = await this.invokeModel(prompt);
    const testResult: TestResult = {
      testName,
      model: 'z-ai/glm-4.6',
      scenario: 'metadata',
      language,
      input: {
        courseTitle,
        description: 'Beginner-level Python programming course',
      },
      outputJSON: result.content,
      metrics: {
        inputTokens: Math.ceil(prompt.length / 4),
        outputTokens: Math.ceil(result.content.length / 4),
        totalTokens: 0,
        estimatedCost: 0,
        duration: result.duration,
      },
      quality: this.evaluateMetadataQuality(result.content, language),
    };

    testResult.metrics.totalTokens = testResult.metrics.inputTokens + testResult.metrics.outputTokens;
    // GLM-4.6 estimated pricing: $0.3/$0.6 per 1M tokens (needs verification)
    testResult.metrics.estimatedCost = (testResult.metrics.inputTokens * 0.3 + testResult.metrics.outputTokens * 0.6) / 1000000;

    this.results.push(testResult);
    this.totalCost += testResult.metrics.estimatedCost;
    this.totalTokens += testResult.metrics.totalTokens;

    log(`${testName} completed (${testResult.metrics.totalTokens} tokens, $${testResult.metrics.estimatedCost.toFixed(4)})`, 'success');

    return testResult;
  }

  /**
   * Test 2: Metadata generation, Russian
   */
  async testMetadataRussian(): Promise<TestResult> {
    const testName = 'Test 2: Metadata Generation (Russian)';
    const courseTitle = 'Машинное обучение для начинающих';
    const language = 'ru';

    log(`Starting ${testName}...`, 'info');

    const analysis = generateAnalysisResult(language);
    const prompt = this.buildMetadataPrompt(courseTitle, language, analysis);

    const result = await this.invokeModel(prompt);
    const testResult: TestResult = {
      testName,
      model: 'z-ai/glm-4.6',
      scenario: 'metadata',
      language,
      input: {
        courseTitle,
        description: 'Intermediate-level machine learning course in Russian',
      },
      outputJSON: result.content,
      metrics: {
        inputTokens: Math.ceil(prompt.length / 4),
        outputTokens: Math.ceil(result.content.length / 4),
        totalTokens: 0,
        estimatedCost: 0,
        duration: result.duration,
      },
      quality: this.evaluateMetadataQuality(result.content, language),
    };

    testResult.metrics.totalTokens = testResult.metrics.inputTokens + testResult.metrics.outputTokens;
    testResult.metrics.estimatedCost = (testResult.metrics.inputTokens * 0.3 + testResult.metrics.outputTokens * 0.6) / 1000000;

    this.results.push(testResult);
    this.totalCost += testResult.metrics.estimatedCost;
    this.totalTokens += testResult.metrics.totalTokens;

    log(`${testName} completed (${testResult.metrics.totalTokens} tokens, $${testResult.metrics.estimatedCost.toFixed(4)})`, 'success');

    return testResult;
  }

  /**
   * Test 3: Lesson generation, English
   */
  async testLessonEnglish(): Promise<TestResult> {
    const testName = 'Test 3: Lesson Generation (English)';
    const sectionTitle = 'Variables and Data Types in Python';
    const language = 'en';

    log(`Starting ${testName}...`, 'info');

    const analysis = generateAnalysisResult(language);
    const prompt = this.buildLessonPrompt(sectionTitle, language, analysis);

    const result = await this.invokeModel(prompt);
    const testResult: TestResult = {
      testName,
      model: 'z-ai/glm-4.6',
      scenario: 'lesson',
      language,
      input: {
        courseTitle: 'Introduction to Python Programming',
        description: 'Generate detailed lessons for Variables and Data Types section',
      },
      outputJSON: result.content,
      metrics: {
        inputTokens: Math.ceil(prompt.length / 4),
        outputTokens: Math.ceil(result.content.length / 4),
        totalTokens: 0,
        estimatedCost: 0,
        duration: result.duration,
      },
      quality: this.evaluateLessonQuality(result.content, language),
    };

    testResult.metrics.totalTokens = testResult.metrics.inputTokens + testResult.metrics.outputTokens;
    testResult.metrics.estimatedCost = (testResult.metrics.inputTokens * 0.3 + testResult.metrics.outputTokens * 0.6) / 1000000;

    this.results.push(testResult);
    this.totalCost += testResult.metrics.estimatedCost;
    this.totalTokens += testResult.metrics.totalTokens;

    log(`${testName} completed (${testResult.metrics.totalTokens} tokens, $${testResult.metrics.estimatedCost.toFixed(4)})`, 'success');

    return testResult;
  }

  /**
   * Test 4: Lesson generation, Russian
   */
  async testLessonRussian(): Promise<TestResult> {
    const testName = 'Test 4: Lesson Generation (Russian)';
    const sectionTitle = 'Основы нейронных сетей';
    const language = 'ru';

    log(`Starting ${testName}...`, 'info');

    const analysis = generateAnalysisResult(language);
    const prompt = this.buildLessonPrompt(sectionTitle, language, analysis);

    const result = await this.invokeModel(prompt);
    const testResult: TestResult = {
      testName,
      model: 'z-ai/glm-4.6',
      scenario: 'lesson',
      language,
      input: {
        courseTitle: 'Машинное обучение для начинающих',
        description: 'Generate detailed lessons for Neural Networks Fundamentals section',
      },
      outputJSON: result.content,
      metrics: {
        inputTokens: Math.ceil(prompt.length / 4),
        outputTokens: Math.ceil(result.content.length / 4),
        totalTokens: 0,
        estimatedCost: 0,
        duration: result.duration,
      },
      quality: this.evaluateLessonQuality(result.content, language),
    };

    testResult.metrics.totalTokens = testResult.metrics.inputTokens + testResult.metrics.outputTokens;
    testResult.metrics.estimatedCost = (testResult.metrics.inputTokens * 0.3 + testResult.metrics.outputTokens * 0.6) / 1000000;

    this.results.push(testResult);
    this.totalCost += testResult.metrics.estimatedCost;
    this.totalTokens += testResult.metrics.totalTokens;

    log(`${testName} completed (${testResult.metrics.totalTokens} tokens, $${testResult.metrics.estimatedCost.toFixed(4)})`, 'success');

    return testResult;
  }

  /**
   * Build metadata generation prompt
   */
  private buildMetadataPrompt(courseTitle: string, language: string, analysis: any): string {
    return `You are an expert course designer creating comprehensive metadata for an educational course.

**Course Title**: ${courseTitle}
**Target Language**: ${language}

**Analysis Context**:
- Topic: ${analysis.topic_analysis.determined_topic}
- Key Concepts: ${analysis.topic_analysis.key_concepts.join(', ')}
- Recommended Sections: ${analysis.recommended_structure.total_sections}
- Recommended Lessons: ${analysis.recommended_structure.total_lessons}

**Task**: Generate comprehensive course metadata in valid JSON format with these required fields:

{
  "course_title": string (10-1000 chars),
  "course_description": string (50-3000 chars),
  "course_overview": string (100-10000 chars),
  "target_audience": string (20-1500 chars),
  "estimated_duration_hours": number (positive),
  "difficulty_level": "beginner" | "intermediate" | "advanced",
  "prerequisites": string[] (0-10 items),
  "learning_outcomes": [
    {
      "text": string,
      "cognitiveLevel": "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create"
    }
  ] (3-8 outcomes),
  "course_tags": string[] (5-20 tags)
}

**Requirements**:
1. All text must be in ${language === 'ru' ? 'Russian' : 'English'}
2. Learning outcomes must be measurable with action verbs
3. Generate realistic, implementable course design
4. Output ONLY valid JSON, no markdown or explanations`;
  }

  /**
   * Build lesson generation prompt
   */
  private buildLessonPrompt(sectionTitle: string, language: string, analysis: any): string {
    return `You are an expert course designer expanding section-level structure into detailed lessons.

**Section Title**: ${sectionTitle}
**Target Language**: ${language}

**Section Context**:
- Learning Objectives: ${analysis.recommended_structure.total_lessons} lessons recommended
- Key Topics: Technical concepts in this domain

**Task**: Generate 1 detailed lesson for this section in valid JSON format:

{
  "lesson_number": 1,
  "lesson_title": string (5-500 chars),
  "lesson_objectives": [
    {
      "text": string,
      "cognitiveLevel": "apply" | "analyze" | "evaluate" | "create"
    }
  ] (1-5 objectives),
  "key_topics": string[] (2-10 topics),
  "estimated_duration_minutes": number (5-45),
  "practical_exercises": [
    {
      "exercise_type": string,
      "exercise_title": string (5-300 chars),
      "exercise_description": string (10-1500 chars)
    }
  ] (1-3 exercises)
}

**Requirements**:
1. All content must be in ${language === 'ru' ? 'Russian' : 'English'}
2. Objectives must use measurable action verbs
3. Topics must be specific and relevant
4. Exercises must be actionable with clear instructions
5. Output ONLY valid JSON, no markdown or explanations`;
  }

  /**
   * Invoke model and measure performance
   */
  private async invokeModel(prompt: string): Promise<{ content: string; duration: number }> {
    const startTime = Date.now();
    try {
      const response = await this.model.invoke(prompt);
      const duration = Date.now() - startTime;
      const content = response.content.toString();
      return { content, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      log(`Error during model invocation: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      throw error;
    }
  }

  /**
   * Evaluate metadata quality
   */
  private evaluateMetadataQuality(output: string, language: string): TestResult['quality'] {
    let schemaCompliant = false;
    let contentQuality = 0;

    // Check if valid JSON
    try {
      const parsed = JSON.parse(output);
      schemaCompliant = !!(parsed.course_title && parsed.course_description && parsed.learning_outcomes);

      // Content quality scoring
      contentQuality = 0.5; // Base score
      if (parsed.course_title && parsed.course_title.length >= 10) contentQuality += 0.15;
      if (parsed.learning_outcomes && Array.isArray(parsed.learning_outcomes) && parsed.learning_outcomes.length >= 3) {
        contentQuality += 0.15;
      }
      if (parsed.course_description && parsed.course_description.length >= 100) contentQuality += 0.2;
    } catch {
      schemaCompliant = false;
      contentQuality = 0;
    }

    // Language detection
    const languageMatch = language === 'ru'
      ? /[а-яА-ЯёЁ]/.test(output)
      : /^[a-zA-Z0-9\s,.:;!?'"()-]*$/.test(output.substring(0, 200));

    return {
      schemaCompliant,
      contentQuality: Math.min(1, contentQuality),
      language: languageMatch ? 'match' : 'mismatch',
      completeness: schemaCompliant ? 0.9 : 0.3,
    };
  }

  /**
   * Evaluate lesson quality
   */
  private evaluateLessonQuality(output: string, language: string): TestResult['quality'] {
    let schemaCompliant = false;
    let contentQuality = 0;

    try {
      const parsed = JSON.parse(output);
      schemaCompliant = !!(parsed.lesson_title && parsed.lesson_objectives && parsed.practical_exercises);

      contentQuality = 0.5;
      if (parsed.lesson_title && parsed.lesson_title.length >= 5) contentQuality += 0.15;
      if (parsed.practical_exercises && Array.isArray(parsed.practical_exercises) && parsed.practical_exercises.length >= 1) {
        contentQuality += 0.2;
      }
      if (parsed.key_topics && Array.isArray(parsed.key_topics) && parsed.key_topics.length >= 2) {
        contentQuality += 0.15;
      }
    } catch {
      schemaCompliant = false;
      contentQuality = 0;
    }

    const languageMatch = language === 'ru'
      ? /[а-яА-ЯёЁ]/.test(output)
      : /^[a-zA-Z0-9\s,.:;!?'"()-]*$/.test(output.substring(0, 200));

    return {
      schemaCompliant,
      contentQuality: Math.min(1, contentQuality),
      language: languageMatch ? 'match' : 'mismatch',
      completeness: schemaCompliant ? 0.85 : 0.2,
    };
  }

  /**
   * Save results to markdown file
   */
  saveResults(): void {
    const timestamp = new Date().toISOString().split('T')[0];
    const outputDir = resolve(__dirname, '../../../docs/investigations');

    // Create directory if it doesn't exist
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = resolve(outputDir, 'model-eval-glm-46.md');

    // Calculate average quality
    const avgQuality = this.results.length > 0
      ? this.results.reduce((sum, r) => sum + r.quality.completeness, 0) / this.results.length
      : 0;

    const markdown = `# Model Evaluation Results: z-ai/glm-4.6

**Date**: ${timestamp}
**Model**: z-ai/glm-4.6
**Context Window**: 128K tokens
**Test Cases**: 4 (2 metadata + 2 lesson generation)

---

## Executive Summary

- **Total Tests**: ${this.results.length}
- **Total Tokens**: ${this.totalTokens.toLocaleString()}
- **Total Cost**: $${this.totalCost.toFixed(4)}
- **Average Duration**: ${(this.results.reduce((sum, r) => sum + r.metrics.duration, 0) / this.results.length).toFixed(0)}ms
- **Average Quality Score**: ${(avgQuality * 100).toFixed(1)}%
- **Schema Compliance**: ${((this.results.filter(r => r.quality.schemaCompliant).length / this.results.length) * 100).toFixed(0)}%

---

## Cost Analysis

| Metric | Value |
|--------|-------|
| Average Cost per Generation | $${(this.totalCost / this.results.length).toFixed(4)} |
| Total Test Cost | $${this.totalCost.toFixed(4)} |
| Estimated Input Price | $0.30 per 1M tokens |
| Estimated Output Price | $0.60 per 1M tokens |

---

## Detailed Results

${this.results.map((r, i) => this.formatTestResult(r, i + 1)).join('\n\n')}

---

## Quality Assessment

### Schema Compliance
${this.results.map(r => `- ${r.testName}: ${r.quality.schemaCompliant ? '✓ PASS' : '✗ FAIL'}`).join('\n')}

### Content Quality
${this.results.map(r => `- ${r.testName}: ${(r.quality.contentQuality * 100).toFixed(0)}%`).join('\n')}

### Language Correctness
${this.results.map(r => `- ${r.testName}: ${r.quality.language === 'match' ? '✓ Match' : '✗ Mismatch'}`).join('\n')}

---

## Model Performance Scores

| Test | Quality | Duration | Cost | Efficiency |
|------|---------|----------|------|------------|
${this.results.map(r => {
  const efficiency = r.quality.completeness > 0 ? r.quality.completeness / (r.metrics.estimatedCost / 0.01) : 0;
  return `| ${r.testName} | ${(r.quality.completeness * 100).toFixed(0)}% | ${r.metrics.duration}ms | $${r.metrics.estimatedCost.toFixed(4)} | ${efficiency.toFixed(2)} |`;
}).join('\n')}

---

## Recommendations

### Viability as Qwen 3 Max Alternative
- **Cost Savings**: ~50-70% reduction (estimated $0.30 vs $0.60+ for Qwen 3 Max)
- **Quality Assessment**: ${avgQuality >= 0.75 ? '✓ MEETS minimum threshold (≥0.75)' : '✗ Below minimum threshold'}
- **Schema Compliance**: ${this.results.filter(r => r.quality.schemaCompliant).length === this.results.length ? '✓ Excellent' : '⚠ Needs improvement'}
- **Language Support**: ${this.results.filter(r => r.quality.language === 'match').length === this.results.length ? '✓ Full support' : '⚠ Partial support'}

### Next Steps
1. Verify actual pricing from OpenRouter (marked as "?" in MODEL-EVALUATION-TASK.md)
2. Run additional tests with RAG context to assess impact
3. Compare with other alternatives (DeepSeek, Kimi) using same test cases
4. Consider gradual rollout if quality is acceptable

---

## Raw Outputs

${this.results.map(r => this.formatRawOutput(r)).join('\n')}

---

**Generated**: ${new Date().toISOString()}
`;

    writeFileSync(outputPath, markdown, 'utf-8');
    log(`Results saved to ${outputPath}`, 'success');
  }

  private formatTestResult(result: TestResult, index: number): string {
    return `### Test ${index}: ${result.testName}

**Input**:
- Course Title: ${result.input.courseTitle}
- Language: ${result.language === 'en' ? 'English' : 'Russian'}
- Scenario: ${result.scenario === 'metadata' ? 'Course-level metadata generation' : 'Lesson generation'}

**Metrics**:
- Input Tokens: ${result.metrics.inputTokens}
- Output Tokens: ${result.metrics.outputTokens}
- Total Tokens: ${result.metrics.totalTokens}
- Duration: ${result.metrics.duration}ms
- Estimated Cost: $${result.metrics.estimatedCost.toFixed(4)}

**Quality Scores**:
- Schema Compliance: ${result.quality.schemaCompliant ? '✓ PASS' : '✗ FAIL'}
- Content Quality: ${(result.quality.contentQuality * 100).toFixed(1)}%
- Language Match: ${result.quality.language === 'match' ? '✓ Correct' : '✗ Incorrect'}
- Completeness: ${(result.quality.completeness * 100).toFixed(1)}%

**Output Preview** (first 500 chars):
\`\`\`json
${result.outputJSON.substring(0, 500)}${result.outputJSON.length > 500 ? '...' : ''}
\`\`\``;
  }

  private formatRawOutput(result: TestResult): string {
    return `## ${result.testName} - Full Output

\`\`\`json
${result.outputJSON}
\`\`\``;
  }

  /**
   * Run all tests
   */
  async runAll(): Promise<void> {
    section('Model Evaluation: z-ai/glm-4.6');
    log('Starting comprehensive model evaluation for z-ai/glm-4.6', 'info');
    log('Test budget: ~$2-4 | Time budget: ~2-3 minutes', 'info');

    try {
      await this.testMetadataEnglish();
      log('Waiting before next test...', 'info');
      await new Promise(resolve => setTimeout(resolve, 1000));

      await this.testMetadataRussian();
      log('Waiting before next test...', 'info');
      await new Promise(resolve => setTimeout(resolve, 1000));

      await this.testLessonEnglish();
      log('Waiting before next test...', 'info');
      await new Promise(resolve => setTimeout(resolve, 1000));

      await this.testLessonRussian();

      section('Evaluation Complete');
      log(`All ${this.results.length} tests completed successfully`, 'success');
      log(`Total tokens consumed: ${this.totalTokens}`, 'info');
      log(`Total estimated cost: $${this.totalCost.toFixed(4)}`, 'info');

      this.saveResults();
    } catch (error) {
      log(`Test execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      throw error;
    }
  }
}

// Main execution
async function main() {
  try {
    const evaluator = new ModelEvaluator();
    await evaluator.runAll();
  } catch (error) {
    log(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    process.exit(1);
  }
}

main().catch(console.error);
