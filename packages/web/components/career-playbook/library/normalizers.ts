import type {
  CareerPlaybookLibraryData,
  CareerPlaybookLibraryItem,
  CareerPlaybookLibraryStatus,
} from './types'

type RawRecord = Record<string, unknown>

function isLibraryStatus(value: unknown): value is CareerPlaybookLibraryStatus {
  return (
    value === 'draft' ||
    value === 'answering_fixed' ||
    value === 'awaiting_followups' ||
    value === 'answering_followups' ||
    value === 'ready_to_generate' ||
    value === 'generating' ||
    value === 'completed' ||
    value === 'failed'
  )
}

function readString(record: RawRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }
  return null
}

function readBoolean(record: RawRecord, ...keys: string[]): boolean | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'boolean') {
      return value
    }
  }
  return null
}

export function normalizeLibraryItem(rawItem: unknown): CareerPlaybookLibraryItem | null {
  if (!rawItem || typeof rawItem !== 'object') return null

  const row = rawItem as RawRecord
  const id = readString(row, 'id')
  if (!id) return null

  const title =
    readString(row, 'title', 'position_title', 'positionTitle', 'position') ?? 'Untitled Role Guide'
  const statusRaw = readString(row, 'status')
  const status: CareerPlaybookLibraryStatus = isLibraryStatus(statusRaw) ? statusRaw : 'draft'
  const createdAt = readString(row, 'created_at', 'createdAt') ?? new Date(0).toISOString()

  return {
    id,
    title,
    department: readString(row, 'department'),
    level: readString(row, 'level'),
    status,
    createdAt,
    isPublic: readBoolean(row, 'is_public', 'isPublic') ?? false,
    shareSlug: readString(row, 'share_slug', 'shareSlug'),
    language: readString(row, 'language'),
  }
}

export function normalizeLibraryResponse(data: unknown): CareerPlaybookLibraryData {
  if (Array.isArray(data)) {
    return {
      items: data
        .map(normalizeLibraryItem)
        .filter((item): item is CareerPlaybookLibraryItem => item !== null),
      nextCursor: null,
      error: null,
    }
  }

  if (!data || typeof data !== 'object') {
    return { items: [], nextCursor: null, error: null }
  }

  const payload = data as RawRecord
  const rawItems = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.playbooks)
      ? payload.playbooks
      : Array.isArray(payload.results)
        ? payload.results
        : []

  return {
    items: rawItems
      .map(normalizeLibraryItem)
      .filter((item): item is CareerPlaybookLibraryItem => item !== null),
    nextCursor: readString(payload, 'nextCursor', 'next_cursor'),
    error: null,
  }
}
