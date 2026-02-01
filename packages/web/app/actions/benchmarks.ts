'use server'

import { createClient } from '@/lib/supabase/server'
import { SupabaseClient } from '@supabase/supabase-js'

// Helper to access the view (types not yet generated for this view)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedSupabase = SupabaseClient<any, 'public', any>

// Type for the leaderboard view row
interface LeaderboardRow {
  model_slug: string
  model_name: string
  provider: string
  quality_tier: 'S' | 'A' | 'B' | 'C' | 'D'
  overall_quality_score: number
  content_quality_score: number
  schema_compliance_score: number
  language_quality_score: number
  total_issues: number
  critical_issues: number
  error_rate: number
  test_date: string
  test_version: string
}

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

  const supabase = (await createClient()) as UntypedSupabase

  // If filtering by scenario or testDate, query llm_model_benchmarks directly
  // Otherwise use the leaderboard view for performance
  const useDirectQuery = (scenario && scenario !== 'all') || (testDate && testDate !== 'all')

  // PostgrestFilterBuilder type is complex due to untyped view
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- UntypedSupabase query builder, types not generated for this view
  let query: any

  if (useDirectQuery) {
    // Query llm_model_benchmarks table directly with filters
    query = supabase.from('llm_model_benchmarks').select('*', { count: 'exact' })

    // For scenario filter, we need to check if benchmark has runs with that scenario
    if (scenario && scenario !== 'all') {
      // Get benchmark IDs that have this scenario
      const { data: runData } = await supabase
        .from('llm_benchmark_runs')
        .select('benchmark_id')
        .eq('scenario', scenario)

      if (runData && runData.length > 0) {
        const benchmarkIds = runData.map((r: { benchmark_id: string }) => r.benchmark_id)
        query = query.in('id', benchmarkIds)
      } else {
        // No benchmarks have this scenario
        return { benchmarks: [], totalCount: 0 }
      }
    }

    if (testDate && testDate !== 'all') {
      query = query.eq('test_date', testDate)
    }
  } else {
    // Use the optimized leaderboard view
    query = supabase.from('llm_model_leaderboard').select('*', { count: 'exact' })
  }

  // Apply filters
  if (provider && provider !== 'all') {
    query = query.eq('provider', provider)
  }

  if (tier && tier !== 'all') {
    query = query.eq('quality_tier', tier)
  }

  // Map frontend field names to database column names
  const columnMap: Record<string, string> = {
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

  const dbColumn = columnMap[sortBy] || 'overall_quality_score'

  // Apply sorting
  query = query.order(dbColumn, { ascending: sortOrder === 'asc' })

  // Apply pagination
  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('Failed to fetch benchmarks:', error)
    throw new Error(`Failed to fetch benchmarks: ${error.message}`)
  }

  // Transform to camelCase
  const benchmarks: BenchmarkData[] = (data || []).map((row: LeaderboardRow) => ({
    modelSlug: row.model_slug,
    modelName: row.model_name,
    provider: row.provider,
    qualityTier: row.quality_tier,
    overallQualityScore: Number(row.overall_quality_score),
    contentQualityScore: Number(row.content_quality_score),
    schemaComplianceScore: Number(row.schema_compliance_score),
    languageQualityScore: Number(row.language_quality_score),
    totalIssues: row.total_issues,
    criticalIssues: row.critical_issues,
    errorRate: Number(row.error_rate),
    testDate: row.test_date,
    testVersion: row.test_version,
  }))

  return {
    benchmarks,
    totalCount: count || 0,
  }
}

export async function getTopModelsAction(): Promise<BenchmarkData[]> {
  const result = await getBenchmarksAction({ limit: 3 })
  return result.benchmarks
}

export async function getProvidersAction(): Promise<string[]> {
  const supabase = (await createClient()) as UntypedSupabase

  const { data, error } = await supabase
    .from('llm_model_leaderboard')
    .select('provider')
    .order('provider')

  if (error) {
    console.error('Failed to fetch providers:', error)
    return []
  }

  // Get unique providers
  const rows = (data || []) as Array<{ provider: string }>
  const providers: string[] = Array.from(new Set(rows.map((row) => row.provider)))
  return providers
}

export async function getLatestTestDateAction(): Promise<string | null> {
  const supabase = (await createClient()) as UntypedSupabase

  const { data, error } = await supabase
    .from('llm_model_leaderboard')
    .select('test_date')
    .order('test_date', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    return null
  }

  return (data as { test_date: string }).test_date
}

export async function getScenariosAction(): Promise<string[]> {
  const supabase = (await createClient()) as UntypedSupabase

  const { data, error } = await supabase
    .from('llm_benchmark_runs')
    .select('scenario')
    .order('scenario')

  if (error) {
    console.error('Failed to fetch scenarios:', error)
    return []
  }

  // Get unique scenarios
  const rows = (data || []) as Array<{ scenario: string }>
  const scenarios: string[] = Array.from(new Set(rows.map((row) => row.scenario)))
  return scenarios
}

export async function getTestDatesAction(): Promise<string[]> {
  const supabase = (await createClient()) as UntypedSupabase

  const { data, error } = await supabase
    .from('llm_model_benchmarks')
    .select('test_date')
    .order('test_date', { ascending: false })

  if (error) {
    console.error('Failed to fetch test dates:', error)
    return []
  }

  // Get unique dates
  const rows = (data || []) as Array<{ test_date: string }>
  const dates: string[] = Array.from(new Set(rows.map((row) => row.test_date)))
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
  const supabase = (await createClient()) as UntypedSupabase

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
    judgeScores: data.judge_scores,
    finalScore: data.final_score,
    tier: data.tier,
    scoreBreakdown: data.score_breakdown,
    wordCount: data.word_count,
    generationTimeMs: data.generation_time_ms,
    createdAt: data.created_at,
  }
}

export async function getTestSessionsAction(): Promise<
  Array<{ sessionId: string; testDate: string; modelCount: number }>
> {
  const supabase = (await createClient()) as UntypedSupabase

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
  const supabase = (await createClient()) as UntypedSupabase

  // First, get the benchmark_id for this model (latest test_date)
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

  const benchmarkId = (benchmarkData as { id: string }).id

  // Now get all runs for this benchmark
  const { data: runsData, error: runsError } = await supabase
    .from('llm_benchmark_runs')
    .select(
      'scenario, run_number, language, schema_score, content_score, language_score, overall_score, is_error, error_message'
    )
    .eq('benchmark_id', benchmarkId)
    .order('scenario')
    .order('run_number')

  if (runsError) {
    console.error('Failed to fetch benchmark runs:', runsError)
    return []
  }

  // Transform to camelCase
  interface RunRow {
    scenario: string
    run_number: number
    language: string
    schema_score: number
    content_score: number
    language_score: number
    overall_score: number
    is_error: boolean
    error_message?: string | null
  }

  const results: ScenarioResult[] = (runsData || []).map((row: RunRow) => ({
    scenario: row.scenario,
    runNumber: row.run_number,
    language: row.language,
    schemaScore: Number(row.schema_score),
    contentScore: Number(row.content_score),
    languageScore: Number(row.language_score),
    overallScore: Number(row.overall_score),
    isError: row.is_error,
    errorMessage: row.error_message,
  }))

  return results
}
