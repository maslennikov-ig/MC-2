/**
 * Stage 3 Hardcoded Prompts - Document Classification (2 prompts)
 * @module shared/prompts/stage3-prompts
 *
 * Stage 3: Content Analysis
 * - Comparative classification (batch processing)
 * - Independent classification (fallback)
 */

import type { HardcodedPrompt } from './types.js';

// ============================================================================
// STAGE 3 PROMPTS (2 total)
// ============================================================================

export const stage3Prompts: HardcodedPrompt[] = [
  {
    stage: 'stage_3',
    promptKey: 'stage3_classification_comparative',
    promptName: 'Stage 3 - Comparative Document Classification',
    promptDescription:
      'Classifies ALL documents in a single LLM call using comparative ranking. Ensures proper distribution: exactly 1 CORE, up to 30% IMPORTANT, remaining SUPPLEMENTARY.',
    promptTemplate: `You are a document classification expert for educational content.

TASK: Classify ALL documents by their importance for course generation using COMPARATIVE ranking.

=== PRIORITY LEVELS ===
- CORE: The single most important document (exactly 1). Primary course material, syllabus, or technical specification.
- IMPORTANT: Key supporting documents (maximum {{maxImportant}} documents, ~30%). Content that significantly enhances course quality.
- SUPPLEMENTARY: Additional materials (remaining documents). Nice-to-have content, references, appendices.

=== STEP 1: IDENTIFY SIGNALS FOR EACH DOCUMENT ===

CORE SIGNALS (strong indicators - document is likely CORE):
□ Learning objectives ("By the end of...", "Students will...", "Цели обучения", "Компетенции")
□ Grading criteria, assessment weights, exam structure
□ Course schedule with dates and deadlines
□ "Required reading" or "обязательная литература"
□ Prerequisites listed
□ Filename contains: Syllabus, ТЗ, Техническое задание, Curriculum, Program, Программа курса

IMPORTANT SIGNALS (document should be IMPORTANT or higher):
□ Practice exercises, discussion questions, assignments
□ Case studies, worked examples
□ Lab guides, tutorial content, workshop materials
□ Chapter or lecture content with learning material

SUPPLEMENTARY SIGNALS (only these documents should be SUPPLEMENTARY):
□ "Optional", "recommended", "further reading", "дополнительно", "для самостоятельного изучения"
□ Bibliography, citation lists, references only
□ Appendix, glossary, index
□ Administrative documents without learning content

=== STEP 2: APPLY CLASSIFICATION RULES ===

1. DEFAULT UP NOT DOWN: When uncertain between categories, choose the HIGHER priority
2. Any document with learning objectives = CORE or IMPORTANT, NEVER SUPPLEMENTARY
3. SUPPLEMENTARY requires explicit "optional" indicators OR pure reference format (bibliography)
4. If filename contains ТЗ/Syllabus/Curriculum/Программа → MUST be CORE unless proven otherwise
5. Instructional content with exercises or examples → minimum IMPORTANT, never SUPPLEMENTARY

CRITICAL: Do NOT classify primary instructional content as SUPPLEMENTARY.

=== CONSTRAINTS (MUST FOLLOW) ===
- Exactly 1 document must be CORE (no more, no less)
- Maximum {{maxImportant}} documents can be IMPORTANT
- All remaining documents are SUPPLEMENTARY
- You must classify ALL {{totalDocuments}} documents provided

=== COURSE CONTEXT ===
Title: {{courseTitle}}
Description: {{courseDescription}}

=== DOCUMENTS TO CLASSIFY ({{totalDocuments}} total) ===
{{documentDescriptions}}

=== OUTPUT FORMAT ===
Return a JSON object with a "classifications" array containing ALL documents.
Each classification must have: id (UUID), priority (CORE/IMPORTANT/SUPPLEMENTARY), rationale (brief explanation referencing the signals found).`,
    variables: [
      {
        name: 'maxImportant',
        description: 'Maximum number of IMPORTANT documents (calculated as 30% of total)',
        required: true,
        example: '3',
      },
      {
        name: 'totalDocuments',
        description: 'Total number of documents to classify',
        required: true,
        example: '10',
      },
      {
        name: 'courseTitle',
        description: 'Course title for context',
        required: false,
        example: 'Introduction to React Hooks',
      },
      {
        name: 'courseDescription',
        description: 'Course description for context',
        required: false,
        example: 'Learn React Hooks fundamentals',
      },
      {
        name: 'documentDescriptions',
        description:
          'Formatted list of documents with ID, filename, file type, size, and content preview',
        required: true,
        example: '[Document 1]\nID: uuid\nFilename: syllabus.pdf\n...',
      },
    ],
  },
  {
    stage: 'stage_3',
    promptKey: 'stage3_classification_independent',
    promptName: 'Stage 3 - Independent Document Classification (Fallback)',
    promptDescription:
      'Classifies a single document independently (fallback for comparative classification failures). Returns HIGH (≥0.7) or LOW (<0.7) priority.',
    promptTemplate: `You are a document classification expert for educational content.

Your task is to analyze a document and classify it by importance for course generation.

CLASSIFICATION CRITERIA:

HIGH PRIORITY (importance_score >= 0.7):
- Primary course material (textbooks, syllabi, main lectures, course outlines)
- Critical reference documents (standards, specifications, key papers)
- Regulatory/compliance documents (laws, regulations, mandatory guidelines)
- Documents that are essential for understanding the core subject matter

LOW PRIORITY (importance_score < 0.7):
- Supplementary presentations (slides that repeat main content)
- Additional notes (non-essential supplementary information)
- Optional references (nice-to-have but not critical)
- Administrative documents (schedules, announcements)

COURSE CONTEXT:
Title: {{courseTitle}}
Description: {{courseDescription}}

DOCUMENT TO CLASSIFY:
Filename: {{filename}}
File Type: {{mimeType}}
File Size: {{fileSize}}

Content Preview:
{{contentPreview}}

---

OUTPUT FORMAT:
Respond with ONLY a JSON object (no markdown, no code blocks):
{
  "importance_score": <number 0.0-1.0>,
  "classification_rationale": "<brief explanation of classification decision>"
}

Be precise and consistent. The importance_score should reflect how critical this document is for generating high-quality course content.`,
    variables: [
      {
        name: 'courseTitle',
        description: 'Course title for context',
        required: false,
        example: 'Introduction to React Hooks',
      },
      {
        name: 'courseDescription',
        description: 'Course description for context',
        required: false,
        example: 'Learn React Hooks fundamentals',
      },
      {
        name: 'filename',
        description: 'Document filename',
        required: true,
        example: 'syllabus.pdf',
      },
      {
        name: 'mimeType',
        description: 'Document MIME type',
        required: true,
        example: 'application/pdf',
      },
      {
        name: 'fileSize',
        description: 'Document file size (formatted, e.g., "2.5 MB")',
        required: true,
        example: '2.5 MB',
      },
      {
        name: 'contentPreview',
        description: 'Document content preview or summary',
        required: true,
        example: 'Course Overview\n\nThis course covers...',
      },
    ],
  },
];
