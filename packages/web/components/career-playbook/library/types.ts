import type {
  CareerPlaybookLinkedCourse,
  CareerPlaybookViewerPermissions,
  CareerPlaybookVisibility,
  CourseSize,
  CourseStyle,
  Language,
} from '@megacampus/shared-types'

export type { CareerPlaybookViewerPermissions, CareerPlaybookVisibility }
export type { CareerPlaybookLinkedCourse }

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
  organizationSlug?: string | null
  linkedCourse?: CareerPlaybookLinkedCourse | null
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
  includeBusinessContextSources: boolean
  overrides: {
    title: string
    courseDescription: string
    targetAudience: string
    learningOutcomes: string[]
    language: Language
    courseSize: CourseSize
    style: CourseStyle
  }
}

export interface CreateCourseFromPlaybookResult {
  success: true
  courseId: string
  redirectUrl: string
  sourceDocumentIds: string[]
  generationCode?: string
}

export interface PreviewCourseFromPlaybookResult {
  playbookId: string
  brief: {
    title: string
    courseDescription: string
    targetAudience: string
    learningOutcomes: string[]
    language: Language
    courseSize: CourseSize
    style: CourseStyle
  }
  defaults: {
    includeWebResearch: boolean
    includeBusinessContextSources: boolean
  }
  sources: {
    roleGuide: {
      included: boolean
    }
    webResearch: {
      available: boolean
      defaultIncluded: boolean
    }
    businessContextSources: {
      available: boolean
      defaultIncluded: boolean
      sourceCount: number
      sources: Array<{
        id: string
        filename: string | null
        status: string
      }>
    }
  }
}

export interface CareerPlaybookPublicSharePlaybook {
  id: string
  slug: string
  organizationSlug: string | null
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
