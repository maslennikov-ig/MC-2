/**
 * E2E Workflow Test - Full Pipeline with Synergy Test Documents
 *
 * Tests the complete 6-stage course generation workflow:
 * Stage 1: Document Upload
 * Stage 2: Document Processing (Docling -> Markdown -> Chunking -> Embedding -> Qdrant)
 * Stage 3: Document Classification (CORE/IMPORTANT/SUPPLEMENTARY)
 * Stage 4: Structure Analysis (5-phase analysis)
 * Stage 5: Structure Generation (course structure with lessons)
 * Stage 6: Lesson Content Generation (LangGraph pipeline)
 *
 * Test Documents: docs/test/synergy/
 * - 1 ТЗ на курс по продажам.docx
 * - Модуль 1_Продажа_билетов_на_крупные_массовые_образовательные_мероприятия.pdf
 * - Регламент работы в AMO CRM Megacampus.pdf
 * - Регулярный_Менеджмент_Отдела_Продаж_docx.pdf
 *
 * Prerequisites:
 * - Docker services running (redis, qdrant)
 * - Worker process running (pnpm dev:worker)
 * - Supabase connection configured
 * - OPENROUTER_API_KEY environment variable set
 *
 * Usage:
 *   npx tsx __tests__/e2e/workflow.e2e.ts
 *   npx tsx __tests__/e2e/workflow.e2e.ts --lessons=5  # Generate 5 lessons in Stage 6
 *   npx tsx __tests__/e2e/workflow.e2e.ts --skip-stage6  # Skip lesson content generation
 */

// Use require for synchronous env loading BEFORE ESM imports kick in
/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load .env synchronously
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

// Now we can use ESM-style imports via dynamic import or regular imports
// Since tsx handles this, we use regular imports for types
import { v4 as uuidv4 } from 'uuid';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';

// Dynamic imports for modules that need env vars
let getSupabaseAdmin: typeof import('../../src/shared/supabase/admin').getSupabaseAdmin;
let addJob: typeof import('../../src/orchestrator/queue').addJob;
let JobType: typeof import('@megacampus/shared-types').JobType;
let uploadFile: typeof import('../../src/stages/stage1-document-upload/handler').uploadFile;
let executeStage6: typeof import('../../src/stages/stage6-lesson-content/orchestrator').executeStage6;
type Stage6Input = import('../../src/stages/stage6-lesson-content/orchestrator').Stage6Input;

async function loadModules() {
  const supabaseModule = await import('../../src/shared/supabase/admin');
  getSupabaseAdmin = supabaseModule.getSupabaseAdmin;

  const queueModule = await import('../../src/orchestrator/queue');
  addJob = queueModule.addJob;

  const sharedTypes = await import('@megacampus/shared-types');
  JobType = sharedTypes.JobType;

  const uploadModule = await import('../../src/stages/stage1-document-upload/handler');
  uploadFile = uploadModule.uploadFile;

  const stage6Module = await import('../../src/stages/stage6-lesson-content/orchestrator');
  executeStage6 = stage6Module.executeStage6;
}

// ============================================================================
// Configuration
// ============================================================================

const TEST_DATA_DIR = path.resolve(__dirname, '../../../../docs/test/synergy');
const OUTPUT_DIR = path.join(__dirname, '../../.tmp');

// Parse CLI args
const args = process.argv.slice(2);
const lessonsArg = args.find(a => a.startsWith('--lessons='));
const LESSONS_TO_GENERATE = lessonsArg ? parseInt(lessonsArg.split('=')[1], 10) : 3;
const SKIP_STAGE6 = args.includes('--skip-stage6');

// Timeouts (in ms)
const TIMEOUTS = {
  DOCUMENT_PROCESSING: 600000,  // 10 min - Docling can be slow
  SUMMARIZATION: 300000,        // 5 min
  CLASSIFICATION: 180000,       // 3 min
  ANALYSIS: 600000,             // 10 min - multi-phase LLM
  GENERATION: 1200000,          // 20 min - generates 30+ lessons
  LESSON_CONTENT: 300000,       // 5 min per lesson
};

// ============================================================================
// Types
// ============================================================================

interface StageResult {
  stage: string;
  status: 'success' | 'failure' | 'skipped' | 'partial';
  duration: number;
  data?: Record<string, unknown>;
  error?: string;
}

// ============================================================================
// Logging & Utilities
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message: string, level: 'info' | 'success' | 'warn' | 'error' = 'info') {
  const timestamp = new Date().toISOString().slice(11, 19);
  const color = {
    info: colors.cyan,
    success: colors.green,
    warn: colors.yellow,
    error: colors.red,
  }[level];
  console.log(`${colors.dim}[${timestamp}]${colors.reset} ${color}${message}${colors.reset}`);
}

function logStage(stage: string) {
  console.log(`\n${colors.bright}${colors.magenta}${'═'.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}  ${stage}${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}${'═'.repeat(60)}${colors.reset}\n`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Wait Functions
// ============================================================================

/**
 * Wait for course to reach specific generation_status values
 */
async function waitForStatus(
  courseId: string,
  targetStatuses: string[],
  maxWaitMs: number
): Promise<{ status: string; data: Record<string, unknown> }> {
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
      return { status, data: course as Record<string, unknown> };
    }

    if (status === 'failed') {
      console.log('');
      const metadata = course.generation_metadata as Record<string, unknown> | null;
      throw new Error(`Generation failed: ${metadata?.error_message || 'Unknown error'}`);
    }

    await sleep(3000);
  }

  throw new Error(`Timeout waiting for status: ${targetStatuses.join('/')}`);
}

/**
 * Wait for all documents to be processed (Stage 2)
 * Checks vector_status in file_catalog
 */
async function waitForDocumentsProcessed(
  courseId: string,
  maxWaitMs: number
): Promise<Record<string, unknown>[]> {
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

    process.stdout.write(`\r   Documents: ${processed}/${total} indexed, ${failed} failed   `);

    if (total > 0 && processed + failed === total) {
      console.log('');
      return (files || []) as Record<string, unknown>[];
    }

    await sleep(3000);
  }

  throw new Error('Timeout waiting for documents to be processed');
}

/**
 * Wait for all documents to have processed_content (summarization complete)
 */
async function waitForDocumentsSummarized(
  courseId: string,
  maxWaitMs: number
): Promise<Record<string, unknown>[]> {
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
    const eligible = files?.filter(f => f.markdown_content && (f.markdown_content as string).length > 0) || [];
    const summarized = eligible.filter(f => f.processed_content && (f.processed_content as string).length > 0).length;
    const failedStage2 = total - eligible.length;

    process.stdout.write(`\r   Summarized: ${summarized}/${eligible.length} (${failedStage2} failed Stage 2)   `);

    if (eligible.length > 0 && summarized === eligible.length) {
      console.log('');
      if (failedStage2 > 0) {
        log(`Warning: ${failedStage2} document(s) failed Stage 2`, 'warn');
      }
      return (files || []) as Record<string, unknown>[];
    }

    await sleep(3000);
  }

  throw new Error('Timeout waiting for documents to be summarized');
}

/**
 * Wait for documents to be classified (Stage 3)
 */
async function waitForDocumentsClassified(
  courseId: string,
  maxWaitMs: number
): Promise<{ core: number; important: number; supplementary: number }> {
  const supabase = getSupabaseAdmin();
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const { data: files, error } = await supabase
      .from('file_catalog')
      .select('id, importance_score, classification_rationale')
      .eq('course_id', courseId)
      .not('processed_content', 'is', null);

    if (error) {
      throw new Error(`Failed to query files: ${error.message}`);
    }

    const total = files?.length || 0;
    const classified = files?.filter(f => f.importance_score !== null).length || 0;

    process.stdout.write(`\r   Classified: ${classified}/${total}   `);

    if (total > 0 && classified === total) {
      console.log('');

      // Count by priority level
      const core = files?.filter(f => (f.importance_score as number) >= 0.9).length || 0;
      const important = files?.filter(f => {
        const score = f.importance_score as number;
        return score >= 0.7 && score < 0.9;
      }).length || 0;
      const supplementary = files?.filter(f => (f.importance_score as number) < 0.7).length || 0;

      return { core, important, supplementary };
    }

    await sleep(2000);
  }

  throw new Error('Timeout waiting for documents to be classified');
}

/**
 * Wait for analysis_result to appear in course (Stage 4)
 */
async function waitForAnalysisResult(
  courseId: string,
  maxWaitMs: number
): Promise<Record<string, unknown>> {
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

    const status = course.generation_status as string;
    process.stdout.write(`\r   Status: ${status}   `);

    if (course.analysis_result && Object.keys(course.analysis_result as object).length > 0) {
      console.log('');
      return course.analysis_result as Record<string, unknown>;
    }

    if (status === 'failed') {
      console.log('');
      throw new Error('Stage 4 analysis failed');
    }

    await sleep(3000);
  }

  throw new Error('Timeout waiting for analysis result');
}

/**
 * Approve a stage and transition to next stage
 * This simulates what the user does in the UI when they click "Approve"
 */
async function approveStage(
  courseId: string,
  stage: number,
  orgId: string,
  userId: string
): Promise<void> {
  const supabase = getSupabaseAdmin();

  log(`Approving stage ${stage}...`, 'info');

  // Update course status to next stage init
  const nextStageStatus = `stage_${stage + 1}_init`;

  const { error: updateError } = await supabase
    .from('courses')
    .update({ generation_status: nextStageStatus as any })
    .eq('id', courseId);

  if (updateError) {
    throw new Error(`Failed to approve stage ${stage}: ${updateError.message}`);
  }

  // Stage-specific job queueing
  if (stage === 2) {
    // After Stage 2 approval, queue DOCUMENT_CLASSIFICATION job for Stage 3
    const classificationJobData = {
      jobType: JobType.DOCUMENT_CLASSIFICATION,
      organizationId: orgId,
      courseId,
      userId,
      createdAt: new Date().toISOString(),
    };
    await addJob(JobType.DOCUMENT_CLASSIFICATION, classificationJobData as any, { priority: 10 });
    log('Queued DOCUMENT_CLASSIFICATION job for Stage 3', 'info');
  } else if (stage === 3) {
    // After Stage 3 approval, queue STRUCTURE_ANALYSIS job for Stage 4
    const analysisJobData = {
      jobType: JobType.STRUCTURE_ANALYSIS,
      organizationId: orgId,
      courseId,
      userId,
      createdAt: new Date().toISOString(),
    };
    await addJob(JobType.STRUCTURE_ANALYSIS, analysisJobData as any, { priority: 10 });
    log('Queued STRUCTURE_ANALYSIS job for Stage 4', 'info');
  } else if (stage === 4) {
    // After Stage 4 approval, queue STRUCTURE_GENERATION job for Stage 5
    const generationJobData = {
      jobType: JobType.STRUCTURE_GENERATION,
      organizationId: orgId,
      courseId,
      userId,
      createdAt: new Date().toISOString(),
    };
    await addJob(JobType.STRUCTURE_GENERATION, generationJobData as any, { priority: 10 });
    log('Queued STRUCTURE_GENERATION job for Stage 5', 'info');
  }

  log(`Stage ${stage} approved, transitioning to ${nextStageStatus}`, 'success');
}

/**
 * Wait for stage to complete and reach awaiting_approval status
 */
async function waitForStageAwaitingApproval(
  courseId: string,
  stage: number,
  maxWaitMs: number
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const startTime = Date.now();
  const targetStatus = `stage_${stage}_awaiting_approval`;
  const completeStatus = `stage_${stage}_complete`;

  while (Date.now() - startTime < maxWaitMs) {
    const { data: course, error } = await supabase
      .from('courses')
      .select('generation_status')
      .eq('id', courseId)
      .single();

    if (error) {
      throw new Error(`Failed to query course: ${error.message}`);
    }

    const status = course.generation_status as string;
    process.stdout.write(`\r   Stage ${stage} status: ${status}   `);

    if (status === targetStatus || status === completeStatus) {
      console.log('');
      return;
    }

    // Check if already moved to next stage
    if (status.startsWith(`stage_${stage + 1}`)) {
      console.log('');
      return;
    }

    if (status === 'failed') {
      console.log('');
      throw new Error(`Stage ${stage} failed`);
    }

    await sleep(2000);
  }

  throw new Error(`Timeout waiting for stage ${stage} to complete`);
}

// ============================================================================
// Stage Runners
// ============================================================================

/**
 * Stage 1: Upload test documents
 */
async function runStage1(courseId: string, orgId: string, userId: string): Promise<StageResult> {
  logStage('Stage 1: Document Upload');
  const startTime = Date.now();

  try {
    // Check if test data directory exists
    if (!fs.existsSync(TEST_DATA_DIR)) {
      throw new Error(`Test data directory not found: ${TEST_DATA_DIR}`);
    }

    const files = fs.readdirSync(TEST_DATA_DIR).filter(f =>
      f.endsWith('.pdf') || f.endsWith('.docx')
    );

    if (files.length === 0) {
      throw new Error('No test documents found in test data directory');
    }

    log(`Found ${files.length} test documents`, 'info');
    const uploadedFiles: Array<{ fileId: string; filePath: string; mimeType: string; filename: string }> = [];

    for (const filename of files) {
      const filePath = path.join(TEST_DATA_DIR, filename);
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath);
      const base64Content = content.toString('base64');

      const mimeType = filename.endsWith('.pdf')
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      log(`Uploading: ${filename} (${Math.round(stats.size / 1024)}KB)`, 'info');

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
        filename,
      });
      log(`  -> File ID: ${result.fileId}`, 'success');
    }

    // Trigger Stage 2: Queue DOCUMENT_PROCESSING jobs
    log('Triggering Stage 2 jobs...', 'info');
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
      log(`  -> Queued job for: ${file.filename}`, 'info');
    }

    return {
      stage: 'Stage 1: Document Upload',
      status: 'success',
      duration: Date.now() - startTime,
      data: {
        fileCount: uploadedFiles.length,
        files: uploadedFiles.map(f => ({ filename: f.filename, fileId: f.fileId })),
      },
    };
  } catch (error) {
    return {
      stage: 'Stage 1: Document Upload',
      status: 'failure',
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Stage 2: Wait for document processing (Docling + RAG pipeline)
 */
async function runStage2(courseId: string, orgId: string, userId: string): Promise<StageResult> {
  logStage('Stage 2: Document Processing');
  const startTime = Date.now();

  try {
    log('Waiting for Docling conversion and RAG pipeline...', 'info');
    const files = await waitForDocumentsProcessed(courseId, TIMEOUTS.DOCUMENT_PROCESSING);

    const indexed = files.filter(f => f.vector_status === 'indexed').length;
    const failed = files.filter(f => f.vector_status === 'failed').length;

    if (indexed === 0) {
      throw new Error('No documents were successfully processed');
    }

    log(`Processed: ${indexed} indexed, ${failed} failed`, indexed > 0 ? 'success' : 'warn');

    // Wait for summarization (processed_content)
    log('Waiting for document summarization...', 'info');
    await waitForDocumentsSummarized(courseId, TIMEOUTS.SUMMARIZATION);

    // Wait for Stage 2 to reach awaiting_approval status
    log('Waiting for Stage 2 to complete...', 'info');
    await waitForStageAwaitingApproval(courseId, 2, 60000); // 1 min timeout

    // Approve Stage 2 to move to Stage 3
    await approveStage(courseId, 2, orgId, userId);

    return {
      stage: 'Stage 2: Document Processing',
      status: failed > 0 ? 'partial' : 'success',
      duration: Date.now() - startTime,
      data: {
        totalFiles: files.length,
        indexed,
        failed,
      },
    };
  } catch (error) {
    return {
      stage: 'Stage 2: Document Processing',
      status: 'failure',
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Stage 3: Document Classification
 *
 * After Stage 2 approval, the system automatically queues the DOCUMENT_CLASSIFICATION job.
 * This stage classifies documents into CORE/IMPORTANT/SUPPLEMENTARY priorities.
 * We wait for Stage 3 to complete and then approve it.
 */
async function runStage3(courseId: string, orgId: string, userId: string): Promise<StageResult> {
  logStage('Stage 3: Document Classification');
  const startTime = Date.now();

  try {
    log('DOCUMENT_CLASSIFICATION job was queued by Stage 2 approval', 'info');
    log('Waiting for document classification to complete...', 'info');

    // Wait for Stage 3 to reach awaiting_approval status
    await waitForStageAwaitingApproval(courseId, 3, TIMEOUTS.CLASSIFICATION);

    log('Stage 3 classification complete', 'success');

    // Check classification results
    const supabase = getSupabaseAdmin();
    const { data: files } = await supabase
      .from('file_catalog')
      .select('id, importance_score, classification_rationale')
      .eq('course_id', courseId)
      .not('processed_content', 'is', null);

    const classified = files?.filter(f => f.importance_score !== null).length || 0;
    const total = files?.length || 0;

    // Count by priority level
    const core = files?.filter(f => (f.importance_score as number) >= 0.9).length || 0;
    const important = files?.filter(f => {
      const score = f.importance_score as number;
      return score >= 0.7 && score < 0.9;
    }).length || 0;
    const supplementary = files?.filter(f => (f.importance_score as number) < 0.7).length || 0;

    log(`Classification: CORE=${core}, IMPORTANT=${important}, SUPPLEMENTARY=${supplementary}`, 'info');

    // Approve Stage 3 to move to Stage 4
    await approveStage(courseId, 3, orgId, userId);

    return {
      stage: 'Stage 3: Document Classification',
      status: 'success',
      duration: Date.now() - startTime,
      data: {
        totalDocuments: total,
        classified,
        core,
        important,
        supplementary,
      },
    };
  } catch (error) {
    return {
      stage: 'Stage 3: Document Classification',
      status: 'failure',
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Stage 4: Structure Analysis
 *
 * After Stage 3 approval, the system automatically queues the analysis job.
 * We wait for analysis_result to appear and then approve Stage 4.
 */
async function runStage4(courseId: string, orgId: string, userId: string): Promise<StageResult> {
  logStage('Stage 4: Structure Analysis');
  const startTime = Date.now();

  try {
    log('Stage 4 analysis job was queued by Stage 3 approval', 'info');
    log('Waiting for analysis result (multi-phase LLM processing)...', 'info');
    const analysisResult = await waitForAnalysisResult(courseId, TIMEOUTS.ANALYSIS);

    const recommendedStructure = analysisResult.recommended_structure as Record<string, unknown> | undefined;
    const totalLessons = recommendedStructure?.total_lessons || 0;
    const totalSections = recommendedStructure?.total_sections || 0;

    log(`Analysis complete: ${totalSections} sections, ${totalLessons} lessons`, 'success');

    // Wait for Stage 4 to reach awaiting_approval status
    log('Waiting for Stage 4 to complete...', 'info');
    await waitForStageAwaitingApproval(courseId, 4, 120000); // 2 min timeout

    // Approve Stage 4 to move to Stage 5
    await approveStage(courseId, 4, orgId, userId);

    return {
      stage: 'Stage 4: Structure Analysis',
      status: 'success',
      duration: Date.now() - startTime,
      data: {
        totalSections,
        totalLessons,
        hasAnalysisResult: true,
      },
    };
  } catch (error) {
    return {
      stage: 'Stage 4: Structure Analysis',
      status: 'failure',
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Stage 5: Structure Generation
 */
async function runStage5(courseId: string, orgId: string, userId: string): Promise<StageResult> {
  logStage('Stage 5: Structure Generation');
  const startTime = Date.now();

  try {
    const supabase = getSupabaseAdmin();

    // Get course data
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .single();

    if (courseError || !course) {
      throw new Error(`Failed to get course: ${courseError?.message}`);
    }

    log('Triggering structure generation job...', 'info');

    const jobData = {
      jobType: JobType.STRUCTURE_GENERATION,
      course_id: courseId,
      organization_id: orgId,
      user_id: userId,
      createdAt: new Date().toISOString(),
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

    log('Waiting for structure generation (generates 30+ lessons)...', 'info');
    const result = await waitForStatus(
      courseId,
      ['stage_5_awaiting_approval', 'stage_5_complete', 'completed'],
      TIMEOUTS.GENERATION
    );

    const structure = result.data.course_structure as Record<string, unknown> | undefined;
    const sections = (structure?.sections as unknown[]) || [];
    const lessonCount = sections.reduce(
      (sum: number, s: unknown) => sum + ((s as Record<string, unknown>).lessons as unknown[] || []).length,
      0
    );

    log(`Generation complete: ${sections.length} sections, ${lessonCount} lessons`, 'success');

    return {
      stage: 'Stage 5: Structure Generation',
      status: 'success',
      duration: Date.now() - startTime,
      data: {
        sectionCount: sections.length,
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
 * Stage 6: Lesson Content Generation
 */
async function runStage6(courseId: string, courseStructure: Record<string, unknown>): Promise<StageResult> {
  logStage(`Stage 6: Lesson Content Generation (${LESSONS_TO_GENERATE} lessons)`);
  const startTime = Date.now();

  try {
    // Collect all lessons from all sections
    const sections = (courseStructure.sections as unknown[]) || [];
    const allLessons: Array<{
      lesson: Record<string, unknown>;
      sectionTitle: string;
      sectionIndex: number;
      lessonIndex: number;
    }> = [];

    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const section = sections[sIdx] as Record<string, unknown>;
      const lessons = (section.lessons as unknown[]) || [];
      for (let lIdx = 0; lIdx < lessons.length; lIdx++) {
        allLessons.push({
          lesson: lessons[lIdx] as Record<string, unknown>,
          sectionTitle: section.title as string,
          sectionIndex: sIdx,
          lessonIndex: lIdx,
        });
      }
    }

    if (allLessons.length === 0) {
      throw new Error('No lessons found in course structure');
    }

    const lessonsToProcess = allLessons.slice(0, LESSONS_TO_GENERATE);
    log(`Found ${allLessons.length} total lessons, processing ${lessonsToProcess.length}`, 'info');

    const lessonResults: Array<Record<string, unknown>> = [];
    let totalTokens = 0;
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < lessonsToProcess.length; i++) {
      const { lesson, sectionTitle, sectionIndex, lessonIndex } = lessonsToProcess[i];
      const lessonStartTime = Date.now();

      log(`\n  [${i + 1}/${lessonsToProcess.length}] Generating: "${lesson.title}"`, 'info');
      log(`      Section: "${sectionTitle}" (${sectionIndex + 1}.${lessonIndex + 1})`, 'info');

      // Build LessonSpecificationV2
      const learningOutcomes = (lesson.learning_outcomes as string[]) || [];
      const topics = (lesson.topics as string[]) || [lesson.title as string];

      const lessonSpec: LessonSpecificationV2 = {
        lesson_id: (lesson.id as string) || uuidv4(),
        title: lesson.title as string,
        description: (lesson.description as string) || `Lesson about ${lesson.title}`,
        metadata: {
          target_audience: 'practitioner',
          tone: 'conversational-professional',
          compliance_level: 'standard',
          content_archetype: 'concept_explainer',
        },
        learning_objectives: learningOutcomes.map((lo: string, idx: number) => ({
          id: `LO-${idx + 1}`,
          objective: lo,
          bloom_level: 'understand' as const,
        })),
        intro_blueprint: {
          hook_strategy: 'question',
          hook_topic: lesson.title as string,
          key_learning_objectives: learningOutcomes.join(', '),
        },
        sections: topics.map((topic: string) => ({
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
          search_queries: [lesson.title as string],
          expected_chunks: 3,
        },
        estimated_duration_minutes: (lesson.duration_minutes as number) || 15,
        difficulty_level: 'intermediate',
      };

      const input: Stage6Input = {
        lessonSpec,
        courseId,
        ragChunks: [],
      };

      try {
        const result = await executeStage6(input);
        const lessonDuration = Date.now() - lessonStartTime;

        if (result.success) {
          successCount++;
          totalTokens += result.metrics.tokensUsed || 0;
          log(`      Success in ${(lessonDuration / 1000).toFixed(1)}s`, 'success');
          log(`      Model: ${result.metrics.modelUsed}`, 'info');
          log(`      Tokens: ${result.metrics.tokensUsed}`, 'info');
          log(`      Quality: ${result.metrics.qualityScore?.toFixed(2) || 'N/A'}`, 'info');
        } else {
          failureCount++;
          log(`      Failed: ${result.errors?.join(', ')}`, 'error');
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
          errors: result.errors,
        });
      } catch (error) {
        failureCount++;
        const lessonDuration = Date.now() - lessonStartTime;
        log(`      Error: ${error instanceof Error ? error.message : String(error)}`, 'error');

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

    log(`\nStage 6 Summary: ${successCount}/${lessonsToProcess.length} successful`, successCount > 0 ? 'success' : 'error');

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
  const now = new Date();

  report.push('# E2E Workflow Test Report\n');
  report.push(`**Generated**: ${now.toISOString()}`);
  report.push(`**Course ID**: \`${courseId}\``);
  report.push(`**Test Data**: \`${TEST_DATA_DIR}\``);
  report.push(`**Lessons Generated**: ${LESSONS_TO_GENERATE}`);
  report.push('');
  report.push('---\n');

  // Summary table
  report.push('## Summary\n');
  report.push('| Stage | Status | Duration |');
  report.push('|-------|--------|----------|');

  let totalDuration = 0;
  for (const result of allResults) {
    const statusIcon = {
      success: '✅',
      partial: '⚠️',
      failure: '❌',
      skipped: '⏭️',
    }[result.status];
    const duration = `${(result.duration / 1000).toFixed(1)}s`;
    report.push(`| ${result.stage} | ${statusIcon} ${result.status} | ${duration} |`);
    totalDuration += result.duration;
  }
  report.push(`| **Total** | - | **${(totalDuration / 1000).toFixed(1)}s** |`);
  report.push('');

  // Detailed results
  report.push('## Detailed Results\n');

  for (const result of allResults) {
    const statusIcon = {
      success: '✅',
      partial: '⚠️',
      failure: '❌',
      skipped: '⏭️',
    }[result.status];

    report.push(`### ${statusIcon} ${result.stage}\n`);
    report.push(`- **Status**: ${result.status}`);
    report.push(`- **Duration**: ${(result.duration / 1000).toFixed(1)}s`);

    if (result.error) {
      report.push(`- **Error**: \`${result.error}\``);
    }

    if (result.data) {
      report.push('\n**Details**:\n');
      report.push('```json');
      report.push(JSON.stringify(result.data, null, 2).slice(0, 2000));
      if (JSON.stringify(result.data).length > 2000) {
        report.push('... (truncated)');
      }
      report.push('```');
    }

    report.push('');
  }

  // Footer
  report.push('---\n');
  report.push(`*Report generated by E2E Workflow Test*`);
  report.push(`*Total execution time: ${(totalDuration / 1000 / 60).toFixed(1)} minutes*`);

  return report.join('\n');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  // Load modules dynamically after env is loaded
  await loadModules();

  console.log(`\n${colors.bright}${colors.cyan}${'═'.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}       E2E Workflow Test - Full 6-Stage Pipeline${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${'═'.repeat(60)}${colors.reset}\n`);

  log(`Test data: ${TEST_DATA_DIR}`, 'info');
  log(`Lessons to generate: ${LESSONS_TO_GENERATE}`, 'info');
  log(`Skip Stage 6: ${SKIP_STAGE6}`, 'info');

  const startTime = Date.now();
  const allResults: StageResult[] = [];

  try {
    // Verify test data exists
    if (!fs.existsSync(TEST_DATA_DIR)) {
      throw new Error(`Test data directory not found: ${TEST_DATA_DIR}`);
    }

    // Create test course
    log('\nCreating test course...', 'info');
    const supabase = getSupabaseAdmin();

    // Use hardcoded test user/org IDs (these exist in the database)
    const DEFAULT_TEST_ORG_ID = '9b98a7d5-27ea-4441-81dc-de79d488e5db';
    const DEFAULT_TEST_USER_ID = 'cea0fc30-5211-483c-b662-c9aeeba1dcba';

    let orgId = DEFAULT_TEST_ORG_ID;
    let userId = DEFAULT_TEST_USER_ID;

    // Try to verify user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, organization_id')
      .eq('id', DEFAULT_TEST_USER_ID)
      .single();

    if (existingUser) {
      orgId = existingUser.organization_id || DEFAULT_TEST_ORG_ID;
      userId = existingUser.id;
      log(`Using verified user: ${userId}`, 'success');
    } else {
      log('Using hardcoded test IDs', 'warn');
    }

    const courseId = uuidv4();
    const slug = 'e2e-test-' + courseId.slice(0, 8);

    // Create course with retry
    let course: Record<string, unknown> | null = null;
    let createError: Error | null = null;
    const MAX_RETRIES = 5;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const result = await supabase
        .from('courses')
        .insert({
          id: courseId,
          organization_id: orgId,
          user_id: userId,
          title: 'E2E Test - Synergy Sales Course',
          slug: slug,
          course_description: 'E2E Pipeline Test with Synergy sales documents',
          language: 'Russian',
          style: 'practical',
          generation_status: 'pending',
        })
        .select()
        .single();

      if (!result.error && result.data) {
        course = result.data as Record<string, unknown>;
        createError = null;
        break;
      }

      createError = new Error(result.error?.message || 'Unknown error');
      const isTransient = result.error?.message?.includes('Internal server error') ||
                          result.error?.message?.includes('503');

      if (!isTransient || attempt === MAX_RETRIES) {
        break;
      }

      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      log(`Retry ${attempt}/${MAX_RETRIES} in ${delay}ms...`, 'warn');
      await sleep(delay);
    }

    if (createError || !course) {
      throw new Error(`Failed to create course: ${createError?.message}`);
    }

    log(`Course created: ${courseId}`, 'success');

    // Run stages
    const stage1Result = await runStage1(courseId, orgId, userId);
    allResults.push(stage1Result);
    if (stage1Result.status === 'failure') throw new Error('Stage 1 failed');

    const stage2Result = await runStage2(courseId, orgId, userId);
    allResults.push(stage2Result);
    if (stage2Result.status === 'failure') throw new Error('Stage 2 failed');

    const stage3Result = await runStage3(courseId, orgId, userId);
    allResults.push(stage3Result);
    if (stage3Result.status === 'failure') {
      log('Stage 3 failed, continuing to Stage 4...', 'warn');
    }

    const stage4Result = await runStage4(courseId, orgId, userId);
    allResults.push(stage4Result);
    if (stage4Result.status === 'failure') throw new Error('Stage 4 failed');

    const stage5Result = await runStage5(courseId, orgId, userId);
    allResults.push(stage5Result);

    // Stage 6 (optional)
    if (!SKIP_STAGE6 && stage5Result.status === 'success' && stage5Result.data?.structure) {
      const stage6Result = await runStage6(courseId, stage5Result.data.structure as Record<string, unknown>);
      allResults.push(stage6Result);
    } else if (SKIP_STAGE6) {
      allResults.push({
        stage: 'Stage 6: Lesson Content Generation',
        status: 'skipped',
        duration: 0,
        data: { reason: 'Skipped via --skip-stage6 flag' },
      });
    } else {
      allResults.push({
        stage: 'Stage 6: Lesson Content Generation',
        status: 'skipped',
        duration: 0,
        error: 'Stage 5 failed or no course structure',
      });
    }

    // Generate report
    const report = generateReport(courseId, allResults);
    const reportFilename = `e2e-workflow-test-${Date.now()}.md`;
    const reportPath = path.join(OUTPUT_DIR, reportFilename);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(reportPath, report);

    // Print summary
    const totalDuration = Date.now() - startTime;
    console.log(`\n${colors.bright}${colors.cyan}${'═'.repeat(60)}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}                         RESULTS${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${'═'.repeat(60)}${colors.reset}\n`);

    for (const result of allResults) {
      const icon = {
        success: '✅',
        partial: '⚠️',
        failure: '❌',
        skipped: '⏭️',
      }[result.status];
      console.log(`${icon} ${result.stage}: ${result.status} (${(result.duration / 1000).toFixed(1)}s)`);
    }

    console.log(`\n📊 Total Duration: ${(totalDuration / 1000 / 60).toFixed(1)} minutes`);
    console.log(`📄 Report saved: ${reportPath}`);
    console.log(`🆔 Course ID: ${courseId}`);

  } catch (error) {
    console.error(`\n${colors.red}❌ Fatal error:${colors.reset}`, error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch(console.error);
