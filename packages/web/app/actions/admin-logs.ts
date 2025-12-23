'use server';

import { getBackendAuthHeaders, TRPC_URL } from '@/lib/auth';

// ============================================================================
// Types (matching backend types)
// ============================================================================

export type LogType = 'error_log' | 'generation_trace';
export type LogStatus = 'new' | 'in_progress' | 'resolved' | 'ignored';
export type LogLevel = 'WARNING' | 'ERROR' | 'CRITICAL';

export interface LogFilters {
  level?: LogLevel;
  source?: LogType;
  status?: LogStatus;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  courseId?: string;
}

export interface ListLogsParams {
  page?: number;
  limit?: number;
  filters?: LogFilters;
  sort?: {
    field: 'created_at' | 'severity';
    direction: 'asc' | 'desc';
  };
}

export interface UnifiedLogItem {
  id: string;
  logType: LogType;
  createdAt: string;
  severity: string;
  message: string;
  source: string | null;
  courseId: string | null;
  lessonId: string | null;
  stage: string | null;
  phase: string | null;
  status: LogStatus;
  metadata: Record<string, unknown> | null;
}

export interface LogDetails extends UnifiedLogItem {
  stackTrace: string | null;
  errorData: Record<string, unknown> | null;
  inputData: Record<string, unknown> | null;
  outputData: Record<string, unknown> | null;
  modelUsed: string | null;
  tokensUsed: number | null;
  costUsd: number | null;
  durationMs: number | null;
  statusNotes: string | null;
  statusUpdatedBy: string | null;
  statusUpdatedAt: string | null;
}

export interface LogListResponse {
  items: UnifiedLogItem[];
  total: number;
  page: number;
}

export interface UpdateStatusParams {
  logType: LogType;
  logId: string;
  status: LogStatus;
  notes?: string;
}

export interface BulkUpdateStatusParams {
  items: Array<{ logType: LogType; logId: string }>;
  status: LogStatus;
}

// ============================================================================
// Server Actions
// ============================================================================

/**
 * List logs with filters and pagination
 */
export async function listLogsAction(params: ListLogsParams): Promise<LogListResponse> {
  const headers = await getBackendAuthHeaders();

  const queryInput: Record<string, unknown> = {
    page: params.page ?? 1,
    limit: params.limit ?? 20,
  };

  if (params.filters) {
    queryInput.filters = params.filters;
  }

  if (params.sort) {
    queryInput.sort = params.sort;
  }

  const query = encodeURIComponent(JSON.stringify(queryInput));

  try {
    const res = await fetch(`${TRPC_URL}/admin.logs.list?input=${query}`, {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('List logs fetch failed:', text);
      throw new Error(`Failed to fetch logs: ${res.statusText}`);
    }

    const json = await res.json();

    if (json.error) {
      throw new Error(json.error.message);
    }

    return json.result.data as LogListResponse;
  } catch (error) {
    console.error('List Logs Server Action Error:', error);
    throw error;
  }
}

/**
 * Get single log details by ID
 */
export async function getLogByIdAction(params: {
  logType: LogType;
  logId: string;
}): Promise<LogDetails> {
  const headers = await getBackendAuthHeaders();

  const query = encodeURIComponent(JSON.stringify(params));

  try {
    const res = await fetch(`${TRPC_URL}/admin.logs.getById?input=${query}`, {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Get log by ID fetch failed:', text);
      throw new Error(`Failed to fetch log: ${res.statusText}`);
    }

    const json = await res.json();

    if (json.error) {
      throw new Error(json.error.message);
    }

    return json.result.data as LogDetails;
  } catch (error) {
    console.error('Get Log By ID Server Action Error:', error);
    throw error;
  }
}

/**
 * Update status for a single log
 */
export async function updateLogStatusAction(
  params: UpdateStatusParams
): Promise<{ success: boolean }> {
  const headers = await getBackendAuthHeaders();

  try {
    const res = await fetch(`${TRPC_URL}/admin.logs.updateStatus`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Update log status failed:', text);
      throw new Error(`Failed to update log status: ${res.statusText}`);
    }

    const json = await res.json();

    if (json.error) {
      throw new Error(json.error.message);
    }

    return json.result.data as { success: boolean };
  } catch (error) {
    console.error('Update Log Status Server Action Error:', error);
    throw error;
  }
}

/**
 * Bulk update status for multiple logs
 */
export async function bulkUpdateLogStatusAction(
  params: BulkUpdateStatusParams
): Promise<{ success: boolean; updatedCount: number }> {
  const headers = await getBackendAuthHeaders();

  try {
    const res = await fetch(`${TRPC_URL}/admin.logs.bulkUpdateStatus`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Bulk update log status failed:', text);
      throw new Error(`Failed to bulk update log status: ${res.statusText}`);
    }

    const json = await res.json();

    if (json.error) {
      throw new Error(json.error.message);
    }

    return json.result.data as { success: boolean; updatedCount: number };
  } catch (error) {
    console.error('Bulk Update Log Status Server Action Error:', error);
    throw error;
  }
}
