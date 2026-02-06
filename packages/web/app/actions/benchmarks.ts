'use server'

import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database.generated'

type LeaderboardRow = Database['public']['Views']['llm_model_leaderboard']['Row']
type BenchmarkRow = Database['public']['Tables']['llm_model_benchmarks']['Row']

export interface BenchmarkData {
  modelSlug: string
  modelName: string
  provider: string
  qualityTier: 'S' | 'A' | 'B' | 'C' | 'D'
  overallQualityScore: number
  contentQualityScore: number
  schemaComplianceScore: number
  languageQualityScore: number
  totalIssues: number
  criticalIssues: number
  errorRate: number
  testDate: string
  testVersion: string
}

export interface ScenarioResult {
  scenario: string
  runNumber: number
  language: string
  schemaScore: number
  contentScore: number
  languageScore: number
  overallScore: number
  isError: boolean
  errorMessage?: string | null
}

interface BenchmarksParams {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  provider?: string
  tier?: string
  scenario?: string
  testDate?: string
  limit?: number
  offset?: number
}

function transformRow(row: LeaderboardRow | BenchmarkRow): BenchmarkData {
  return {
    modelSlug: row.model_slug ?? '',
    modelName: row.model_name ?? '',
    provider: row.provider ?? '',
    qualityTier: (row.quality_tier ?? 'D') as BenchmarkData['qualityTier'],
    overallQualityScore: Number(row.overall_quality_score ?? 0),
    contentQualityScore: Number(row.content_quality_score ?? 0),
    schemaComplianceScore: Number(row.schema_compliance_score ?? 0),
    languageQualityScore: Number(row.language_quality_score ?? 0),
    totalIssues: row.total_issues ?? 0,
    criticalIssues: row.critical_issues ?? 0,
    errorRate: Number(row.error_rate ?? 0),
    testDate: row.test_date ?? '',
    testVersion: row.test_version ?? '',
  }
}

// Map frontend field names to database column names
const COLUMN_MAP: Record<string, string> = {
  modelSlug: 'model_slug',
  modelName: 'model_name',
  provider: 'provider',
  qualityTier: 'quality_tier',
  overallQualityScore: 'overall_quality_score',
  contentQualityScore: 'content_quality_score',
  schemaComplianceScore: 'schema_compliance_score',
  languageQualityScore: 'language_quality_score',
  totalIssues: 'total_issues',
  criticalIssues: 'critical_issues',
  errorRate: 'error_rate',
  testDate: 'test_date',
  testVersion: 'test_version',
}

export async function getBenchmarksAction(params: BenchmarksParams = {}): Promise<{
  benchmarks: BenchmarkData[]
  totalCount: number
}> {
  const {
    sortBy = 'overallQualityScore',
    sortOrder = 'desc',
    provider,
    tier,
    scenario,
    testDate,
    limit = 20,
    offset = 0,
  } = params

  const supabase = await createClient()

  // If filtering by scenario or testDate, query llm_model_benchmarks directly
  // Otherwise use the leaderboard view for performance
  const useDirectQuery = (scenario && scenario !== 'all') || (testDate && testDate !== 'all')

  const dbColumn = COLUMN_MAP[sortBy] || 'overall_quality_score'

  if (useDirectQuery) {
    // Query llm_model_benchmarks table directly with filters
    let query = supabase.from('llm_model_benchmarks').select('*', { count: 'exact' })

    if (scenario && scenario !== 'all') {
      const { data: runData } = await supabase
        .from('llm_benchmark_runs')
        .select('benchmark_id')
        .eq('scenario', scenario)

      if (runData && runData.length > 0) {
        const benchmarkIds = runData.map((r) => r.benchmark_id)
        query = query.in('id', benchmarkIds)
      } else {
        return { benchmarks: [], totalCount: 0 }
      }
    }

    if (testDate && testDate !== 'all') {
      query = query.eq('test_date', testDate)
    }

    if (provider && provider !== 'all') {
      query = query.eq('provider', provider)
    }

    if (tier && tier !== 'all') {
      query = query.eq('quality_tier', tier)
    }

    const { data, error, count } = await query
      .order(dbColumn, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Failed to fetch benchmarks:', error)
      throw new Error(`Failed to fetch benchmarks: ${error.message}`)
    }

    return {
      benchmarks: (data || []).map(transformRow),
      totalCount: count || 0,
    }
  }

  // Use the optimized leaderboard view
  let query = supabase.from('llm_model_leaderboard').select('*', { count: 'exact' })

  if (provider && provider !== 'all') {
    query = query.eq('provider', provider)
  }

  if (tier && tier !== 'all') {
    query = query.eq('quality_tier', tier)
  }

  const { data, error, count } = await query
    .order(dbColumn, { ascending: sortOrder === 'asc' })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('Failed to fetch benchmarks:', error)
    throw new Error(`Failed to fetch benchmarks: ${error.message}`)
  }

  return {
    benchmarks: (data || []).map(transformRow),
    totalCount: count || 0,
  }
}

export async function getTopModelsAction(): Promise<BenchmarkData[]> {
  const result = await getBenchmarksAction({ limit: 3 })
  return result.benchmarks
}

export async function getProvidersAction(): Promise<string[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('llm_model_leaderboard')
    .select('provider')
    .order('provider')

  if (error) {
    console.error('Failed to fetch providers:', error)
    return []
  }

  const providers: string[] = Array.from(
    new Set((data || []).map((row) => row.provider).filter((p): p is string => p !== null))
  )
  return providers
}

export async function getLatestTestDateAction(): Promise<string | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('llm_model_leaderboard')
    .select('test_date')
    .order('test_date', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    return null
  }

  return data.test_date
}

export async function getScenariosAction(): Promise<string[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('llm_benchmark_runs')
    .select('scenario')
    .order('scenario')

  if (error) {
    console.error('Failed to fetch scenarios:', error)
    return []
  }

  const scenarios: string[] = Array.from(new Set((data || []).map((row) => row.scenario)))
  return scenarios
}

export async function getTestDatesAction(): Promise<string[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('llm_model_benchmarks')
    .select('test_date')
    .order('test_date', { ascending: false })

  if (error) {
    console.error('Failed to fetch test dates:', error)
    return []
  }

  const dates: string[] = Array.from(new Set((data || []).map((row) => row.test_date)))
  return dates
}

export interface BenchmarkSample {
  id: string
  modelSlug: string
  scenario: string
  language: string
  inputPrompt: string | null
  outputContent: string
  outputPreview: string | null
  judgeScores: Record<string, unknown> | null
  finalScore: number | null
  tier: 'S' | 'A' | 'B' | 'C' | 'D' | null
  scoreBreakdown: Record<string, number> | null
  wordCount: number | null
  generationTimeMs: number | null
  createdAt: string
}

export async function getBenchmarkSampleAction(
  modelSlug: string,
  scenario?: string
): Promise<BenchmarkSample | null> {
  const supabase = await createClient()

  let query = supabase
    .from('llm_benchmark_samples')
    .select('*')
    .eq('model_slug', modelSlug)
    .order('created_at', { ascending: false })
    .limit(1)

  if (scenario) {
    query = query.eq('scenario', scenario)
  }

  const { data, error } = await query.single()

  if (error || !data) {
    return null
  }

  return {
    id: data.id,
    modelSlug: data.model_slug,
    scenario: data.scenario,
    language: data.language,
    inputPrompt: data.input_prompt,
    outputContent: data.output_content,
    outputPreview: data.output_preview,
    judgeScores: data.judge_scores as Record<string, unknown> | null,
    finalScore: data.final_score,
    tier: data.tier as BenchmarkSample['tier'],
    scoreBreakdown: data.score_breakdown as Record<string, number> | null,
    wordCount: data.word_count,
    generationTimeMs: data.generation_time_ms,
    createdAt: data.created_at ?? new Date().toISOString(),
  }
}

export async function getTestSessionsAction(): Promise<
  Array<{ sessionId: string; testDate: string; modelCount: number }>
> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('llm_model_benchmarks')
    .select('test_session_id, test_date')
    .not('test_session_id', 'is', null)
    .order('test_date', { ascending: false })

  if (error || !data) {
    return []
  }

  // Group by session
  const sessions = new Map<string, { testDate: string; count: number }>()
  for (const row of data) {
    const sessionId = row.test_session_id
    if (!sessionId) continue
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, { testDate: row.test_date, count: 0 })
    }
    sessions.get(sessionId)!.count++
  }

  return Array.from(sessions.entries()).map(([sessionId, { testDate, count }]) => ({
    sessionId,
    testDate,
    modelCount: count,
  }))
}

export async function getModelScenarioResultsAction(modelSlug: string): Promise<ScenarioResult[]> {
  const supabase = await createClient()

  const { data: benchmarkData, error: benchmarkError } = await supabase
    .from('llm_model_benchmarks')
    .select('id')
    .eq('model_slug', modelSlug)
    .order('test_date', { ascending: false })
    .limit(1)
    .single()

  if (benchmarkError || !benchmarkData) {
    console.error('Failed to fetch benchmark:', benchmarkError)
    return []
  }

  const { data: runsData, error: runsError } = await supabase
    .from('llm_benchmark_runs')
    .select(
      'scenario, run_number, language, schema_score, content_score, language_score, overall_score, is_error, error_message'
    )
    .eq('benchmark_id', benchmarkData.id)
    .order('scenario')
    .order('run_number')

  if (runsError) {
    console.error('Failed to fetch benchmark runs:', runsError)
    return []
  }

  return (runsData || []).map((row) => ({
    scenario: row.scenario,
    runNumber: row.run_number,
    language: row.language,
    schemaScore: Number(row.schema_score),
    contentScore: Number(row.content_score),
    languageScore: Number(row.language_score),
    overallScore: Number(row.overall_score),
    isError: row.is_error ?? false,
    errorMessage: row.error_message,
  }))
}
