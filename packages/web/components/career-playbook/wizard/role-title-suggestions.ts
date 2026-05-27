import {
  escoRoleTitleSuggestions,
  roleTitleSuggestionSourceMetadata,
} from './role-title-suggestions-esco'
import { mc2OverlayRoleTitleSuggestions } from './role-title-suggestions-mc2-overlay'
import type {
  LocalizedRoleTitleSuggestion,
  RoleDepartment,
  RoleMatchKind,
  RoleTitleSuggestion,
  RoleTitleSuggestionGroup,
  RoleTitleSuggestionLocale,
} from './role-title-suggestions.types'

export type {
  LocalizedRoleTitleSuggestion,
  RoleDepartment,
  RoleGroup,
  RoleMatchKind,
  RoleSeniority,
  RoleTitleSourceReferences,
  RoleTitleSuggestion,
  RoleTitleSuggestionGroup,
  RoleTitleSuggestionLocale,
  RoleTitleSuggestionSource,
} from './role-title-suggestions.types'

export { roleTitleSuggestionSourceMetadata }

const departmentLabels: Record<RoleDepartment, Record<RoleTitleSuggestionLocale, string>> = {
  sales: { ru: 'Продажи', en: 'Sales' },
  marketing: { ru: 'Маркетинг', en: 'Marketing' },
  product: { ru: 'Продукт', en: 'Product' },
  engineering: { ru: 'Разработка и инженерия', en: 'Engineering' },
  design: { ru: 'Дизайн', en: 'Design' },
  data: { ru: 'Аналитика и данные', en: 'Data' },
  operations: { ru: 'Операции', en: 'Operations' },
  hr: { ru: 'Персонал', en: 'People and HR' },
  finance: { ru: 'Финансы', en: 'Finance' },
  support: { ru: 'Поддержка и работа с клиентами', en: 'Customer Experience' },
  legal: { ru: 'Право и соблюдение требований', en: 'Legal and Compliance' },
}

export const roleTitleSuggestions: RoleTitleSuggestion[] = mergeRoleTitleSuggestions(
  escoRoleTitleSuggestions,
  mc2OverlayRoleTitleSuggestions
)

export function getPopularRoleTitleSuggestions(
  locale: string,
  limit = 8
): LocalizedRoleTitleSuggestion[] {
  const normalizedLocale = normalizeLocale(locale)

  return [...roleTitleSuggestions]
    .sort(
      (left, right) =>
        getLocalePriority(left, normalizedLocale) - getLocalePriority(right, normalizedLocale) ||
        left.popularityRank - right.popularityRank ||
        left.id.localeCompare(right.id)
    )
    .slice(0, limit)
    .map((suggestion) =>
      localizeSuggestion(suggestion, normalizedLocale, {
        matchKind: 'popular',
        matchLabel: '',
        score: 0,
      })
    )
}

export function searchRoleTitleSuggestions(
  query: string,
  locale: string,
  limit = 10
): LocalizedRoleTitleSuggestion[] {
  const normalizedLocale = normalizeLocale(locale)
  const normalizedQuery = normalizeSearchText(query)
  if (normalizedQuery.length < 2) return []

  return roleTitleSuggestions
    .map((suggestion) => ({
      suggestion,
      match: scoreSuggestion(suggestion, normalizedLocale, normalizedQuery),
    }))
    .filter((item): item is { suggestion: RoleTitleSuggestion; match: RoleMatchScore } =>
      Boolean(item.match)
    )
    .sort(
      (left, right) =>
        right.match.score - left.match.score ||
        getLocalePriority(left.suggestion, normalizedLocale) -
          getLocalePriority(right.suggestion, normalizedLocale) ||
        left.suggestion.popularityRank - right.suggestion.popularityRank ||
        left.suggestion.id.localeCompare(right.suggestion.id)
    )
    .slice(0, limit)
    .map(({ suggestion, match }) => localizeSuggestion(suggestion, normalizedLocale, match))
}

export function getRoleTitleSuggestionGroups(
  suggestions: LocalizedRoleTitleSuggestion[]
): RoleTitleSuggestionGroup[] {
  const groups: RoleTitleSuggestionGroup[] = []

  suggestions.forEach((suggestion) => {
    const existingGroup = groups.find((group) => group.department === suggestion.department)
    if (existingGroup) {
      existingGroup.suggestions.push(suggestion)
      return
    }

    groups.push({
      department: suggestion.department,
      departmentLabel: suggestion.departmentLabel,
      suggestions: [suggestion],
    })
  })

  return groups
}

export function inferRoleDepartmentFromTitle(title: string, locale: string): RoleDepartment | null {
  const normalizedLocale = normalizeLocale(locale)
  const normalizedTitle = normalizeSearchText(title)
  if (normalizedTitle.length < 2) return null

  const matchedSuggestion = searchRoleTitleSuggestions(title, normalizedLocale, 1)[0]
  if (matchedSuggestion) {
    return matchedSuggestion.department
  }

  const inferredRule = departmentInferenceRules.find((rule) =>
    rule.terms.some((term) => normalizedTitle.includes(term))
  )

  return inferredRule?.department ?? null
}

interface RoleMatchScore {
  matchKind: RoleMatchKind
  matchLabel: string
  score: number
}

const departmentInferenceRules: Array<{ department: RoleDepartment; terms: string[] }> = [
  {
    department: 'sales',
    terms: [
      'продаж',
      'sales',
      'account',
      'выручк',
      'b2b',
      'b2c',
      'retail',
      'розниц',
      'клиент',
      'партнерск',
    ],
  },
  { department: 'marketing', terms: ['маркет', 'marketing', 'brand', 'бренд', 'seo', 'crm'] },
  { department: 'product', terms: ['product', 'продукт', 'продакт'] },
  {
    department: 'engineering',
    terms: ['engineer', 'developer', 'devops', 'разработ', 'инженер', 'программист', 'sre'],
  },
  { department: 'design', terms: ['design', 'дизайн', 'ux', 'ui'] },
  { department: 'data', terms: ['data', 'аналитик', 'analytics', 'machine learning', 'bi'] },
  { department: 'operations', terms: ['operations', 'операц', 'project', 'program', 'process'] },
  { department: 'hr', terms: ['hr', 'people', 'talent', 'recruit', 'персонал', 'рекрут'] },
  { department: 'finance', terms: ['finance', 'финанс', 'accountant', 'бухгалтер', 'cfo'] },
  { department: 'support', terms: ['support', 'customer success', 'поддерж', 'implementation'] },
  { department: 'legal', terms: ['legal', 'юрист', 'lawyer', 'compliance', 'комплаенс'] },
]

function scoreSuggestion(
  suggestion: RoleTitleSuggestion,
  locale: RoleTitleSuggestionLocale,
  query: string
): RoleMatchScore | null {
  const alternateLocale = locale === 'ru' ? 'en' : 'ru'
  const candidates: RoleMatchScore[] = [
    ...scoreTextFields([suggestion.labels[locale]], query, 'label', 1000, 850, 620),
    ...scoreTextFields(suggestion.acronyms ?? [], query, 'acronym', 980, 700, 0),
    ...scoreTextFields(suggestion.aliases[locale], query, 'alias', 940, 800, 560),
    ...scoreTextFields([suggestion.labels[alternateLocale]], query, 'label', 900, 760, 520),
    ...scoreTextFields(suggestion.aliases[alternateLocale], query, 'alias', 860, 730, 500),
    ...scoreTextFields(suggestion.keywords?.[locale] ?? [], query, 'keyword', 650, 610, 430),
    ...scoreTextFields(
      suggestion.keywords?.[alternateLocale] ?? [],
      query,
      'keyword',
      600,
      560,
      390
    ),
  ]

  return candidates.sort((left, right) => right.score - left.score)[0] ?? null
}

function scoreTextFields(
  values: string[],
  query: string,
  matchKind: RoleMatchKind,
  exactScore: number,
  prefixScore: number,
  includesScore: number
): RoleMatchScore[] {
  return values.flatMap((value) => {
    const normalizedValue = normalizeSearchText(value)
    if (!normalizedValue) return []

    if (normalizedValue === query) {
      return [{ matchKind, matchLabel: value, score: exactScore }]
    }

    if (normalizedValue.startsWith(query)) {
      return [{ matchKind, matchLabel: value, score: prefixScore }]
    }

    if (includesScore > 0 && normalizedValue.includes(query)) {
      return [{ matchKind, matchLabel: value, score: includesScore }]
    }

    return []
  })
}

function localizeSuggestion(
  suggestion: RoleTitleSuggestion,
  locale: RoleTitleSuggestionLocale,
  match: RoleMatchScore
): LocalizedRoleTitleSuggestion {
  const alternateLocale = locale === 'ru' ? 'en' : 'ru'

  return {
    id: suggestion.id,
    department: suggestion.department,
    departmentLabel: departmentLabels[suggestion.department][locale],
    group: suggestion.group,
    seniority: suggestion.seniority,
    label: suggestion.labels[locale],
    alternateLabel: suggestion.labels[alternateLocale],
    matchLabel: match.matchLabel,
    matchKind: match.matchKind,
    score: match.score,
    source: suggestion.source,
  }
}

function normalizeLocale(locale: string): RoleTitleSuggestionLocale {
  return locale === 'en' ? 'en' : 'ru'
}

function getLocalePriority(suggestion: RoleTitleSuggestion, locale: RoleTitleSuggestionLocale) {
  return suggestion.localePriority?.[locale] ?? 1000
}

function normalizeSearchText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replaceAll('ё', 'е')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
}

function mergeRoleTitleSuggestions(
  primary: RoleTitleSuggestion[],
  fallback: RoleTitleSuggestion[]
): RoleTitleSuggestion[] {
  const seenIds = new Set(primary.map((suggestion) => suggestion.id))

  return [...primary, ...fallback.filter((suggestion) => !seenIds.has(suggestion.id))]
}
