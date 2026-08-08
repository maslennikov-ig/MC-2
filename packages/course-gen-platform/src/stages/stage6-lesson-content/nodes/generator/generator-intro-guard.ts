import { CONTENT_LABELS, validateLanguageCode } from '@megacampus/shared-types';

type IntroGuardIssueCode =
  | 'MISSING_INTRO_HEADER'
  | 'INTRO_NOT_FIRST_SECTION'
  | 'PREFACE_BEFORE_INTRO'
  | 'OVERSIZE_INTRO'
  | 'NEXT_LESSON_TEASER';

const INTRO_SECTION_MAX_WORDS = 170;
const INTRO_PREFACE_MAX_WORDS = 12;

export const INTRO_STRUCTURE_GUARD_ERROR_CODE = 'STAGE6_SINGLE_CALL_INTRO_STRUCTURE_GUARD_FAILED';

const INTRO_GUARD_INSTRUCTIONS: Record<IntroGuardIssueCode, string> = {
  MISSING_INTRO_HEADER:
    'Add the localized introduction header exactly as required before any intro text.',
  INTRO_NOT_FIRST_SECTION:
    'Make the localized introduction header the first level-2 section before any other section headers.',
  PREFACE_BEFORE_INTRO:
    'Remove substantial prose before the introduction section (keep only the optional lesson title line).',
  OVERSIZE_INTRO: `Shorten the intro to a concise opening (hard max ${INTRO_SECTION_MAX_WORDS} words).`,
  NEXT_LESSON_TEASER:
    'Remove teaser language about future lessons/sections and keep focus on this lesson only.',
};

type ContentLanguage = keyof typeof CONTENT_LABELS;

const NEXT_LESSON_TEASER_PATTERNS = {
  ru: [/(?:в|на)\s+следующ(?:ем|ей)\s+(?:уроке|разделе|главе)/iu],
  en: [
    /\bnext\s+lesson\b/iu,
    /\bin\s+the\s+next\s+(?:lesson|section|chapter)\b/iu,
    /\bcoming\s+up\b/iu,
    /\bstay\s+tuned\b/iu,
  ],
  zh: [/(?:在)?下(?:一|个)(?:课|节|章)(?:中|里)?/u],
  es: [/\ben\s+(?:la\s+próxima|el\s+próximo)\s+(?:lección|sección|capítulo)\b/iu],
  fr: [/\bdans\s+(?:la\s+prochaine\s+(?:leçon|section)|le\s+prochain\s+chapitre)\b/iu],
  de: [
    /\b(?:in\s+der\s+nächsten\s+(?:lektion|unterrichtseinheit)|im\s+nächsten\s+(?:abschnitt|kapitel))\b/iu,
  ],
  ja: [/次の?(?:レッスン|セクション|章)(?:で|では|に|には)/u],
  ko: [/다음\s*(?:수업|레슨|섹션|장)(?:에서|에서는|에|에는)/u],
  ar: [/في\s+(?:الدرس|القسم|الفصل)\s+(?:التالي|القادم)/u],
  pt: [/\b(?:na\s+próxima\s+(?:lição|seção)|no\s+próximo\s+capítulo)\b/iu],
  it: [/\b(?:nella\s+prossima\s+(?:lezione|sezione)|nel\s+prossimo\s+capitolo)\b/iu],
  tr: [/\b(?:bir\s+)?sonraki\s+(?:derste|bölümde|kısımda)\b/iu],
  vi: [/trong\s+(?:bài\s+học|phần|chương)\s+(?:tiếp\s+theo|sau)/iu],
  th: [/ใน(?:บทเรียน|ส่วน|บท)(?:ถัดไป|ต่อไป)/u],
  id: [/\bdi\s+(?:pelajaran|bagian|bab)\s+berikutnya\b/iu],
  ms: [/\bdalam\s+(?:pelajaran|bahagian|bab)\s+seterusnya\b/iu],
  hi: [/अगले\s+(?:पाठ|भाग|अध्याय)\s+में/u],
  bn: [/পরবর্তী\s+(?:পাঠ|অংশ|অধ্যায়)/u],
  pl: [/\bw\s+(?:następnej\s+lekcji|następnym\s+(?:rozdziale|dziale))\b/iu],
} satisfies Record<ContentLanguage, readonly RegExp[]>;

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function extractSectionBodyByHeader(markdown: string, header: string): string | null {
  const headerRegex = new RegExp(`^##\\s+${escapeRegex(header)}\\s*$`, 'im');
  const match = headerRegex.exec(markdown);

  if (!match || match.index === undefined) {
    return null;
  }

  const afterHeader = markdown.slice(match.index + match[0].length);
  const nextHeaderIndex = afterHeader.search(/^##\s+/m);
  return (nextHeaderIndex === -1 ? afterHeader : afterHeader.slice(0, nextHeaderIndex)).trim();
}

function containsNextLessonTeaser(
  introBody: string,
  nextLessonTitle: string | null | undefined,
  language: string
): boolean {
  const normalizedIntro = introBody.toLowerCase();

  if (nextLessonTitle) {
    const normalizedNextLessonTitle = nextLessonTitle.trim().toLowerCase();
    if (
      normalizedNextLessonTitle.length > 0 &&
      normalizedIntro.includes(normalizedNextLessonTitle)
    ) {
      return true;
    }
  }

  const normalizedLanguage = validateLanguageCode(language);
  return NEXT_LESSON_TEASER_PATTERNS[normalizedLanguage].some(pattern => pattern.test(introBody));
}

function normalizeHeaderTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function extractTopLevelHeaderTitles(markdown: string): string[] {
  const headers: string[] = [];
  const headerRegex = /^##\s+(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = headerRegex.exec(markdown)) !== null) {
    headers.push(match[1].trim());
  }

  return headers;
}

function extractPrefaceBeforeFirstSection(markdown: string): string {
  const firstH2Match = /^##\s+/m.exec(markdown);
  if (!firstH2Match || firstH2Match.index === undefined) {
    return '';
  }

  const beforeFirstSection = markdown.slice(0, firstH2Match.index);
  return beforeFirstSection
    .replace(/^#\s+.*$/m, '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function validateIntroStructure(
  markdown: string,
  introductionHeader: string,
  nextLessonTitle?: string | null,
  language = 'en'
): {
  issues: IntroGuardIssueCode[];
  introWordCount: number;
  prefaceWordCount: number;
} {
  const issues: IntroGuardIssueCode[] = [];
  const normalizedIntroHeader = normalizeHeaderTitle(introductionHeader);
  const sectionHeaders = extractTopLevelHeaderTitles(markdown).map(normalizeHeaderTitle);
  const introHeaderIndex = sectionHeaders.findIndex(header => header === normalizedIntroHeader);
  if (introHeaderIndex === -1) {
    issues.push('MISSING_INTRO_HEADER');
  } else if (introHeaderIndex !== 0) {
    issues.push('INTRO_NOT_FIRST_SECTION');
  }

  const prefaceWordCount = countWords(extractPrefaceBeforeFirstSection(markdown));
  if (prefaceWordCount > INTRO_PREFACE_MAX_WORDS) {
    issues.push('PREFACE_BEFORE_INTRO');
  }

  const introBody = extractSectionBodyByHeader(markdown, introductionHeader);
  if (introBody === null) {
    return {
      issues: issues.length > 0 ? issues : ['MISSING_INTRO_HEADER'],
      introWordCount: 0,
      prefaceWordCount,
    };
  }

  const introWordCount = countWords(introBody);
  if (introWordCount > INTRO_SECTION_MAX_WORDS) {
    issues.push('OVERSIZE_INTRO');
  }
  if (containsNextLessonTeaser(introBody, nextLessonTitle, language)) {
    issues.push('NEXT_LESSON_TEASER');
  }

  return {
    issues,
    introWordCount,
    prefaceWordCount,
  };
}

export function buildIntroCorrectivePrompt(
  originalPrompt: string,
  generatedDraft: string,
  introductionHeader: string,
  outputLanguage: string,
  issues: IntroGuardIssueCode[]
): string {
  const issueLines = issues
    .map(issue => `- ${issue}: ${INTRO_GUARD_INSTRUCTIONS[issue]}`)
    .join('\n');

  return `${originalPrompt}

<intro_repair_pass>
The current draft failed the introduction structure guard.
Repair the draft and return the FULL lesson markdown.

Issue codes to fix:
${issueLines}

Hard constraints:
- The intro header must be exactly: ## ${introductionHeader}
- The intro section must be the FIRST level-2 section in the lesson
- Do not include substantial prose before the intro header (keep only optional # title line)
- Keep introduction concise (target 80-140 words, hard max ${INTRO_SECTION_MAX_WORDS})
- Do NOT tease future lessons or sections
- Do NOT preview or enumerate techniques/topics that belong to later sections
- Keep all non-intro sections unchanged unless a minimal transition edit is required

Return the full corrected lesson in ${outputLanguage}.
</intro_repair_pass>

<current_draft>
${generatedDraft}
</current_draft>`;
}
