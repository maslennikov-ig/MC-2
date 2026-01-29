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

interface BenchmarksParams {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  provider?: string
  tier?: string
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
    limit = 20,
    offset = 0,
  } = params

  const supabase = (await createClient()) as UntypedSupabase

  // Build query using llm_model_leaderboard view
  let query = supabase.from('llm_model_leaderboard').select('*', { count: 'exact' })

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
