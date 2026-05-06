/**
 * Claim extraction and evidence analysis for factual verification
 * @module stages/stage6-lesson-content/judge/claim-extraction
 *
 * Extracted from factual-verifier.ts to comply with max-lines rule.
 *
 * Contains:
 * - Factual claim pattern matching (English + Russian)
 * - Markdown preprocessing for claim extraction
 * - Sentence splitting and claim identification
 * - RAG-based evidence analysis and claim verification
 */

import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import type { EntropyAnalysisResult } from './entropy-detector';
import { logger } from '@/shared/logger';
import type {
  FactualClaimDiagnostics,
  FactualVerificationConfig,
  VerificationClaim,
  VerificationStatus,
} from './factual-verifier';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Weights for different verification statuses when calculating accuracy score
 */
export const VERIFICATION_WEIGHTS: Record<VerificationStatus, number> = {
  verified: 1.0,
  no_evidence: 0.5, // Neutral - no evidence to support or contradict
  unverified: 0.3, // Low confidence, potential issue
  contradicted: 0.0, // Clear factual error
};

/**
 * Patterns for identifying factual claims (English + Russian)
 */
const FACTUAL_CLAIM_PATTERNS: RegExp[] = [
  // ==========================================================================
  // ENGLISH PATTERNS
  // ==========================================================================

  // Dates and years (English)
  /\b(in|during|since|from|until|by)\s+\d{4}\b/gi,
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi,

  // Numeric facts and statistics (English)
  /\b\d+(?:\.\d+)?%\b/g,
  /\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:million|billion|trillion|thousand|hundred)\b/gi,
  /\bapproximately\s+\d+/gi,
  /\babout\s+\d+/gi,

  // Named entities and technical terms (English)
  /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g, // Proper names (FirstName LastName)
  /\b(?:Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s+[A-Z][a-z]+/g, // Titles with names

  // Definitive statements (English)
  /\bis\s+(?:the\s+)?(?:first|last|only|largest|smallest|most|least)\b/gi,
  /\bwas\s+(?:the\s+)?(?:first|last|only|largest|smallest|most|least)\b/gi,
  /\baccording\s+to\b/gi,
  /\bstudies\s+(?:show|have shown|indicate|suggest)\b/gi,
  /\bresearch\s+(?:shows|indicates|suggests|demonstrates)\b/gi,

  // ==========================================================================
  // RUSSIAN PATTERNS
  // ==========================================================================

  // Dates and years (Russian) - "в 2024 году", "с 2020 года"
  /\b[вВ]\s+\d{4}\s+году?\b/g,
  /\b[сС]\s+\d{4}\s+года?\b/g,
  /\b[дД]о\s+\d{4}\s+года?\b/g,

  // Russian months with dates - "15 января 2024", "март 2023"
  /\b\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{4}\b/gi,
  /\b(?:январь|февраль|март|апрель|май|июнь|июль|август|сентябрь|октябрь|ноябрь|декабрь)\s+\d{4}\b/gi,

  // Numeric facts (Russian) - "около 50%", "примерно 100"
  /\b(?:около|примерно|приблизительно|более|менее|свыше|порядка)\s+\d+/gi,
  /\b\d+(?:[.,]\d+)?\s*(?:миллион|миллиард|тысяч|процент)/gi,

  // Statistics (Russian) - "по данным", "согласно исследованиям"
  /\b(?:по данным|согласно|по статистике|по результатам)\b/gi,
  /\b(?:исследования|статистика|опросы?)\s+(?:показыва|свидетельству|демонстриру)/gi,

  // Definitive statements (Russian) - "является первым", "самый большой"
  /\b(?:является|был[аои]?|стал[аои]?)\s+(?:первым?|последним?|единственным?|крупнейшим?|наибольшим?)\b/gi,
  /\b(?:самый|наиболее|наименее)\s+\w+/gi,

  // Russian named entities - Cyrillic capitalized words (approximation)
  /\b[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\b/g, // Russian proper names
];

// ============================================================================
// CLAIM EXTRACTION
// ============================================================================

/**
 * Preprocess Markdown content to extract clean text for claim extraction
 */
function preprocessMarkdownForClaims(markdown: string): string {
  let text = markdown;

  // Remove code blocks (including mermaid, language-specific)
  text = text.replace(/```[\s\S]*?```/g, ' ');
  // Remove inline code
  text = text.replace(/`[^`]+`/g, ' ');
  // Remove images
  text = text.replace(/!\[.*?\]\(.*?\)/g, ' ');
  // Remove links but keep text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Remove headers (keep the text after #)
  text = text.replace(/^#{1,6}\s*/gm, '');
  // Remove callout syntax but keep content
  text = text.replace(/>\s*\[!(NOTE|TIP|WARNING|DANGER|INFO|IMPORTANT|CAUTION)\]\s*/gi, '');
  // Remove blockquote markers
  text = text.replace(/^>\s*/gm, '');
  // Remove horizontal rules
  text = text.replace(/^[-*_]{3,}\s*$/gm, '');
  // Remove list markers
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+\.\s+/gm, '');
  // Remove bold/italic markers
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  // Remove table syntax (keep cell content)
  text = text.replace(/\|/g, ' ');
  text = text.replace(/^[-:|\s]+$/gm, '');
  // Collapse multiple whitespace
  text = text.replace(/\s+/g, ' ');
  // Collapse multiple newlines
  text = text.replace(/\n{2,}/g, '\n');

  return text.trim();
}

/**
 * Split content into sentences
 */
export function splitIntoSentences(content: string): { text: string; index: number }[] {
  const cleanContent = preprocessMarkdownForClaims(content);
  const sentencePattern = /[^.!?]+[.!?]+(?:\s+|$)|[^.!?\n]+(?:\n|$)/g;
  const matches = cleanContent.match(sentencePattern) || [];

  return matches
    .map((text, index) => ({
      text: text.trim(),
      index,
    }))
    .filter(({ text }) => text.length > 0);
}

/**
 * Check if a sentence contains a factual claim
 */
function containsFactualClaim(sentence: string): boolean {
  if (/условн|гипотетическ|hypothetical|illustrative/i.test(sentence)) {
    return false;
  }

  return FACTUAL_CLAIM_PATTERNS.some(pattern => {
    pattern.lastIndex = 0;
    return pattern.test(sentence);
  });
}

/**
 * Get entropy score for a sentence based on entropy analysis
 */
function getSentenceEntropyScore(
  sentenceIndex: number,
  entropyResult?: EntropyAnalysisResult
): number {
  if (!entropyResult || entropyResult.flaggedSpans.length === 0) {
    return 0;
  }

  const sentenceSpans = entropyResult.flaggedSpans.filter(
    span => span.sentenceIndex === sentenceIndex
  );

  if (sentenceSpans.length === 0) {
    return 0;
  }

  const totalEntropy = sentenceSpans.reduce((sum, span) => sum + span.averageEntropy, 0);
  return totalEntropy / sentenceSpans.length;
}

/**
 * Extract verifiable claims from content
 */
export function extractVerifiableClaims(
  content: string,
  entropyResult?: EntropyAnalysisResult,
  config?: FactualVerificationConfig
): Omit<VerificationClaim, 'ragEvidence' | 'verificationStatus' | 'confidence'>[] {
  const effectiveConfig = config ?? {
    entropyThreshold: 2.0,
    ragChunkLimit: 10,
    minConfidence: 0.7,
    strictMode: false,
    alwaysVerify: true,
  };

  const sentences = splitIntoSentences(content);
  const claims: Omit<VerificationClaim, 'ragEvidence' | 'verificationStatus' | 'confidence'>[] = [];

  for (const { text, index } of sentences) {
    if (text.length < 20) {
      continue;
    }

    const hasFactualPattern = containsFactualClaim(text);
    if (!hasFactualPattern) {
      continue;
    }

    const entropyScore = getSentenceEntropyScore(index, entropyResult);

    if (!effectiveConfig.strictMode && entropyResult) {
      const shouldInclude = entropyScore >= effectiveConfig.entropyThreshold || entropyScore === 0;
      if (!shouldInclude) {
        continue;
      }
    }

    claims.push({
      text,
      sentenceIndex: index,
      entropyScore,
    });
  }

  logger.debug({
    msg: 'Extracted verifiable claims',
    totalSentences: sentences.length,
    claimsFound: claims.length,
    strictMode: effectiveConfig.strictMode,
    hasEntropyData: !!entropyResult,
  });

  return claims;
}

// ============================================================================
// RAG VERIFICATION
// ============================================================================

/**
 * Calculate simple keyword overlap for semantic similarity
 */
export function calculateKeywordSimilarity(text1: string, text2: string): number {
  const tokenize = (text: string): Set<string> => {
    const words = text
      .toLowerCase()
      .replace(/[#*_~`[\](){}|\\<>!@$%^&=+;:'",.?/\-—–]+/g, ' ')
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
    return new Set(words);
  };

  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);

  if (tokens1.size === 0 || tokens2.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of tokens1) {
    if (tokens2.has(token)) {
      intersection++;
    }
  }

  const union = new Set([...tokens1, ...tokens2]).size;
  return union > 0 ? intersection / union : 0;
}

type NumberedFact = {
  raw: string;
  value: number;
  unit: string;
  unitFamily: string;
};

const NUMERIC_UNIT_PATTERN =
  /\d+(?:[.,]\d+)?\s*(?:%|процент(?:а|ов)?|день|дня|дней|сут(?:ки|ок)|час(?:а|ов)?|минут(?:а|ы)?|руб(?:ль|ля|лей)?|₽|млн|миллион(?:а|ов)?|тыс(?:яч[аи])?|thousand|million|billion|day|days|hour|hours|minute|minutes|rubles?|usd|dollars?)/giu;

const CYRILLIC_STOPWORDS = new Set([
  'это',
  'как',
  'для',
  'или',
  'при',
  'что',
  'чем',
  'его',
  'она',
  'они',
  'если',
  'когда',
  'после',
  'перед',
  'без',
  'над',
  'под',
  'между',
  'который',
  'которая',
  'которые',
]);

function normalizeNumericValue(raw: string): number {
  return Number.parseFloat(raw.replace(',', '.'));
}

function normalizeUnitFamily(unit: string): string {
  const normalized = unit.toLowerCase();
  if (normalized === '%' || normalized.startsWith('процент')) return 'percent';
  if (/^день|^дня|^дней|^сут|^day/.test(normalized)) return 'days';
  if (/^час|^hour/.test(normalized)) return 'hours';
  if (/^минут|^minute/.test(normalized)) return 'minutes';
  if (
    normalized.includes('руб') ||
    normalized === '₽' ||
    normalized === 'млн' ||
    normalized.startsWith('миллион') ||
    normalized.startsWith('тыс') ||
    normalized === 'usd' ||
    normalized.startsWith('dollar')
  ) {
    return 'money';
  }
  if (normalized === 'thousand' || normalized === 'million' || normalized === 'billion') {
    return normalized;
  }
  return normalized;
}

export function extractNumberedFacts(text: string): NumberedFact[] {
  const facts: NumberedFact[] = [];
  for (const match of text.matchAll(NUMERIC_UNIT_PATTERN)) {
    const raw = match[0].trim();
    const valueMatch = raw.match(/\d+(?:[.,]\d+)?/);
    if (!valueMatch) continue;

    const unit = raw.slice(valueMatch[0].length).trim();
    facts.push({
      raw,
      value: normalizeNumericValue(valueMatch[0]),
      unit,
      unitFamily: normalizeUnitFamily(unit),
    });
  }
  return facts;
}

function stripNumberedFacts(text: string): string {
  return text.replace(NUMERIC_UNIT_PATTERN, ' ');
}

function findNumericMismatch(
  claim: string,
  evidence: RAGChunk[]
): { claimFact: NumberedFact; evidenceFact: NumberedFact; chunk: RAGChunk } | null {
  const claimFacts = extractNumberedFacts(claim);
  if (claimFacts.length === 0) return null;

  const claimWithoutNumbers = stripNumberedFacts(claim);

  for (const chunk of evidence) {
    const lexicalSimilarity = calculateKeywordSimilarity(
      claimWithoutNumbers,
      stripNumberedFacts(chunk.content)
    );

    if (lexicalSimilarity < 0.08) continue;

    const evidenceFacts = extractNumberedFacts(chunk.content);
    for (const claimFact of claimFacts) {
      for (const evidenceFact of evidenceFacts) {
        if (claimFact.unitFamily !== evidenceFact.unitFamily) continue;
        if (Math.abs(claimFact.value - evidenceFact.value) < 0.0001) continue;

        return { claimFact, evidenceFact, chunk };
      }
    }
  }

  return null;
}

/**
 * Find relevant RAG chunks for a claim
 */
export function findRelevantChunks(
  claim: string,
  ragChunks: RAGChunk[],
  limit: number
): RAGChunk[] {
  if (ragChunks.length === 0) {
    return [];
  }

  const scoredChunks = ragChunks.map(chunk => ({
    chunk,
    similarity: calculateKeywordSimilarity(claim, chunk.content),
  }));

  const topSimilarities = scoredChunks
    .map(sc => sc.similarity)
    .sort((a, b) => b - a)
    .slice(0, 3);

  if (topSimilarities[0] > 0) {
    logger.debug({
      msg: 'Claim-chunk similarity scores',
      claimPreview: claim.slice(0, 50),
      topSimilarities: topSimilarities.map(s => s.toFixed(3)),
      totalChunks: ragChunks.length,
    });
  }

  return scoredChunks
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .filter(sc => sc.similarity > 0.05)
    .map(sc => sc.chunk);
}

/**
 * Analyze evidence to determine verification status
 */
export function analyzeEvidence(
  claim: string,
  evidence: RAGChunk[]
): { status: VerificationStatus; confidence: number; diagnostics?: FactualClaimDiagnostics } {
  if (evidence.length === 0) {
    return { status: 'no_evidence', confidence: 0.5 };
  }

  const numericMismatch = findNumericMismatch(claim, evidence);
  if (numericMismatch) {
    const { claimFact, evidenceFact, chunk } = numericMismatch;
    return {
      status: 'contradicted',
      confidence: 0.9,
      diagnostics: {
        mismatchReason: `Numeric mismatch: claim has ${claimFact.raw}, evidence has ${evidenceFact.raw}`,
        matchedEvidenceChunkIds: [chunk.chunk_id],
        evidencePreview: chunk.content.slice(0, 240),
      },
    };
  }

  const extractKeyTerms = (text: string): string[] => {
    const terms: string[] = [];
    const numbers = text.match(/\d+(?:\.\d+)?%?/g);
    if (numbers) terms.push(...numbers);
    const properNouns = text.match(/(?<!^|\. )[A-Z][a-z]+/g);
    if (properNouns) terms.push(...properNouns);
    const years = text.match(/\b(19|20)\d{2}\b/g);
    if (years) terms.push(...years);
    const cyrillicTerms = text
      .toLowerCase()
      .match(/\b[а-яё]{4,}\b/giu)
      ?.filter(term => !CYRILLIC_STOPWORDS.has(term));
    if (cyrillicTerms) terms.push(...cyrillicTerms.slice(0, 12));
    return terms;
  };

  const claimTerms = extractKeyTerms(claim);
  let supportCount = 0;
  let contradictCount = 0;
  let totalRelevance = 0;

  for (const chunk of evidence) {
    const chunkLower = chunk.content.toLowerCase();
    let matchingTerms = 0;
    for (const term of claimTerms) {
      if (chunk.content.includes(term) || chunkLower.includes(term.toLowerCase())) {
        matchingTerms++;
      }
    }

    if (matchingTerms > 0) {
      totalRelevance += chunk.relevance_score;
      const hasContradiction =
        (chunkLower.includes('not') || chunkLower.includes("n't")) &&
        calculateKeywordSimilarity(claim, chunk.content) > 0.2;
      const hasSupport = matchingTerms >= Math.min(2, claimTerms.length * 0.5);

      if (hasContradiction) {
        contradictCount++;
      } else if (hasSupport) {
        supportCount++;
      }
    }
  }

  if (contradictCount > supportCount && contradictCount > 0) {
    return {
      status: 'contradicted',
      confidence: Math.min(0.9, (contradictCount / evidence.length) * 0.8 + totalRelevance * 0.2),
    };
  }

  if (supportCount > 0) {
    const confidence = Math.min(
      0.95,
      (supportCount / evidence.length) * 0.7 + totalRelevance * 0.3
    );
    return {
      status: confidence >= 0.7 ? 'verified' : 'unverified',
      confidence,
    };
  }

  return {
    status: 'unverified',
    confidence: 0.4,
  };
}

/**
 * Verify a single claim against RAG context
 */
export function verifyClaimWithRAG(
  claim: string,
  ragChunks: RAGChunk[],
  config?: FactualVerificationConfig
): {
  ragEvidence: RAGChunk[];
  verificationStatus: VerificationStatus;
  confidence: number;
  diagnostics?: FactualClaimDiagnostics;
} {
  const effectiveConfig = config ?? {
    entropyThreshold: 2.0,
    ragChunkLimit: 10,
    minConfidence: 0.7,
    strictMode: false,
    alwaysVerify: true,
  };

  const relevantChunks = findRelevantChunks(claim, ragChunks, effectiveConfig.ragChunkLimit);

  if (relevantChunks.length === 0) {
    logger.debug({
      msg: 'No relevant RAG chunks found for claim',
      claimPreview: claim.slice(0, 100),
    });
    return {
      ragEvidence: [],
      verificationStatus: 'no_evidence',
      confidence: 0.5,
    };
  }

  const { status, confidence, diagnostics } = analyzeEvidence(claim, relevantChunks);

  const finalStatus: VerificationStatus =
    status === 'verified' && confidence < effectiveConfig.minConfidence ? 'unverified' : status;

  logger.debug({
    msg: 'Claim verification complete',
    claimPreview: claim.slice(0, 100),
    status: finalStatus,
    confidence: confidence.toFixed(3),
    evidenceChunks: relevantChunks.length,
  });

  return {
    ragEvidence: relevantChunks,
    verificationStatus: finalStatus,
    confidence,
    diagnostics,
  };
}
