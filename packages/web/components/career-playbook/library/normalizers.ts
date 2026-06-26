import type {
  CareerPlaybookLibraryData,
  CareerPlaybookLibraryFacets,
  CareerPlaybookLibraryItem,
  CareerPlaybookLibraryStatistics,
  CareerPlaybookLibraryStatus,
  CareerPlaybookVisibility,
  CareerPlaybookImageStatus,
  CareerPlaybookViewerPermissions,
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

function isVisibility(value: unknown): value is CareerPlaybookVisibility {
  return value === 'private' || value === 'organization' || value === 'public'
}

function isImageStatus(value: unknown): value is CareerPlaybookImageStatus {
  return (
    value === 'pending' ||
    value === 'draft_generating' ||
    value === 'draft_ready' ||
    value === 'generating' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled'
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

function readNumber(record: RawRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }
  return null
}

function readRecord(record: RawRecord, ...keys: string[]): RawRecord | null {
  for (const key of keys) {
    const value = record[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as RawRecord
    }
  }
  return null
}

function normalizeViewerPermissions(raw: unknown): CareerPlaybookViewerPermissions {
  if (!raw || typeof raw !== 'object') {
    return {
      canEdit: true,
      canManageVisibility: true,
      canCreateCourse: true,
      canDelete: true,
    }
  }

  const record = raw as RawRecord
  return {
    canEdit: readBoolean(record, 'canEdit', 'can_edit') ?? false,
    canManageVisibility:
      readBoolean(record, 'canManageVisibility', 'can_manage_visibility') ?? false,
    canCreateCourse: readBoolean(record, 'canCreateCourse', 'can_create_course') ?? false,
    canDelete: readBoolean(record, 'canDelete', 'can_delete') ?? false,
  }
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort(
    (left, right) => left.localeCompare(right)
  )
}

function normalizeStatusList(raw: unknown, fallbackItems: CareerPlaybookLibraryItem[]) {
  const values = Array.isArray(raw) ? raw : fallbackItems.map((item) => item.status)
  return Array.from(new Set(values.filter(isLibraryStatus)))
}

function buildDefaultStatistics(
  items: CareerPlaybookLibraryItem[]
): CareerPlaybookLibraryStatistics {
  const inProgressStatuses = new Set<CareerPlaybookLibraryStatus>([
    'answering_fixed',
    'awaiting_followups',
    'answering_followups',
    'ready_to_generate',
    'generating',
  ])

  return {
    totalCount: items.length,
    completedCount: items.filter((item) => item.status === 'completed').length,
    inProgressCount: items.filter((item) => inProgressStatuses.has(item.status)).length,
    publicCount: items.filter((item) => item.isPublic).length,
  }
}

function normalizeStatistics(
  raw: unknown,
  fallbackItems: CareerPlaybookLibraryItem[]
): CareerPlaybookLibraryStatistics {
  const fallback = buildDefaultStatistics(fallbackItems)
  if (!raw || typeof raw !== 'object') return fallback

  const record = raw as RawRecord
  return {
    totalCount: readNumber(record, 'totalCount', 'total_count') ?? fallback.totalCount,
    completedCount:
      readNumber(record, 'completedCount', 'completed_count') ?? fallback.completedCount,
    inProgressCount:
      readNumber(record, 'inProgressCount', 'in_progress_count') ?? fallback.inProgressCount,
    publicCount: readNumber(record, 'publicCount', 'public_count') ?? fallback.publicCount,
  }
}

function normalizeFacets(
  raw: unknown,
  fallbackItems: CareerPlaybookLibraryItem[]
): CareerPlaybookLibraryFacets {
  const record = raw && typeof raw === 'object' ? (raw as RawRecord) : null

  return {
    statuses: normalizeStatusList(record?.statuses, fallbackItems),
    departments: Array.isArray(record?.departments)
      ? uniqueStrings(record.departments.map((value) => (typeof value === 'string' ? value : null)))
      : uniqueStrings(fallbackItems.map((item) => item.department)),
    levels: Array.isArray(record?.levels)
      ? uniqueStrings(record.levels.map((value) => (typeof value === 'string' ? value : null)))
      : uniqueStrings(fallbackItems.map((item) => item.level)),
  }
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
  const isPublic = readBoolean(row, 'is_public', 'isPublic') ?? false
  const visibilityRaw = readString(row, 'visibility')
  const visibility: CareerPlaybookVisibility = isVisibility(visibilityRaw)
    ? visibilityRaw
    : isPublic
      ? 'public'
      : 'private'
  const imageStatusRaw = readString(row, 'imageStatus', 'image_status')
  const imageStatus = isImageStatus(imageStatusRaw) ? imageStatusRaw : null

  return {
    id,
    title,
    department: readString(row, 'department'),
    level: readString(row, 'level'),
    status,
    createdAt,
    isPublic: visibility === 'public',
    visibility,
    imageUrl: readString(row, 'imageUrl', 'image_url'),
    imageStatus,
    imageAltText: readString(row, 'imageAltText', 'image_alt_text'),
    imageErrorMessage: readString(row, 'imageErrorMessage', 'image_error_message'),
    ownerId: readString(row, 'ownerId', 'owner_id', 'userId', 'user_id'),
    viewerPermissions: normalizeViewerPermissions(readRecord(row, 'viewerPermissions')),
    shareSlug: readString(row, 'share_slug', 'shareSlug'),
    organizationSlug: readString(row, 'organization_slug', 'organizationSlug', 'orgSlug'),
    language: readString(row, 'language'),
  }
}

export function normalizeLibraryResponse(data: unknown): CareerPlaybookLibraryData {
  if (Array.isArray(data)) {
    const items = data
      .map(normalizeLibraryItem)
      .filter((item): item is CareerPlaybookLibraryItem => item !== null)
    return {
      items,
      nextCursor: null,
      error: null,
      totalCount: items.length,
      statistics: normalizeStatistics(null, items),
      facets: normalizeFacets(null, items),
    }
  }

  if (!data || typeof data !== 'object') {
    return {
      items: [],
      nextCursor: null,
      error: null,
      totalCount: 0,
      statistics: normalizeStatistics(null, []),
      facets: normalizeFacets(null, []),
    }
  }

  const payload = data as RawRecord
  const rawItems = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.playbooks)
      ? payload.playbooks
      : Array.isArray(payload.results)
        ? payload.results
        : []

  const items = rawItems
    .map(normalizeLibraryItem)
    .filter((item): item is CareerPlaybookLibraryItem => item !== null)
  const statistics = normalizeStatistics(readRecord(payload, 'statistics'), items)

  return {
    items,
    nextCursor: readString(payload, 'nextCursor', 'next_cursor'),
    error: null,
    totalCount: readNumber(payload, 'totalCount', 'total_count') ?? items.length,
    statistics,
    facets: normalizeFacets(readRecord(payload, 'facets'), items),
  }
}
