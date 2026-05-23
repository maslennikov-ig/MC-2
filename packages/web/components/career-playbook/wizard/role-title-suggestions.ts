export type RoleTitleSuggestionLocale = 'ru' | 'en'

export interface RoleTitleSuggestion {
  id: string
  department:
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
  labels: Record<RoleTitleSuggestionLocale, string>
  aliases: Record<RoleTitleSuggestionLocale, string[]>
}

export interface LocalizedRoleTitleSuggestion {
  id: string
  department: RoleTitleSuggestion['department']
  label: string
  alternateLabel: string
}

export const roleTitleSuggestions: RoleTitleSuggestion[] = [
  {
    id: 'b2b-sales-manager',
    department: 'sales',
    labels: { ru: 'Менеджер по продажам B2B', en: 'B2B Sales Manager' },
    aliases: { ru: ['руководитель продаж', 'sales manager'], en: ['sales manager', 'b2b'] },
  },
  {
    id: 'head-of-sales',
    department: 'sales',
    labels: { ru: 'Руководитель отдела продаж', en: 'Head of Sales' },
    aliases: { ru: ['директор по продажам', 'head of sales'], en: ['sales director'] },
  },
  {
    id: 'account-executive',
    department: 'sales',
    labels: { ru: 'Account Executive', en: 'Account Executive' },
    aliases: { ru: ['менеджер по ключевым клиентам', 'ae'], en: ['sales executive', 'ae'] },
  },
  {
    id: 'customer-success-manager',
    department: 'support',
    labels: { ru: 'Customer Success Manager', en: 'Customer Success Manager' },
    aliases: { ru: ['csm', 'менеджер по успеху клиентов'], en: ['csm', 'client success'] },
  },
  {
    id: 'product-manager',
    department: 'product',
    labels: { ru: 'Product Manager', en: 'Product Manager' },
    aliases: { ru: ['менеджер продукта', 'продакт', 'product owner'], en: ['pm', 'product owner'] },
  },
  {
    id: 'product-owner',
    department: 'product',
    labels: { ru: 'Product Owner', en: 'Product Owner' },
    aliases: { ru: ['владелец продукта', 'product manager'], en: ['po', 'product manager'] },
  },
  {
    id: 'project-manager',
    department: 'operations',
    labels: { ru: 'Project Manager', en: 'Project Manager' },
    aliases: { ru: ['менеджер проекта', 'руководитель проекта'], en: ['pm', 'program manager'] },
  },
  {
    id: 'operations-manager',
    department: 'operations',
    labels: { ru: 'Операционный менеджер', en: 'Operations Manager' },
    aliases: { ru: ['operations manager', 'операционный руководитель'], en: ['ops manager'] },
  },
  {
    id: 'hr-business-partner',
    department: 'hr',
    labels: { ru: 'HR Business Partner', en: 'HR Business Partner' },
    aliases: { ru: ['hrbp', 'people partner'], en: ['hrbp', 'people partner'] },
  },
  {
    id: 'talent-acquisition-manager',
    department: 'hr',
    labels: { ru: 'Менеджер по подбору персонала', en: 'Talent Acquisition Manager' },
    aliases: { ru: ['рекрутер', 'talent acquisition'], en: ['recruiting manager', 'recruiter'] },
  },
  {
    id: 'marketing-manager',
    department: 'marketing',
    labels: { ru: 'Маркетинг-менеджер', en: 'Marketing Manager' },
    aliases: { ru: ['marketing manager'], en: ['growth marketing'] },
  },
  {
    id: 'performance-marketing-manager',
    department: 'marketing',
    labels: { ru: 'Performance Marketing Manager', en: 'Performance Marketing Manager' },
    aliases: { ru: ['перформанс-маркетолог', 'paid ads'], en: ['paid marketing', 'ppc'] },
  },
  {
    id: 'software-engineer',
    department: 'engineering',
    labels: { ru: 'Software Engineer', en: 'Software Engineer' },
    aliases: { ru: ['разработчик', 'программист'], en: ['developer', 'programmer'] },
  },
  {
    id: 'frontend-developer',
    department: 'engineering',
    labels: { ru: 'Frontend Developer', en: 'Frontend Developer' },
    aliases: { ru: ['frontend engineer', 'фронтенд-разработчик'], en: ['frontend engineer'] },
  },
  {
    id: 'backend-developer',
    department: 'engineering',
    labels: { ru: 'Backend Developer', en: 'Backend Developer' },
    aliases: { ru: ['backend engineer', 'бэкенд-разработчик'], en: ['backend engineer'] },
  },
  {
    id: 'devops-engineer',
    department: 'engineering',
    labels: { ru: 'DevOps-инженер', en: 'DevOps Engineer' },
    aliases: { ru: ['sre', 'platform engineer'], en: ['sre', 'platform engineer'] },
  },
  {
    id: 'data-analyst',
    department: 'data',
    labels: { ru: 'Data Analyst', en: 'Data Analyst' },
    aliases: { ru: ['аналитик данных', 'bi analyst'], en: ['bi analyst', 'analytics'] },
  },
  {
    id: 'data-scientist',
    department: 'data',
    labels: { ru: 'Data Scientist', en: 'Data Scientist' },
    aliases: { ru: ['специалист по данным', 'ml'], en: ['machine learning', 'ml'] },
  },
  {
    id: 'ux-ui-designer',
    department: 'design',
    labels: { ru: 'UX/UI Designer', en: 'UX/UI Designer' },
    aliases: { ru: ['дизайнер интерфейсов', 'product designer'], en: ['product designer'] },
  },
  {
    id: 'finance-manager',
    department: 'finance',
    labels: { ru: 'Финансовый менеджер', en: 'Finance Manager' },
    aliases: { ru: ['finance manager', 'финансовый контролер'], en: ['financial controller'] },
  },
  {
    id: 'legal-counsel',
    department: 'legal',
    labels: { ru: 'Юрист', en: 'Legal Counsel' },
    aliases: { ru: ['legal counsel', 'корпоративный юрист'], en: ['lawyer', 'corporate counsel'] },
  },
  {
    id: 'business-analyst',
    department: 'operations',
    labels: { ru: 'Бизнес-аналитик', en: 'Business Analyst' },
    aliases: { ru: ['business analyst', 'системный аналитик'], en: ['systems analyst'] },
  },
]

export function searchRoleTitleSuggestions(
  query: string,
  locale: string,
  limit = 6
): LocalizedRoleTitleSuggestion[] {
  const normalizedLocale = locale === 'en' ? 'en' : 'ru'
  const alternateLocale = normalizedLocale === 'ru' ? 'en' : 'ru'
  const normalizedQuery = normalizeSearchText(query)
  if (normalizedQuery.length < 2) return []

  const rankedSuggestions = roleTitleSuggestions
    .map((suggestion, index) => ({
      suggestion,
      index,
      score: scoreSuggestion(suggestion, normalizedLocale, normalizedQuery),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)

  return rankedSuggestions.map(({ suggestion }) => ({
    id: suggestion.id,
    department: suggestion.department,
    label: suggestion.labels[normalizedLocale],
    alternateLabel: suggestion.labels[alternateLocale],
  }))
}

function scoreSuggestion(
  suggestion: RoleTitleSuggestion,
  locale: RoleTitleSuggestionLocale,
  query: string
) {
  if (!query) return 1

  const fields = [
    suggestion.labels[locale],
    suggestion.labels[locale === 'ru' ? 'en' : 'ru'],
    ...suggestion.aliases.ru,
    ...suggestion.aliases.en,
  ].map(normalizeSearchText)

  if (fields.some((field) => field === query)) return 4
  if (fields.some((field) => field.startsWith(query))) return 3
  if (fields.some((field) => field.includes(query))) return 2

  return 0
}

function normalizeSearchText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
}
