/**
 * Types for LLM Benchmark System
 * @module scripts/benchmark-llm/types
 */

/**
 * Quality tier based on overall score
 */
export type QualityTier = 'S' | 'A' | 'B' | 'C' | 'D';

/**
 * Heuristic filter weights from stage6-lesson-content/judge/heuristic-filter.ts
 */
export const FILTER_WEIGHTS = {
  wordCount: 0.07,
  fleschKincaid: 0.08,
  sections: 0.07,
  keywordCoverage: 0.07,
  contentDensity: 0.05,
  markdownStructure: 0.1,
  learningObjectiveCoverage: 0.07,
  prohibitedTerms: 0.05,
  promptMarkers: 0.15, // CRITICAL
  languageConsistency: 0.12, // CRITICAL
  mermaidSyntax: 0.08,
  sectionDuplication: 0.09,
} as const;

/**
 * Individual test run data (from JSON files)
 */
export interface TestRunData {
  scenario: string;
  runNumber: number;
  language: 'en' | 'ru';
  schemaScore: number;
  contentScore: number;
  languageScore: number;
  overallScore: number;
  issues: string[];
  isError: boolean;
  errorMessage?: string;
  heuristicResult?: Record<string, unknown>;
}

/**
 * Model benchmark data (aggregated)
 */
export interface ModelBenchmark {
  modelSlug: string;
  modelName: string;
  provider: string;
  testDate: Date;
  testVersion: string;
  overallQualityScore: number;
  contentQualityScore: number;
  schemaComplianceScore: number;
  languageQualityScore: number;
  heuristicScores: Record<string, number>;
  totalIssues: number;
  criticalIssues: number;
  errorRate: number;
  qualityTier: QualityTier;
  rawResultsPath: string;
  runs: TestRunData[];
}

/**
 * Format A: Old format with nested scenarios (kimi-k2-0905)
 */
export interface QualityAnalysisFormatA {
  model: string;
  timestamp: string;
  scenarios: Record<
    string,
    Array<{
      schemaScore: number;
      contentScore: number;
      languageScore: number;
      overallScore: number;
      details: string[];
      issues: string[];
    }>
  >;
  summary: {
    metadataAvg: number;
    lessonAvg: number;
    overallAvg: number;
    tier: string;
  };
}

/**
 * Format B: New format with analyses array (deepseek-v32-exp)
 */
export interface QualityAnalysisFormatB {
  model: string;
  modelSlug: string;
  timestamp: string;
  overallQuality: number;
  metadataQuality: number;
  lessonQuality: number;
  analyses: Array<{
    scenario: string;
    runNumber: number;
    schemaScore: { score: number } | number;
    contentScore: number;
    languageScore: number;
    overallScore: number;
    issues: string[];
  }>;
}

/**
 * Leaderboard entry for display
 */
export interface LeaderboardEntry {
  rank: number;
  modelSlug: string;
  modelName: string;
  provider: string;
  qualityTier: QualityTier;
  overallScore: number;
  contentScore: number;
  schemaScore: number;
  languageScore: number;
  errorRate: number;
  testDate: string;
}

/**
 * Calculate quality tier from overall score
 */
export function calculateQualityTier(score: number): QualityTier {
  if (score >= 0.95) return 'S';
  if (score >= 0.85) return 'A';
  if (score >= 0.75) return 'B';
  if (score >= 0.6) return 'C';
  return 'D';
}

/**
 * Extract provider from model slug
 */
export function extractProvider(modelSlug: string): string {
  // Common patterns: deepseek-xxx, qwen-xxx, kimi-xxx, grok-xxx, etc.
  const slug = modelSlug.toLowerCase();
  if (slug.includes('deepseek')) return 'deepseek';
  if (slug.includes('qwen')) return 'alibaba';
  if (slug.includes('kimi')) return 'moonshot';
  if (slug.includes('grok')) return 'xai';
  if (slug.includes('glm')) return 'zhipu';
  if (slug.includes('minimax')) return 'minimax';
  if (slug.includes('oss')) return 'openai';
  return 'unknown';
}

/**
 * Convert model slug to human-readable name
 */
export function slugToName(modelSlug: string): string {
  const nameMap: Record<string, string> = {
    'deepseek-chat-v31': 'DeepSeek Chat v3.1',
    'deepseek-v32-exp': 'DeepSeek v3.2 Exp',
    'kimi-k2-0905': 'Kimi K2 0905',
    'kimi-k2-thinking': 'Kimi K2 Thinking',
    'qwen3-235b-a22b': 'Qwen3 235B A22B',
    'qwen3-235b-thinking': 'Qwen3 235B Thinking',
    'qwen3-32b': 'Qwen3 32B',
    'grok-4-fast': 'Grok 4 Fast',
    'glm-46': 'GLM-4 6B',
    'minimax-m2': 'MiniMax M2',
    'oss-120b': 'OSS 120B',
  };
  return nameMap[modelSlug] || modelSlug;
}
