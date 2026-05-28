export type RoleTitleSuggestionLocale = 'ru' | 'en'

export type RoleDepartment =
  | 'sales'
  | 'marketing'
  | 'product'
  | 'engineering'
  | 'design'
  | 'data'
  | 'operations'
  | 'hr'
  | 'finance'
  | 'support'
  | 'legal'

export type RoleGroup =
  | 'account-management'
  | 'analytics'
  | 'business-operations'
  | 'commercial-leadership'
  | 'content-brand'
  | 'customer-implementation'
  | 'customer-support'
  | 'data-platform'
  | 'design-leadership'
  | 'engineering-leadership'
  | 'finance-control'
  | 'growth-marketing'
  | 'legal-compliance'
  | 'people-operations'
  | 'product-leadership'
  | 'product-management'
  | 'recruiting'
  | 'software-engineering'

export type RoleSeniority = 'individual_contributor' | 'lead' | 'manager' | 'head' | 'executive'

export type RoleMatchKind = 'popular' | 'label' | 'alias' | 'acronym' | 'keyword'

export type RoleTitleSuggestionSource = 'esco' | 'onet' | 'okz' | 'wikidata' | 'mc2_overlay'

export interface RoleTitleSourceReferences {
  escoUri?: string
  onetSocCode?: string
  okzCode?: string
  wikidataQid?: string
}

export interface RoleTitleSuggestion {
  id: string
  department: RoleDepartment
  group: RoleGroup
  seniority?: RoleSeniority
  labels: Record<RoleTitleSuggestionLocale, string>
  aliases: Record<RoleTitleSuggestionLocale, string[]>
  acronyms?: string[]
  keywords?: Record<RoleTitleSuggestionLocale, string[]>
  popularityRank: number
  localePriority?: Partial<Record<RoleTitleSuggestionLocale, number>>
  source: RoleTitleSuggestionSource
  sourceReferences?: RoleTitleSourceReferences
}

export interface LocalizedRoleTitleSuggestion {
  id: string
  department: RoleDepartment
  departmentLabel: string
  group: RoleGroup
  seniority?: RoleSeniority
  label: string
  alternateLabel: string
  matchLabel: string
  matchKind: RoleMatchKind
  score: number
  source: RoleTitleSuggestion['source']
}

export interface RoleTitleSuggestionGroup {
  department: RoleDepartment
  departmentLabel: string
  suggestions: LocalizedRoleTitleSuggestion[]
}
