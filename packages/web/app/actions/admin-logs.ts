'use server'

import { getServerTrpcClient } from '@/lib/trpc/server-caller'
import { wrapError } from '@/lib/trpc/action-error'

// ============================================================================
// Types (matching backend types)
// ============================================================================

export type LogType = 'error_log' | 'generation_trace'
export type LogStatus = 'new' | 'in_progress' | 'resolved' | 'ignored' | 'to_verify'
export type LogLevel = 'WARNING' | 'ERROR' | 'CRITICAL'

export type LogEnvironment = 'dev' | 'stage'

export interface LogFilters {
  level?: LogLevel
  source?: LogType
  status?: LogStatus
  environment?: LogEnvironment
  search?: string
  dateFrom?: string
  dateTo?: string
  courseId?: string
}

export interface ListLogsParams {
  page?: number
  limit?: number
  filters?: LogFilters
  sort?: {
    field: 'created_at' | 'severity'
    direction: 'asc' | 'desc'
  }
}

export interface UnifiedLogItem {
  id: string
  logType: LogType
  createdAt: string
  severity: string
  message: string
  source: string | null
  courseId: string | null
  courseName: string | null
  lessonId: string | null
  stage: string | null
  phase: string | null
  status: LogStatus
  problemId: string | null
  environment: string | null
  metadata: Record<string, unknown> | null
}

export interface LogDetails extends UnifiedLogItem {
  stackTrace: string | null
  errorData: Record<string, unknown> | null
  inputData: Record<string, unknown> | null
  outputData: Record<string, unknown> | null
  modelUsed: string | null
  tokensUsed: number | null
  costUsd: number | null
  durationMs: number | null
  statusNotes: string | null
  statusUpdatedBy: string | null
  statusUpdatedAt: string | null
  // Enhanced context fields
  requestId: string | null
  trpcPath: string | null
  trpcInput: Record<string, unknown> | null
  attemptedValue: string | null
}

export interface LogListResponse {
  items: UnifiedLogItem[]
  total: number
  page: number
}

export interface UpdateStatusParams {
  logType: LogType
  logId: string
  status: LogStatus
  notes?: string
}

export interface BulkUpdateStatusParams {
  items: Array<{ logType: LogType; logId: string }>
  status: LogStatus
}

// ============================================================================
// Grouped Logs Types
// ============================================================================

export interface ErrorGroupItem {
  fingerprint: string
  count: number
  firstSeen: string
  lastSeen: string
  severity: string
  message: string
  source: string | null
  status: LogStatus
  environments: string[]
  latestLogId: string
  latestProblemId: string | null
  jobType: string | null
  courseId: string | null
  courseName: string | null
}

export interface GroupedLogListResponse {
  items: ErrorGroupItem[]
  total: number
  page: number
}

export interface ListGroupedParams {
  page?: number
  limit?: number
  filters?: LogFilters
}

export interface GetGroupLogsParams {
  fingerprint: string
  page?: number
  limit?: number
}

export interface UpdateGroupStatusParams {
  fingerprint: string
  status: LogStatus
  notes?: string
}

// ============================================================================
// Server Actions
// ============================================================================

/**
 * List logs with filters and pagination
 */
export async function listLogsAction(params: ListLogsParams): Promise<LogListResponse> {
  const queryInput: Record<string, unknown> = {
    page: params.page ?? 1,
    limit: params.limit ?? 20,
  }

  if (params.filters) {
    queryInput.filters = params.filters
  }

  if (params.sort) {
    queryInput.sort = params.sort
  }

  try {
    const client = await getServerTrpcClient()
    const result = await client.admin.logs.list.query(queryInput)
    return result as LogListResponse
  } catch (error) {
    console.error('List Logs Server Action Error:', error)
    throw wrapError(error, 'load logs')
  }
}

/**
 * Get single log details by ID
 */
export async function getLogByIdAction(params: {
  logType: LogType
  logId: string
}): Promise<LogDetails> {
  try {
    const client = await getServerTrpcClient()
    const result = await client.admin.logs.getById.query(params)
    return result as LogDetails
  } catch (error) {
    console.error('Get Log By ID Server Action Error:', error)
    throw wrapError(error, 'load log details')
  }
}

/**
 * Update status for a single log
 */
export async function updateLogStatusAction(
  params: UpdateStatusParams
): Promise<{ success: boolean }> {
  try {
    const client = await getServerTrpcClient()
    const result = await client.admin.logs.updateStatus.mutate(params)
    return result as { success: boolean }
  } catch (error) {
    console.error('Update Log Status Server Action Error:', error)
    throw wrapError(error, 'update log status')
  }
}

/**
 * Bulk update status for multiple logs
 */
export async function bulkUpdateLogStatusAction(
  params: BulkUpdateStatusParams
): Promise<{ success: boolean; updatedCount: number }> {
  try {
    const client = await getServerTrpcClient()
    const result = await client.admin.logs.bulkUpdateStatus.mutate(params)
    return result as { success: boolean; updatedCount: number }
  } catch (error) {
    console.error('Bulk Update Log Status Server Action Error:', error)
    throw wrapError(error, 'update log statuses')
  }
}

// ============================================================================
// Grouped Logs Server Actions
// ============================================================================

/**
 * List grouped logs by fingerprint with filters and pagination
 */
export async function listGroupedLogsAction(
  params: ListGroupedParams
): Promise<GroupedLogListResponse> {
  const queryInput: Record<string, unknown> = {
    page: params.page ?? 1,
    limit: params.limit ?? 20,
  }

  if (params.filters) {
    queryInput.filters = params.filters
  }

  try {
    const client = await getServerTrpcClient()
    const result = await client.admin.logs.listGrouped.query(queryInput)
    return result as GroupedLogListResponse
  } catch (error) {
    console.error('List Grouped Logs Server Action Error:', error)
    throw wrapError(error, 'load grouped logs')
  }
}

/**
 * Get individual logs within a fingerprint group
 */
export async function getGroupLogsAction(params: GetGroupLogsParams): Promise<LogListResponse> {
  const queryInput = {
    fingerprint: params.fingerprint,
    page: params.page ?? 1,
    limit: params.limit ?? 10,
  }

  try {
    const client = await getServerTrpcClient()
    const result = await client.admin.logs.getGroupLogs.query(queryInput)
    return result as LogListResponse
  } catch (error) {
    console.error('Get Group Logs Server Action Error:', error)
    throw wrapError(error, 'load group logs')
  }
}

/**
 * Update status for all logs in a fingerprint group
 */
export async function updateGroupStatusAction(
  params: UpdateGroupStatusParams
): Promise<{ success: boolean; updatedCount: number }> {
  try {
    const client = await getServerTrpcClient()
    const result = await client.admin.logs.updateGroupStatus.mutate(params)
    return result as { success: boolean; updatedCount: number }
  } catch (error) {
    console.error('Update Group Status Server Action Error:', error)
    throw wrapError(error, 'update group status')
  }
}
