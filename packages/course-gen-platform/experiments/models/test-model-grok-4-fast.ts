#!/usr/bin/env tsx
/**
 * Model Evaluation Test: x-ai/grok-4-fast
 *
 * Complete testing for grok-4-fast (we only have T3 data)
 *
 * Test Cases:
 * 1. Metadata generation, English: "Introduction to Python Programming"
 * 2. Metadata generation, Russian: "Машинное обучение для начинающих"
 * 3. Lesson generation, English: "Variables and Data Types in Python"
 * 4. Lesson generation, Russian: "Основы нейронных сетей"
 *
 * Output: /tmp/grok-4-fast-complete.log
 *
 * Usage:
 *   pnpm tsx experiments/models/test-model-grok-4-fast.ts
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { ChatOpenAI } from '@langchain/openai';

dotenv.config({ path: resolve(__dirname, '../../.env') });

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

interface TestResult {
  testId: string;
  testName: string;
  scenario: 'metadata' | 'lesson';
  language: string;
  status: 'SUCCESS' | 'FAILED';
  duration: number;
  tokens?: {
    input: number;
    output: number;
  };
  cost?: number;
  error?: string;
}

class ModelEvaluator {
  private apiKey: string;
  private results: TestResult[] = [];
  private totalCost = 0;

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }
    this.apiKey = apiKey;
  }

  private async invokeModel(prompt: string, maxRetries = 2): Promise<{ content: string; duration: number; tokens: { input: number; output: number } }> {
    const model = new ChatOpenAI({
      modelName: 'x-ai/grok-4-fast',
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
      },
      apiKey: this.apiKey,
      temperature: 0.7,
      maxTokens: 8000,
    });

    let lastError: any;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const startTime = Date.now();
      try {
        const response = await model.invoke(prompt);
        const duration = Date.now() - startTime;
        const content = response.content.toString();

        // Extract token usage from response
        const usage = (response as any).response_metadata?.tokenUsage || {};
        const tokens = {
          input: usage.promptTokens || Math.ceil(prompt.length / 4),
          output: usage.completionTokens || Math.ceil(content.length / 4),
        };

        return { content, duration, tokens };
      } catch (error) {
        lastError = { error, duration: Date.now() - startTime };
        if (attempt < maxRetries - 1) {
          log(`Retry ${attempt + 1}/${maxRetries - 1} after error...`, 'warning');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    throw lastError;
  }

  private buildMetadataPrompt(courseTitle: string, language: string): string {
    return `You are an expert course designer creating comprehensive metadata for an educational course.

**Course Title**: ${courseTitle}
**Target Language**: ${language}

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

  private buildLessonPrompt(sectionTitle: string, language: string): string {
    return `You are an expert course designer expanding section-level structure into detailed lessons.

**Section Title**: ${sectionTitle}
**Target Language**: ${language}

**Task**: Generate 3-5 detailed lessons for this section in valid JSON format:

{
  "section_number": 1,
  "section_title": "${sectionTitle}",
  "section_description": string,
  "learning_objectives": string[] (3-5 objectives),
  "lessons": [
    {
      "lesson_number": number,
      "lesson_title": string (5-500 chars),
      "lesson_objectives": string[] (2-5 objectives),
      "key_topics": string[] (3-10 topics),
      "estimated_duration_minutes": number (10-45),
      "exercises": [
        {
          "exercise_type": "hands_on" | "quiz" | "project",
          "exercise_title": string,
          "exercise_instructions": string
        }
      ] (1-3 exercises)
    }
  ]
}

**Requirements**:
1. All content must be in ${language === 'ru' ? 'Russian' : 'English'}
2. Generate 3-5 complete lessons with full structure
3. Objectives must use measurable action verbs
4. Exercises must be actionable with clear instructions
5. Output ONLY valid JSON, no markdown or explanations`;
  }

  async testMetadataEnglish(): Promise<void> {
    const testId = 'T1';
    const testName = 'Metadata - English, Beginner';
    log(`Starting [${testId}] ${testName}...`, 'info');

    try {
      const prompt = this.buildMetadataPrompt('Introduction to Python Programming', 'en');
      const result = await this.invokeModel(prompt);

      // Pricing: $0.20 input / $0.50 output per 1M tokens
      const cost = (result.tokens.input * 0.20 + result.tokens.output * 0.50) / 1000000;

      this.results.push({
        testId,
        testName,
        scenario: 'metadata',
        language: 'en',
        status: 'SUCCESS',
        duration: result.duration,
        tokens: result.tokens,
        cost,
      });

      this.totalCost += cost;
      log(`[${testId}] SUCCESS - ${result.tokens.output} output tokens, ${result.duration}ms, $${cost.toFixed(6)}`, 'success');
    } catch (err: any) {
      this.results.push({
        testId,
        testName,
        scenario: 'metadata',
        language: 'en',
        status: 'FAILED',
        duration: err.duration || 0,
        error: err.error?.message || 'Unknown error',
      });
      log(`[${testId}] FAILED - ${err.error?.message}`, 'error');
    }
  }

  async testMetadataRussian(): Promise<void> {
    const testId = 'T2';
    const testName = 'Metadata - Russian, Intermediate';
    log(`Starting [${testId}] ${testName}...`, 'info');

    try {
      const prompt = this.buildMetadataPrompt('Машинное обучение для начинающих', 'ru');
      const result = await this.invokeModel(prompt);

      const cost = (result.tokens.input * 0.20 + result.tokens.output * 0.50) / 1000000;

      this.results.push({
        testId,
        testName,
        scenario: 'metadata',
        language: 'ru',
        status: 'SUCCESS',
        duration: result.duration,
        tokens: result.tokens,
        cost,
      });

      this.totalCost += cost;
      log(`[${testId}] SUCCESS - ${result.tokens.output} output tokens, ${result.duration}ms, $${cost.toFixed(6)}`, 'success');
    } catch (err: any) {
      this.results.push({
        testId,
        testName,
        scenario: 'metadata',
        language: 'ru',
        status: 'FAILED',
        duration: err.duration || 0,
        error: err.error?.message || 'Unknown error',
      });
      log(`[${testId}] FAILED - ${err.error?.message}`, 'error');
    }
  }

  async testLessonEnglish(): Promise<void> {
    const testId = 'T3';
    const testName = 'Lesson Generation - English, Programming';
    log(`Starting [${testId}] ${testName}...`, 'info');

    try {
      const prompt = this.buildLessonPrompt('Variables and Data Types in Python', 'en');
      const result = await this.invokeModel(prompt);

      const cost = (result.tokens.input * 0.20 + result.tokens.output * 0.50) / 1000000;

      this.results.push({
        testId,
        testName,
        scenario: 'lesson',
        language: 'en',
        status: 'SUCCESS',
        duration: result.duration,
        tokens: result.tokens,
        cost,
      });

      this.totalCost += cost;
      log(`[${testId}] SUCCESS - ${result.tokens.output} output tokens, ${result.duration}ms, $${cost.toFixed(6)}`, 'success');
    } catch (err: any) {
      this.results.push({
        testId,
        testName,
        scenario: 'lesson',
        language: 'en',
        status: 'FAILED',
        duration: err.duration || 0,
        error: err.error?.message || 'Unknown error',
      });
      log(`[${testId}] FAILED - ${err.error?.message}`, 'error');
    }
  }

  async testLessonRussian(): Promise<void> {
    const testId = 'T4';
    const testName = 'Lesson Generation - Russian, Theory';
    log(`Starting [${testId}] ${testName}...`, 'info');

    try {
      const prompt = this.buildLessonPrompt('Основы нейронных сетей', 'ru');
      const result = await this.invokeModel(prompt);

      const cost = (result.tokens.input * 0.20 + result.tokens.output * 0.50) / 1000000;

      this.results.push({
        testId,
        testName,
        scenario: 'lesson',
        language: 'ru',
        status: 'SUCCESS',
        duration: result.duration,
        tokens: result.tokens,
        cost,
      });

      this.totalCost += cost;
      log(`[${testId}] SUCCESS - ${result.tokens.output} output tokens, ${result.duration}ms, $${cost.toFixed(6)}`, 'success');
    } catch (err: any) {
      this.results.push({
        testId,
        testName,
        scenario: 'lesson',
        language: 'ru',
        status: 'FAILED',
        duration: err.duration || 0,
        error: err.error?.message || 'Unknown error',
      });
      log(`[${testId}] FAILED - ${err.error?.message}`, 'error');
    }
  }

  printSummary(): void {
    section('Test Summary: x-ai/grok-4-fast');

    console.log('\nResults:');
    this.results.forEach(r => {
      const status = r.status === 'SUCCESS' ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
      const tokens = r.tokens ? `${r.tokens.output} tokens` : 'N/A';
      const cost = r.cost ? `$${r.cost.toFixed(6)}` : 'N/A';
      console.log(`  ${status} [${r.testId}] ${r.testName}: ${tokens}, ${r.duration}ms, ${cost}`);
    });

    const passed = this.results.filter(r => r.status === 'SUCCESS').length;
    console.log(`\nPassed: ${passed}/${this.results.length}`);
    console.log(`Total Cost: $${this.totalCost.toFixed(6)}`);

    // Calculate averages for metadata and lessons
    const metadataTests = this.results.filter(r => r.scenario === 'metadata' && r.status === 'SUCCESS');
    const lessonTests = this.results.filter(r => r.scenario === 'lesson' && r.status === 'SUCCESS');

    if (metadataTests.length > 0) {
      const avgMetadata = metadataTests.reduce((sum, t) => sum + (t.tokens?.output || 0), 0) / metadataTests.length;
      console.log(`\nMetadata Avg Output: ${avgMetadata.toFixed(0)} tokens`);
    }

    if (lessonTests.length > 0) {
      const avgLesson = lessonTests.reduce((sum, t) => sum + (t.tokens?.output || 0), 0) / lessonTests.length;
      console.log(`Lesson Avg Output: ${avgLesson.toFixed(0)} tokens`);
    }
  }

  async runAll(): Promise<void> {
    section('Model Evaluation: x-ai/grok-4-fast');
    log('Testing all 4 scenarios (with retry logic)', 'info');
    log('Pricing: $0.20 input / $0.50 output per 1M tokens', 'info');

    await this.testMetadataEnglish();
    await new Promise(resolve => setTimeout(resolve, 2000));

    await this.testMetadataRussian();
    await new Promise(resolve => setTimeout(resolve, 2000));

    await this.testLessonEnglish();
    await new Promise(resolve => setTimeout(resolve, 2000));

    await this.testLessonRussian();

    this.printSummary();
  }
}

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
