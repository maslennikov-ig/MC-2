import type {
  CareerPlaybookViewerPermissions,
  CareerPlaybookVisibility,
} from '@megacampus/shared-types'

export type { CareerPlaybookViewerPermissions, CareerPlaybookVisibility }

export type CareerPlaybookLibraryStatus =
  | 'draft'
  | 'answering_fixed'
  | 'awaiting_followups'
  | 'answering_followups'
  | 'ready_to_generate'
  | 'generating'
  | 'completed'
  | 'failed'

export interface CareerPlaybookLibraryItem {
  id: string
  title: string
  department: string | null
  level: string | null
  status: CareerPlaybookLibraryStatus
  createdAt: string
  isPublic: boolean
  visibility?: CareerPlaybookVisibility
  ownerId?: string | null
  viewerPermissions?: CareerPlaybookViewerPermissions
  shareSlug: string | null
  language?: string | null
}

export type CareerPlaybookLibrarySort = 'created_desc' | 'created_asc' | 'title_asc' | 'title_desc'

export interface CareerPlaybookLibraryFilters {
  search?: string
  status?: CareerPlaybookLibraryStatus
  department?: string
  level?: string
  sort: CareerPlaybookLibrarySort
}

export interface CareerPlaybookLibraryStatistics {
  totalCount: number
  completedCount: number
  inProgressCount: number
  publicCount: number
}

export interface CareerPlaybookLibraryFacets {
  statuses: CareerPlaybookLibraryStatus[]
  departments: string[]
  levels: string[]
}

export interface CareerPlaybookLibraryData {
  items: CareerPlaybookLibraryItem[]
  nextCursor: string | null
  error: string | null
  totalCount?: number
  statistics?: CareerPlaybookLibraryStatistics
  facets?: CareerPlaybookLibraryFacets
}

export interface CreateCourseFromPlaybookInput {
  playbookId: string
  includeWebResearch: boolean
}

export interface CreateCourseFromPlaybookResult {
  success: true
  courseId: string
  redirectUrl: string
  sourceDocumentIds: string[]
  generationCode?: string
}

export interface CareerPlaybookPublicSharePlaybook {
  id: string
  slug: string
  title: string
  summary: string
  markdown: string
  department: string | null
  level: string | null
  language: string | null
  createdAt: string
}

export type CareerPlaybookPublicShareStatus = 'ok' | 'not-found' | 'private' | 'unavailable'

export interface CareerPlaybookPublicShareResult {
  status: CareerPlaybookPublicShareStatus
  playbook: CareerPlaybookPublicSharePlaybook | null
}
