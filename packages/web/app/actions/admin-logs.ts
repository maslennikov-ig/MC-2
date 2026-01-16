'use server'

import { getBackendAuthHeaders, TRPC_URL } from '@/lib/auth'

// ============================================================================
// Error Handling Helpers
// ============================================================================

/**
 * Wraps raw errors into user-friendly messages.
 * Differentiates network errors, auth errors, and generic failures.
 */
function wrapError(error: unknown, context: string): Error {
  const message = error instanceof Error ? error.message : String(error)
  const lowerMessage = message.toLowerCase()

  // Network/connection errors
  if (
    lowerMessage.includes('fetch') ||
    lowerMessage.includes('network') ||
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('timeout')
  ) {
    return new Error(`Unable to connect to server. Please check your connection and try again.`)
  }

  // Authentication/authorization errors
  if (
    lowerMessage.includes('unauthorized') ||
    lowerMessage.includes('401') ||
    lowerMessage.includes('forbidden') ||
    lowerMessage.includes('403')
  ) {
    return new Error(`Session expired or insufficient permissions. Please refresh the page.`)
  }

  // Not found errors
  if (lowerMessage.includes('not found') || lowerMessage.includes('404')) {
    return new Error(`The requested ${context} was not found.`)
  }

  // Validation errors - pass through as they're usually already user-friendly
  if (lowerMessage.includes('invalid') || lowerMessage.includes('validation')) {
    return new Error(message)
  }

  // Generic fallback with context
  return new Error(`Failed to ${context}. Please try again.`)
}

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
  const headers = await getBackendAuthHeaders()

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

  const query = encodeURIComponent(JSON.stringify(queryInput))

  try {
    const res = await fetch(`${TRPC_URL}/admin.logs.list?input=${query}`, {
      headers,
      cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('List logs fetch failed:', text)
      throw new Error(`Failed to fetch logs: ${res.statusText}`)
    }

    const json = await res.json()

    if (json.error) {
      throw new Error(json.error.message)
    }

    return json.result.data as LogListResponse
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
  const headers = await getBackendAuthHeaders()

  const query = encodeURIComponent(JSON.stringify(params))

  try {
    const res = await fetch(`${TRPC_URL}/admin.logs.getById?input=${query}`, {
      headers,
      cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('Get log by ID fetch failed:', text)
      throw new Error(`Failed to fetch log: ${res.statusText}`)
    }

    const json = await res.json()

    if (json.error) {
      throw new Error(json.error.message)
    }

    return json.result.data as LogDetails
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
  const headers = await getBackendAuthHeaders()

  try {
    const res = await fetch(`${TRPC_URL}/admin.logs.updateStatus`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('Update log status failed:', text)
      throw new Error(`Failed to update log status: ${res.statusText}`)
    }

    const json = await res.json()

    if (json.error) {
      throw new Error(json.error.message)
    }

    return json.result.data as { success: boolean }
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
  const headers = await getBackendAuthHeaders()

  try {
    const res = await fetch(`${TRPC_URL}/admin.logs.bulkUpdateStatus`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('Bulk update log status failed:', text)
      throw new Error(`Failed to bulk update log status: ${res.statusText}`)
    }

    const json = await res.json()

    if (json.error) {
      throw new Error(json.error.message)
    }

    return json.result.data as { success: boolean; updatedCount: number }
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
  const headers = await getBackendAuthHeaders()

  const queryInput: Record<string, unknown> = {
    page: params.page ?? 1,
    limit: params.limit ?? 20,
  }

  if (params.filters) {
    queryInput.filters = params.filters
  }

  const query = encodeURIComponent(JSON.stringify(queryInput))

  try {
    const res = await fetch(`${TRPC_URL}/admin.logs.listGrouped?input=${query}`, {
      headers,
      cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('List grouped logs fetch failed:', text)
      throw new Error(`Failed to fetch grouped logs: ${res.statusText}`)
    }

    const json = await res.json()

    if (json.error) {
      throw new Error(json.error.message)
    }

    return json.result.data as GroupedLogListResponse
  } catch (error) {
    console.error('List Grouped Logs Server Action Error:', error)
    throw wrapError(error, 'load grouped logs')
  }
}

/**
 * Get individual logs within a fingerprint group
 */
export async function getGroupLogsAction(params: GetGroupLogsParams): Promise<LogListResponse> {
  const headers = await getBackendAuthHeaders()

  const queryInput = {
    fingerprint: params.fingerprint,
    page: params.page ?? 1,
    limit: params.limit ?? 10,
  }

  const query = encodeURIComponent(JSON.stringify(queryInput))

  try {
    const res = await fetch(`${TRPC_URL}/admin.logs.getGroupLogs?input=${query}`, {
      headers,
      cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('Get group logs fetch failed:', text)
      throw new Error(`Failed to fetch group logs: ${res.statusText}`)
    }

    const json = await res.json()

    if (json.error) {
      throw new Error(json.error.message)
    }

    return json.result.data as LogListResponse
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
  const headers = await getBackendAuthHeaders()

  try {
    const res = await fetch(`${TRPC_URL}/admin.logs.updateGroupStatus`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('Update group status failed:', text)
      throw new Error(`Failed to update group status: ${res.statusText}`)
    }

    const json = await res.json()

    if (json.error) {
      throw new Error(json.error.message)
    }

    return json.result.data as { success: boolean; updatedCount: number }
  } catch (error) {
    console.error('Update Group Status Server Action Error:', error)
    throw wrapError(error, 'update group status')
  }
}
