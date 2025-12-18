/**
 * Full E2E Pipeline Test
 *
 * Runs all 6 stages with real test documents:
 * Stage 1: Document Upload
 * Stage 2: Document Processing (Docling)
 * Stage 3: Summarization
 * Stage 4: Analysis
 * Stage 5: Lesson Spec Generation
 * Stage 6: Lesson Content Generation (1 lesson only)
 *
 * Prerequisites:
 * - Docker services running (redis, qdrant)
 * - Worker process running (pnpm dev:worker)
 * - Supabase connection configured
 *
 * Usage:
 *   OPENROUTER_API_KEY=... npx tsx scripts/e2e-full-pipeline.ts
 */

// IMPORTANT: Load env BEFORE any other imports (ES modules hoist imports)
import * as path from 'path';
import dotenv from 'dotenv';
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });

// Now import everything else
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdmin } from '../src/shared/supabase/admin';
import { addJob } from '../src/orchestrator/queue';
import { JobType } from '@megacampus/shared-types';
import { uploadFile } from '../src/stages/stage1-document-upload/handler';
import { executeStage6, type Stage6Input } from '../src/stages/stage6-lesson-content/orchestrator';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';

// ============================================================================
// Configuration
// ============================================================================

const TEST_DATA_DIR = path.join(__dirname, '..', 'tests', 'test-data');
const OUTPUT_DIR = path.join(__dirname, '..', '.tmp');

// Test user/org IDs (should exist in database or create new ones)
const TEST_ORG_ID = 'test-org-' + uuidv4().slice(0, 8);
const TEST_USER_ID = 'test-user-' + uuidv4().slice(0, 8);

interface StageResult {
  stage: string;
  status: 'success' | 'failure' | 'skipped';
  duration: number;
  data?: unknown;
  error?: string;
}

const results: StageResult[] = [];
let reportContent: string[] = [];

// ============================================================================
// Helper Functions
// ============================================================================

function log(message: string) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function addToReport(content: string) {
  reportContent.push(content);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for a course to reach a specific generation status
 */
async function waitForStatus(
  courseId: string,
  targetStatuses: string[],
  maxWaitMs: number = 300000
): Promise<{ status: string; data: any }> {
  const supabase = getSupabaseAdmin();
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const { data: course, error } = await supabase
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .single();

    if (error) {
      throw new Error(`Failed to query course: ${error.message}`);
    }

    const status = course.generation_status as string;
    const progress = course.generation_progress || 0;

    process.stdout.write(`\r   Status: ${status}, Progress: ${progress}%   `);

    if (targetStatuses.includes(status)) {
      console.log('');
      return { status, data: course };
    }

    if (status === 'failed') {
      console.log('');
      throw new Error(`Generation failed: ${course.generation_metadata?.error_message || 'Unknown error'}`);
    }

    await sleep(3000);
  }

  throw new Error(`Timeout waiting for status: ${targetStatuses.join('/')}`);
}

/**
 * Wait for all documents to be processed
 */
async function waitForDocumentsProcessed(
  courseId: string,
  maxWaitMs: number = 300000
): Promise<any[]> {
  const supabase = getSupabaseAdmin();
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const { data: files, error } = await supabase
      .from('file_catalog')
      .select('*')
      .eq('course_id', courseId);

    if (error) {
      throw new Error(`Failed to query files: ${error.message}`);
    }

    const total = files?.length || 0;
    const processed = files?.filter(f =>
      f.vector_status === 'ready' || f.vector_status === 'indexed'
    ).length || 0;
    const failed = files?.filter(f => f.vector_status === 'failed').length || 0;

    process.stdout.write(`\r   Documents: ${processed}/${total} ready, ${failed} failed   `);

    if (total > 0 && processed + failed === total) {
      console.log('');
      return files || [];
    }

    await sleep(2000);
  }

  throw new Error('Timeout waiting for documents to be processed');
}

/**
 * Wait for all documents to have processed_content (Stage 3 complete)
 * Handles partial failures - only waits for documents that passed Stage 2
 */
async function waitForDocumentsSummarized(
  courseId: string,
  maxWaitMs: number = 300000
): Promise<any[]> {
  const supabase = getSupabaseAdmin();
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const { data: files, error } = await supabase
      .from('file_catalog')
      .select('*')
      .eq('course_id', courseId);

    if (error) {
      throw new Error(`Failed to query files: ${error.message}`);
    }

    const total = files?.length || 0;
    // Only count files that have markdown_content (Stage 2 completed successfully)
    const eligibleForSummarization = files?.filter(f => f.markdown_content && f.markdown_content.length > 0) || [];
    const summarized = eligibleForSummarization.filter(f => f.processed_content && f.processed_content.length > 0).length;
    const failedStage2 = total - eligibleForSummarization.length;

    process.stdout.write(`\r   Summarized: ${summarized}/${eligibleForSummarization.length} (${failedStage2} failed Stage 2)   `);

    // Success if all eligible files are summarized (at least 1 must exist)
    if (eligibleForSummarization.length > 0 && summarized === eligibleForSummarization.length) {
      console.log('');
      if (failedStage2 > 0) {
        log(`  ⚠️ Warning: ${failedStage2} document(s) failed Stage 2 and were skipped`);
      }
      return files || [];
    }

    await sleep(2000);
  }

  throw new Error('Timeout waiting for documents to be summarized');
}

/**
 * Wait for analysis_result to appear in course
 */
async function waitForAnalysisResult(
  courseId: string,
  maxWaitMs: number = 300000
): Promise<any> {
  const supabase = getSupabaseAdmin();
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const { data: course, error } = await supabase
      .from('courses')
      .select('analysis_result, generation_status')
      .eq('id', courseId)
      .single();

    if (error) {
      throw new Error(`Failed to query course: ${error.message}`);
    }

    const status = course.generation_status;
    process.stdout.write(`\r   Status: ${status}   `);

    if (course.analysis_result && Object.keys(course.analysis_result).length > 0) {
      console.log('');
      return course.analysis_result;
    }

    await sleep(3000);
  }

  throw new Error('Timeout waiting for analysis result');
}

// ============================================================================
// Stage Runners
// ============================================================================

/**
 * Stage 1: Upload test documents
 */
async function runStage1(courseId: string, orgId: string, userId: string): Promise<StageResult> {
  const startTime = Date.now();
  log('Stage 1: Document Upload');

  try {
    const files = fs.readdirSync(TEST_DATA_DIR).filter(f =>
      f.endsWith('.pdf') || f.endsWith('.docx')
    );

    log(`  Found ${files.length} test documents`);
    const uploadedFiles: Array<{ fileId: string; filePath: string; mimeType: string }> = [];

    for (const filename of files) {
      const filePath = path.join(TEST_DATA_DIR, filename);
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath);
      const base64Content = content.toString('base64');

      const mimeType = filename.endsWith('.pdf')
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      log(`  Uploading: ${filename} (${Math.round(stats.size / 1024)}KB)`);

      const result = await uploadFile({
        courseId,
        organizationId: orgId,
        userId: userId,
        filename,
        fileSize: stats.size,
        mimeType,
        fileContent: base64Content,
      });

      uploadedFiles.push({
        fileId: result.fileId,
        filePath: result.storagePath,
        mimeType,
      });
      log(`    -> File ID: ${result.fileId}`);
    }

    // Trigger Stage 2: Add DOCUMENT_PROCESSING jobs to queue
    log('  Triggering Stage 2 jobs...');
    for (const file of uploadedFiles) {
      const absoluteFilePath = path.join(process.cwd(), file.filePath);
      await addJob(JobType.DOCUMENT_PROCESSING, {
        jobType: JobType.DOCUMENT_PROCESSING,
        organizationId: orgId,
        courseId,
        userId,
        createdAt: new Date().toISOString(),
        fileId: file.fileId,
        filePath: absoluteFilePath,
        mimeType: file.mimeType,
        chunkSize: 512,
        chunkOverlap: 50,
      } as any, { priority: 10 });
      log(`    -> Queued job for: ${file.fileId}`);
    }

    const duration = Date.now() - startTime;
    return {
      stage: 'Stage 1: Document Upload',
      status: 'success',
      duration,
      data: { fileCount: uploadedFiles.length, fileIds: uploadedFiles.map(f => f.fileId) },
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      stage: 'Stage 1: Document Upload',
      status: 'failure',
      duration,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Stage 2-4: Document Processing, Summarization, Analysis
 * These run via BullMQ workers
 */
async function runStages2to4(courseId: string, orgId: string, userId: string): Promise<StageResult[]> {
  const results: StageResult[] = [];

  // Stage 2: Document Processing
  log('Stage 2: Document Processing (waiting for Docling...)');
  const stage2Start = Date.now();
  try {
    const files = await waitForDocumentsProcessed(courseId, 300000);
    const processedCount = files.filter(f => f.vector_status === 'ready' || f.vector_status === 'indexed').length;

    results.push({
      stage: 'Stage 2: Document Processing',
      status: processedCount > 0 ? 'success' : 'failure',
      duration: Date.now() - stage2Start,
      data: { processedCount, totalFiles: files.length },
    });
  } catch (error) {
    results.push({
      stage: 'Stage 2: Document Processing',
      status: 'failure',
      duration: Date.now() - stage2Start,
      error: error instanceof Error ? error.message : String(error),
    });
    return results;
  }

  // Stage 3: Summarization (check processed_content in file_catalog)
  log('Stage 3: Summarization (waiting for processed content...)');
  const stage3Start = Date.now();
  try {
    // Wait for all files to have processed_content
    await waitForDocumentsSummarized(courseId, 300000);
    results.push({
      stage: 'Stage 3: Summarization',
      status: 'success',
      duration: Date.now() - stage3Start,
    });
  } catch (error) {
    results.push({
      stage: 'Stage 3: Summarization',
      status: 'failure',
      duration: Date.now() - stage3Start,
      error: error instanceof Error ? error.message : String(error),
    });
    return results;
  }

  // Stage 4: Analysis - trigger manually since FSM may not auto-transition
  log('Stage 4: Analysis (triggering...)');
  const stage4Start = Date.now();
  try {
    // Trigger Stage 4 analysis job (use snake_case for handler compatibility)
    await addJob(JobType.STRUCTURE_ANALYSIS, {
      jobType: JobType.STRUCTURE_ANALYSIS,
      organization_id: orgId,
      course_id: courseId,
      user_id: userId,
      createdAt: new Date().toISOString(),
    } as any, { priority: 10 });

    // Wait for analysis_result to appear (10 min timeout for LLM analysis phases)
    await waitForAnalysisResult(courseId, 600000);

    const supabase = getSupabaseAdmin();
    const { data: course } = await supabase
      .from('courses')
      .select('analysis_result')
      .eq('id', courseId)
      .single();

    results.push({
      stage: 'Stage 4: Analysis',
      status: course?.analysis_result ? 'success' : 'failure',
      duration: Date.now() - stage4Start,
      data: { hasAnalysisResult: !!course?.analysis_result },
    });
  } catch (error) {
    results.push({
      stage: 'Stage 4: Analysis',
      status: 'failure',
      duration: Date.now() - stage4Start,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return results;
}

/**
 * Stage 5: Trigger and wait for structure generation
 */
async function runStage5(courseId: string, orgId: string, userId: string): Promise<StageResult> {
  const startTime = Date.now();
  log('Stage 5: Structure Generation');

  try {
    const supabase = getSupabaseAdmin();

    // Get course data for generation
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .single();

    if (courseError || !course) {
      throw new Error(`Failed to get course: ${courseError?.message}`);
    }

    // Trigger structure generation job
    log('  Triggering structure generation job...');
    const jobData = {
      course_id: courseId,
      organization_id: orgId,
      user_id: userId,
      analysis_result: course.analysis_result,
      frontend_parameters: {
        course_title: course.title || 'Test Course',
        language: course.language || 'Russian',
        style: course.style || 'practical',
      },
      vectorized_documents: true,
      document_summaries: [],
    };

    await addJob(JobType.STRUCTURE_GENERATION, jobData as any, { priority: 10 });
    log('  Job queued, waiting for completion...');

    // Wait for generation to complete (20 min timeout - Stage 5 generates 30+ lessons)
    const result = await waitForStatus(courseId, ['completed'], 1200000);

    const structure = result.data.course_structure;
    const lessonCount = structure?.sections?.reduce(
      (sum: number, s: any) => sum + (s.lessons?.length || 0),
      0
    ) || 0;

    return {
      stage: 'Stage 5: Structure Generation',
      status: 'success',
      duration: Date.now() - startTime,
      data: {
        sectionCount: structure?.sections?.length || 0,
        lessonCount,
        structure,
      },
    };
  } catch (error) {
    return {
      stage: 'Stage 5: Structure Generation',
      status: 'failure',
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Stage 6: Generate content for MULTIPLE lessons (configurable)
 */
const LESSONS_TO_GENERATE = 3; // Generate 3 lessons for testing

async function runStage6(courseId: string, courseStructure: any): Promise<StageResult> {
  const startTime = Date.now();
  log(`Stage 6: Lesson Content Generation (${LESSONS_TO_GENERATE} lessons)`);

  try {
    // Collect all lessons from all sections
    const allLessons: { lesson: any; sectionTitle: string; sectionIndex: number; lessonIndex: number }[] = [];

    for (let sIdx = 0; sIdx < (courseStructure?.sections?.length || 0); sIdx++) {
      const section = courseStructure.sections[sIdx];
      for (let lIdx = 0; lIdx < (section.lessons?.length || 0); lIdx++) {
        allLessons.push({
          lesson: section.lessons[lIdx],
          sectionTitle: section.title,
          sectionIndex: sIdx,
          lessonIndex: lIdx,
        });
      }
    }

    if (allLessons.length === 0) {
      throw new Error('No lessons found in course structure');
    }

    // Take first N lessons
    const lessonsToProcess = allLessons.slice(0, LESSONS_TO_GENERATE);
    log(`  Found ${allLessons.length} total lessons, processing ${lessonsToProcess.length}`);

    const lessonResults: any[] = [];
    let totalTokens = 0;
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < lessonsToProcess.length; i++) {
      const { lesson, sectionTitle, sectionIndex, lessonIndex } = lessonsToProcess[i];
      const lessonStartTime = Date.now();

      log(`\n  [${i + 1}/${lessonsToProcess.length}] Generating: "${lesson.title}"`);
      log(`      Section: "${sectionTitle}" (${sectionIndex + 1}.${lessonIndex + 1})`);

      // Create LessonSpecificationV2 from the structure
      const lessonSpec: LessonSpecificationV2 = {
        lesson_id: lesson.id || uuidv4(),
        title: lesson.title,
        description: lesson.description || `Lesson about ${lesson.title}`,
        metadata: {
          target_audience: 'practitioner',
          tone: 'conversational-professional',
          compliance_level: 'standard',
          content_archetype: 'concept_explainer',
        },
        learning_objectives: (lesson.learning_outcomes || []).map((lo: string, idx: number) => ({
          id: `LO-${idx + 1}`,
          objective: lo,
          bloom_level: 'understand' as const,
        })),
        intro_blueprint: {
          hook_strategy: 'question',
          hook_topic: lesson.title,
          key_learning_objectives: (lesson.learning_outcomes || []).join(', '),
        },
        sections: (lesson.topics || [lesson.title]).map((topic: string) => ({
          title: topic,
          content_archetype: 'concept_explainer',
          rag_context_id: uuidv4(),
          constraints: {
            depth: 'detailed_analysis',
            required_keywords: [],
            prohibited_terms: [],
          },
          key_points_to_cover: [topic],
        })),
        exercises: [],
        rag_context: {
          primary_documents: [],
          search_queries: [lesson.title],
          expected_chunks: 3,
        },
        estimated_duration_minutes: lesson.duration_minutes || 15,
        difficulty_level: 'intermediate',
      };

      const ragChunks: any[] = [];
      const input: Stage6Input = {
        lessonSpec,
        courseId,
        ragChunks,
      };

      try {
        const result = await executeStage6(input);
        const lessonDuration = Date.now() - lessonStartTime;

        if (result.success) {
          successCount++;
          totalTokens += result.metrics.tokensUsed || 0;
          log(`      ✅ Success in ${(lessonDuration / 1000).toFixed(1)}s`);
          log(`      Model: ${result.metrics.modelUsed}`);
          log(`      Tokens: ${result.metrics.tokensUsed}`);
          log(`      Quality: ${result.metrics.qualityScore?.toFixed(2) || 'N/A'}`);
        } else {
          failureCount++;
          log(`      ❌ Failed: ${result.errors?.join(', ')}`);
        }

        lessonResults.push({
          lessonTitle: lesson.title,
          sectionTitle,
          position: `${sectionIndex + 1}.${lessonIndex + 1}`,
          success: result.success,
          duration: lessonDuration,
          tokensUsed: result.metrics.tokensUsed,
          qualityScore: result.metrics.qualityScore,
          modelUsed: result.metrics.modelUsed,
          regenerationAttempts: result.metrics.regenerationAttempts || 0,
          contentPreview: result.lessonContent?.content?.intro?.slice(0, 500),
          fullContent: result.lessonContent,
          errors: result.errors,
        });
      } catch (error) {
        failureCount++;
        const lessonDuration = Date.now() - lessonStartTime;
        log(`      ❌ Error: ${error instanceof Error ? error.message : String(error)}`);

        lessonResults.push({
          lessonTitle: lesson.title,
          sectionTitle,
          position: `${sectionIndex + 1}.${lessonIndex + 1}`,
          success: false,
          duration: lessonDuration,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    log(`\n  Stage 6 Summary: ${successCount}/${lessonsToProcess.length} successful`);

    return {
      stage: 'Stage 6: Lesson Content Generation',
      status: failureCount === 0 ? 'success' : (successCount > 0 ? 'partial' : 'failure'),
      duration: Date.now() - startTime,
      data: {
        lessonsProcessed: lessonsToProcess.length,
        successCount,
        failureCount,
        successRate: `${((successCount / lessonsToProcess.length) * 100).toFixed(0)}%`,
        totalTokensUsed: totalTokens,
        lessonResults,
      },
    };
  } catch (error) {
    return {
      stage: 'Stage 6: Lesson Content Generation',
      status: 'failure',
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Report Generation
// ============================================================================

function generateReport(courseId: string, allResults: StageResult[]): string {
  const report: string[] = [];

  report.push('# 📊 Full E2E Pipeline Test Report\n');
  report.push(`**Generated**: ${new Date().toISOString()}`);
  report.push(`**Course ID**: \`${courseId}\``);
  report.push(`**Test Data**: ${TEST_DATA_DIR}`);
  report.push(`**Lessons Generated**: ${LESSONS_TO_GENERATE}\n`);
  report.push('---\n');

  // Summary table
  report.push('## 📋 Summary\n');
  report.push('| Stage | Status | Duration |');
  report.push('|-------|--------|----------|');

  let totalDuration = 0;
  for (const result of allResults) {
    const statusIcon = result.status === 'success' ? '✅' :
                       result.status === 'partial' ? '⚠️' :
                       result.status === 'failure' ? '❌' : '⏭️';
    const duration = `${(result.duration / 1000).toFixed(1)}s`;
    report.push(`| ${result.stage} | ${statusIcon} ${result.status} | ${duration} |`);
    totalDuration += result.duration;
  }
  report.push(`| **Total** | - | **${(totalDuration / 1000).toFixed(1)}s** |`);
  report.push('');

  // Services Used section
  report.push('## 🔧 Services & Infrastructure Used\n');
  report.push('| Service | Purpose |');
  report.push('|---------|---------|');
  report.push('| **Supabase PostgreSQL** | Course metadata, FSM state management |');
  report.push('| **Redis/BullMQ** | Job queue for async processing |');
  report.push('| **Docling** | Document parsing (PDF, DOCX) |');
  report.push('| **OpenRouter API** | LLM calls (Qwen3, DeepSeek, Kimi) |');
  report.push('| **Qdrant** | Vector storage for RAG |');
  report.push('| **LangGraph** | Stage 6 state machine orchestration |');
  report.push('');

  // Detailed results
  report.push('## 📝 Detailed Results\n');

  for (const result of allResults) {
    const statusIcon = result.status === 'success' ? '✅' :
                       result.status === 'partial' ? '⚠️' :
                       result.status === 'failure' ? '❌' : '⏭️';
    report.push(`### ${statusIcon} ${result.stage}\n`);
    report.push(`- **Status**: ${result.status}`);
    report.push(`- **Duration**: ${(result.duration / 1000).toFixed(1)}s`);

    if (result.error) {
      report.push(`- **Error**: \`${result.error}\``);
    }

    // Stage-specific formatting
    if (result.data) {
      const data = result.data as any;

      // Stage 1: Document Upload
      if (result.stage.includes('Document Upload') && data.files) {
        report.push('\n**Uploaded Files**:\n');
        report.push('| File | Size | Status |');
        report.push('|------|------|--------|');
        for (const file of data.files) {
          report.push(`| ${file.filename} | ${(file.size / 1024).toFixed(1)}KB | ✅ |`);
        }
      }

      // Stage 2: Document Processing
      if (result.stage.includes('Document Processing') && data.documents) {
        report.push('\n**Processed Documents**:\n');
        report.push(`- Total: ${data.totalDocuments}`);
        report.push(`- Ready: ${data.readyDocuments}`);
        report.push(`- Failed: ${data.failedDocuments}`);
      }

      // Stage 4: Analysis
      if (result.stage.includes('Analysis') && data.sectionCount) {
        report.push('\n**Analysis Result**:\n');
        report.push(`- Sections: ${data.sectionCount}`);
        report.push(`- Total Lessons: ${data.lessonCount}`);
      }

      // Stage 5: Structure Generation
      if (result.stage.includes('Structure Generation') && data.structure) {
        report.push('\n**Generated Structure**:\n');
        report.push(`- Course Title: "${data.structure.course_title}"`);
        report.push(`- Sections: ${data.structure.sections?.length || 0}`);
        const totalLessons = data.structure.sections?.reduce((sum: number, s: any) => sum + (s.lessons?.length || 0), 0) || 0;
        report.push(`- Total Lessons: ${totalLessons}`);
        report.push(`- Language: ${data.structure.target_language || 'N/A'}`);
        report.push(`- Difficulty: ${data.structure.difficulty_level || 'N/A'}`);
      }

      // Stage 6: Lesson Content Generation (detailed)
      if (result.stage.includes('Lesson Content') && data.lessonResults) {
        report.push('\n**Lesson Generation Summary**:\n');
        report.push(`- Processed: ${data.lessonsProcessed}`);
        report.push(`- Success: ${data.successCount}`);
        report.push(`- Failed: ${data.failureCount}`);
        report.push(`- Success Rate: ${data.successRate}`);
        report.push(`- Total Tokens: ${data.totalTokensUsed?.toLocaleString() || 0}`);

        report.push('\n**Individual Lessons**:\n');
        report.push('| # | Lesson | Section | Model | Tokens | Quality | Duration | Status |');
        report.push('|---|--------|---------|-------|--------|---------|----------|--------|');

        for (let i = 0; i < data.lessonResults.length; i++) {
          const lesson = data.lessonResults[i];
          const status = lesson.success ? '✅' : '❌';
          const model = lesson.modelUsed?.split('/').pop() || 'N/A';
          const quality = lesson.qualityScore?.toFixed(2) || 'N/A';
          const duration = `${(lesson.duration / 1000).toFixed(1)}s`;
          report.push(`| ${i + 1} | ${lesson.lessonTitle?.slice(0, 30)}... | ${lesson.position} | ${model} | ${lesson.tokensUsed || 0} | ${quality} | ${duration} | ${status} |`);
        }

        // Content previews for successful lessons
        report.push('\n**Generated Content Previews**:\n');
        for (let i = 0; i < data.lessonResults.length; i++) {
          const lesson = data.lessonResults[i];
          if (lesson.success && lesson.contentPreview) {
            report.push(`\n#### Lesson ${i + 1}: ${lesson.lessonTitle}\n`);
            report.push('```');
            report.push(lesson.contentPreview.slice(0, 800) + '...');
            report.push('```\n');
          }
          if (!lesson.success && lesson.error) {
            report.push(`\n#### Lesson ${i + 1}: ${lesson.lessonTitle} (FAILED)\n`);
            report.push(`**Error**: ${lesson.error}`);
          }
        }
      }
    }

    report.push('');
  }

  // LLM Models section
  report.push('## 🤖 LLM Models Used\n');
  report.push('| Stage | Model | Purpose |');
  report.push('|-------|-------|---------|');
  report.push('| Stage 3 | qwen/qwen3-235b-a22b-2507 | Document summarization |');
  report.push('| Stage 4 | qwen/qwen3-235b-a22b-2507 | Course structure analysis |');
  report.push('| Stage 5 | qwen/qwen3-235b-a22b-2507 | Metadata & section generation |');
  report.push('| Stage 6 | qwen/qwen3-235b-a22b-2507 | Lesson content generation |');
  report.push('| Fallback | deepseek/deepseek-terminus-2-5b | Model escalation on failure |');
  report.push('| Emergency | moonshotai/kimi-k2 | Last resort model |');
  report.push('');

  // Footer
  report.push('---\n');
  report.push(`*Report generated by E2E Pipeline Test*`);
  report.push(`*Total execution time: ${(totalDuration / 1000).toFixed(1)}s*`);

  return report.join('\n');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('       Full E2E Pipeline Test - All 6 Stages');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const startTime = Date.now();
  const allResults: StageResult[] = [];

  try {
    // Create test course
    log('Creating test course...');
    const supabase = getSupabaseAdmin();

    // Use hardcoded test org/user IDs (these are known to exist in the database)
    const DEFAULT_TEST_ORG_ID = '9b98a7d5-27ea-4441-81dc-de79d488e5db';
    const DEFAULT_TEST_USER_ID = 'cea0fc30-5211-483c-b662-c9aeeba1dcba';

    let orgId = DEFAULT_TEST_ORG_ID;
    let userId = DEFAULT_TEST_USER_ID;

    // Try to verify the user exists
    const { data: existingUser, error: userError } = await supabase
      .from('users')
      .select('id, organization_id')
      .eq('id', DEFAULT_TEST_USER_ID)
      .single();

    if (existingUser) {
      orgId = existingUser.organization_id || DEFAULT_TEST_ORG_ID;
      userId = existingUser.id;
      log(`Using verified user: ${userId}`);
    } else {
      // Fallback: use hardcoded IDs (they should exist)
      log(`Using hardcoded test IDs (user query returned: ${userError?.message || 'null'})`);
    }

    log(`Using org: ${orgId}, user: ${userId}`);

    const courseId = uuidv4();
    const slug = 'e2e-test-' + courseId.slice(0, 8);

    // Retry course creation with exponential backoff (Supabase transient errors)
    let course: any = null;
    let createError: any = null;
    const MAX_RETRIES = 5;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const result = await supabase
        .from('courses')
        .insert({
          id: courseId,
          organization_id: orgId,
          user_id: userId,
          title: 'E2E Test Course - ' + new Date().toISOString().slice(0, 16),
          slug: slug,
          course_description: 'E2E Pipeline Testing with real documents',
          language: 'Russian',
          style: 'practical',
          generation_status: 'pending',
        })
        .select()
        .single();

      if (!result.error && result.data) {
        course = result.data;
        createError = null;
        break;
      }

      createError = result.error;
      const isTransient = createError?.message?.includes('Internal server error') ||
                          createError?.message?.includes('503') ||
                          createError?.message?.includes('500');

      if (!isTransient) {
        // Permanent error, don't retry
        break;
      }

      if (attempt < MAX_RETRIES) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        log(`Course creation failed (attempt ${attempt}/${MAX_RETRIES}): ${createError?.message}`);
        log(`Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }

    if (createError || !course) {
      throw new Error(`Failed to create course: ${createError?.message}`);
    }

    log(`Course created: ${courseId}\n`);

    // Stage 1: Upload documents
    const stage1Result = await runStage1(courseId, orgId, userId);
    allResults.push(stage1Result);

    if (stage1Result.status === 'failure') {
      throw new Error('Stage 1 failed, cannot continue');
    }

    // Stages 2-4: Processing, Summarization, Analysis
    // Note: These stages require the worker to be running
    log('\nNote: Stages 2-4 require the worker process to be running.');
    log('If you see timeouts, start the worker with: pnpm dev:worker\n');

    const stages2to4Results = await runStages2to4(courseId, orgId, userId);
    allResults.push(...stages2to4Results);

    const stage4Failed = stages2to4Results.some(r => r.status === 'failure');
    if (stage4Failed) {
      log('\nStages 2-4 had failures, attempting Stage 5 anyway...');
    }

    // Stage 5: Structure Generation
    const stage5Result = await runStage5(courseId, orgId, userId);
    allResults.push(stage5Result);

    // Stage 6: Lesson Content (1 lesson only)
    if (stage5Result.status === 'success' && stage5Result.data) {
      const stage6Result = await runStage6(courseId, (stage5Result.data as any).structure);
      allResults.push(stage6Result);
    } else {
      allResults.push({
        stage: 'Stage 6: Lesson Content Generation',
        status: 'skipped',
        duration: 0,
        error: 'Stage 5 failed, cannot generate lesson content',
      });
    }

    // Generate and save report
    const report = generateReport(courseId, allResults);
    const reportFilename = `e2e-full-pipeline-${Date.now()}.md`;
    const reportPath = path.join(OUTPUT_DIR, reportFilename);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(reportPath, report);

    // Print summary
    const totalDuration = Date.now() - startTime;
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                         RESULTS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    for (const result of allResults) {
      const icon = result.status === 'success' ? '✅' : result.status === 'failure' ? '❌' : '⏭️';
      console.log(`${icon} ${result.stage}: ${result.status} (${(result.duration / 1000).toFixed(1)}s)`);
    }

    console.log(`\n📊 Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
    console.log(`📄 Report saved to: ${reportPath}`);

  } catch (error) {
    console.error('\n❌ Fatal error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch(console.error);
