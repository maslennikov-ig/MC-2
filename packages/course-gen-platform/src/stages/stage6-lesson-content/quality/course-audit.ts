import type { LessonQualitySignals } from '@megacampus/shared-types/lesson-content';
import { countNonMermaidCodeBlocks } from '../judge/filters/structural-checks';

export interface CourseAuditLesson {
  lessonId: string;
  lessonLabel: string;
  markdown: string;
  targetAudience?: string | null;
  contentArchetype?: string | null;
  qaSignals?: Partial<LessonQualitySignals> | null;
}

export type CourseAuditFindingKind =
  | 'repeated_analogy_phrase'
  | 'repeated_exercise_prompt'
  | 'repeated_section_heading'
  | 'course_callout_anomaly'
  | 'course_code_block_anomaly'
  | 'technical_audience_drift';

export interface CourseAuditFinding {
  kind: CourseAuditFindingKind;
  severity: 'warn' | 'review_required';
  lessonIds: string[];
  lessonLabels: string[];
  detail: string;
}

export interface CourseAuditResult {
  findings: CourseAuditFinding[];
  affectedLessonIds: string[];
  perLessonFlags: Record<string, string[]>;
}

const ANALOGY_MARKERS = [/похож[а-я]* на/i, /как\b/i, /\blike\b/i, /similar to/i, /analogy/i];

const EXERCISE_HEADER_PATTERN = /^##\s+(упражнения|exercise|exercises|practice|практика)\s*$/gim;
const GENERIC_HEADERS = new Set([
  'введение',
  'introduction',
  'упражнения',
  'exercises',
  'practice',
  'digest',
  'lesson digest',
  'краткое содержание урока',
]);
const TECHNICAL_LEXICON = [
  'docker',
  'ldap',
  'smtp',
  'json',
  'python',
  'bash',
  'api',
  'yaml',
  'sql',
  'webhook',
  'config',
  'snippet',
];

function normalizeFingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildParagraphs(markdown: string): string[] {
  return markdown
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean);
}

function extractAnalogyCandidates(markdown: string): string[] {
  return buildParagraphs(markdown)
    .map(paragraph => paragraph.replace(/^##\s+.+$/gm, '').trim())
    .filter(paragraph => paragraph.split(/\s+/).length >= 8)
    .filter(paragraph => ANALOGY_MARKERS.some(pattern => pattern.test(paragraph)))
    .map(normalizeFingerprint);
}

function extractExerciseCandidates(markdown: string): string[] {
  const matches: string[] = [];
  const headerMatches = Array.from(markdown.matchAll(EXERCISE_HEADER_PATTERN));

  for (const match of headerMatches) {
    const start = match.index ?? 0;
    const afterHeader = markdown.slice(start + match[0].length);
    const nextHeaderIndex = afterHeader.search(/^##\s+/m);
    const sectionBody = (
      nextHeaderIndex === -1 ? afterHeader : afterHeader.slice(0, nextHeaderIndex)
    )
      .trim()
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 20 && !line.startsWith('###') && !line.startsWith('**'));
    for (const line of sectionBody) {
      matches.push(normalizeFingerprint(line));
    }
  }

  return matches;
}

function extractRepeatedHeadingCandidates(markdown: string): string[] {
  const headings = Array.from(markdown.matchAll(/^##\s+(.+)$/gm)).map(match =>
    normalizeFingerprint(match[1] ?? '')
  );
  return headings.filter(heading => heading.length > 0 && !GENERIC_HEADERS.has(heading));
}

function getCounter(
  lesson: CourseAuditLesson,
  key: keyof NonNullable<LessonQualitySignals['lesson_counters']>
): number {
  const counters = lesson.qaSignals?.lesson_counters;
  const explicit = counters?.[key];
  if (typeof explicit === 'number') {
    return explicit;
  }

  if (key === 'callout_count') {
    return Array.from(lesson.markdown.matchAll(/^>\s*\[!/gim)).length;
  }
  if (key === 'code_block_count') {
    return countNonMermaidCodeBlocks(lesson.markdown);
  }

  return 0;
}

/**
 * Fail-open design: when audience is unknown (null/empty), defaults to 'novice'
 * which triggers non-technical checks. This is intentionally conservative —
 * better to flag a false positive for review than to miss inappropriate content.
 */
function looksNonTechnicalAudience(lesson: CourseAuditLesson): boolean {
  const audience = `${lesson.targetAudience ?? ''}`.toLowerCase();
  if (lesson.contentArchetype === 'code_tutorial') {
    return false;
  }

  return /(novice|beginner|non-technical|business|hr|manager|менедж|hr)/i.test(
    audience || 'novice'
  );
}

function addFinding(
  findings: CourseAuditFinding[],
  perLessonFlags: Record<string, string[]>,
  finding: CourseAuditFinding,
  flag: string
): void {
  findings.push(finding);

  for (const lessonId of finding.lessonIds) {
    if (!perLessonFlags[lessonId]) {
      perLessonFlags[lessonId] = [];
    }
    if (!perLessonFlags[lessonId].includes(flag)) {
      perLessonFlags[lessonId].push(flag);
    }
  }
}

function collectDuplicateFindings(
  lessons: CourseAuditLesson[],
  extractor: (markdown: string) => string[],
  kind: Extract<CourseAuditFindingKind, 'repeated_analogy_phrase' | 'repeated_exercise_prompt'>
): CourseAuditFinding[] {
  const buckets = new Map<string, CourseAuditLesson[]>();

  for (const lesson of lessons) {
    const seenForLesson = new Set<string>();
    for (const candidate of extractor(lesson.markdown)) {
      if (candidate.length < 30 || seenForLesson.has(candidate)) {
        continue;
      }
      seenForLesson.add(candidate);
      const existing = buckets.get(candidate) ?? [];
      existing.push(lesson);
      buckets.set(candidate, existing);
    }
  }

  const findings: CourseAuditFinding[] = [];
  for (const [fingerprint, affectedLessons] of buckets.entries()) {
    if (affectedLessons.length < 2) {
      continue;
    }
    findings.push({
      kind,
      severity: 'review_required',
      lessonIds: affectedLessons.map(lesson => lesson.lessonId),
      lessonLabels: affectedLessons.map(lesson => lesson.lessonLabel),
      detail: fingerprint,
    });
  }

  return findings;
}

export function runCourseQualityAudit(lessons: CourseAuditLesson[]): CourseAuditResult {
  const findings: CourseAuditFinding[] = [];
  const perLessonFlags: Record<string, string[]> = {};

  for (const finding of collectDuplicateFindings(
    lessons,
    extractAnalogyCandidates,
    'repeated_analogy_phrase'
  )) {
    addFinding(findings, perLessonFlags, finding, 'course_repeated_analogy_phrase');
  }

  for (const finding of collectDuplicateFindings(
    lessons,
    extractExerciseCandidates,
    'repeated_exercise_prompt'
  )) {
    addFinding(findings, perLessonFlags, finding, 'course_repeated_exercise_prompt');
  }

  const headingBuckets = new Map<string, CourseAuditLesson[]>();
  for (const lesson of lessons) {
    const seen = new Set<string>();
    for (const heading of extractRepeatedHeadingCandidates(lesson.markdown)) {
      if (seen.has(heading)) {
        continue;
      }
      seen.add(heading);
      const bucket = headingBuckets.get(heading) ?? [];
      bucket.push(lesson);
      headingBuckets.set(heading, bucket);
    }
  }

  for (const [heading, affectedLessons] of headingBuckets.entries()) {
    if (affectedLessons.length < 3) {
      continue;
    }
    addFinding(
      findings,
      perLessonFlags,
      {
        kind: 'repeated_section_heading',
        severity: 'warn',
        lessonIds: affectedLessons.map(lesson => lesson.lessonId),
        lessonLabels: affectedLessons.map(lesson => lesson.lessonLabel),
        detail: heading,
      },
      'course_repeated_section_heading'
    );
  }

  const nonTechnicalLessons = lessons.filter(looksNonTechnicalAudience);
  const codeHeavyLessons = nonTechnicalLessons.filter(
    lesson => getCounter(lesson, 'code_block_count') >= 3
  );
  if (codeHeavyLessons.length >= 2) {
    addFinding(
      findings,
      perLessonFlags,
      {
        kind: 'course_code_block_anomaly',
        severity: 'review_required',
        lessonIds: codeHeavyLessons.map(lesson => lesson.lessonId),
        lessonLabels: codeHeavyLessons.map(lesson => lesson.lessonLabel),
        detail: `code-heavy lessons: ${codeHeavyLessons.map(lesson => lesson.lessonLabel).join(', ')}`,
      },
      'course_code_block_anomaly'
    );
  }

  const calloutHeavyLessons = lessons.filter(lesson => getCounter(lesson, 'callout_count') >= 4);
  if (calloutHeavyLessons.length >= 2) {
    addFinding(
      findings,
      perLessonFlags,
      {
        kind: 'course_callout_anomaly',
        severity: 'warn',
        lessonIds: calloutHeavyLessons.map(lesson => lesson.lessonId),
        lessonLabels: calloutHeavyLessons.map(lesson => lesson.lessonLabel),
        detail: `callout-heavy lessons: ${calloutHeavyLessons.map(lesson => lesson.lessonLabel).join(', ')}`,
      },
      'course_callout_anomaly'
    );
  }

  const technicalDriftLessons = nonTechnicalLessons.filter(lesson => {
    const normalized = normalizeFingerprint(lesson.markdown);
    const hits = TECHNICAL_LEXICON.filter(term => normalized.includes(term)).length;
    return hits >= 3;
  });
  if (technicalDriftLessons.length > 0) {
    addFinding(
      findings,
      perLessonFlags,
      {
        kind: 'technical_audience_drift',
        severity: 'warn',
        lessonIds: technicalDriftLessons.map(lesson => lesson.lessonId),
        lessonLabels: technicalDriftLessons.map(lesson => lesson.lessonLabel),
        detail: `technical lexicon concentration in ${technicalDriftLessons
          .map(lesson => lesson.lessonLabel)
          .join(', ')}`,
      },
      'course_technical_audience_drift'
    );
  }

  return {
    findings,
    affectedLessonIds: Array.from(new Set(findings.flatMap(finding => finding.lessonIds))),
    perLessonFlags,
  };
}
