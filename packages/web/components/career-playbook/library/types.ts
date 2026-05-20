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
  shareSlug: string | null
  language?: string | null
}

export interface CareerPlaybookLibraryData {
  items: CareerPlaybookLibraryItem[]
  nextCursor: string | null
  error: string | null
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
