import type { RoleTitleSuggestion } from './role-title-suggestions.types'
import { mc2OverlayRole } from './role-title-suggestions-mc2-overlay.helpers'

export const mc2HrRoleTitleSuggestions: RoleTitleSuggestion[] = [
  mc2OverlayRole({
    id: 'hr-business-partner',
    department: 'hr',
    group: 'people-operations',
    seniority: 'manager',
    labels: { ru: 'Партнёр по персоналу', en: 'HR Business Partner' },
    aliases: {
      ru: ['hrbp', 'people partner', 'эйчар бизнес партнер'],
      en: ['hrbp', 'people partner'],
    },
    acronyms: ['HRBP'],
    keywords: { ru: ['люди', 'команды'], en: ['people', 'teams'] },
    popularityRank: 18,
    localePriority: { ru: 15, en: 15 },
  }),
  mc2OverlayRole({
    id: 'talent-acquisition-manager',
    department: 'hr',
    group: 'recruiting',
    seniority: 'manager',
    labels: { ru: 'Менеджер по подбору персонала', en: 'Talent Acquisition Manager' },
    aliases: {
      ru: ['рекрутер', 'talent acquisition', 'менеджер по найму'],
      en: ['recruiting manager', 'recruiter'],
    },
    keywords: { ru: ['найм', 'подбор'], en: ['hiring', 'recruiting'] },
    popularityRank: 16,
    localePriority: { ru: 12, en: 18 },
  }),
  mc2OverlayRole({
    id: 'recruiter',
    department: 'hr',
    group: 'recruiting',
    seniority: 'individual_contributor',
    labels: { ru: 'Рекрутер', en: 'Recruiter' },
    aliases: {
      ru: ['специалист по подбору', 'talent acquisition specialist'],
      en: ['talent acquisition specialist'],
    },
    keywords: { ru: ['кандидаты', 'сорсинг'], en: ['candidates', 'sourcing'] },
    popularityRank: 28,
    localePriority: { ru: 20, en: 22 },
  }),
  mc2OverlayRole({
    id: 'people-operations-manager',
    department: 'hr',
    group: 'people-operations',
    seniority: 'manager',
    labels: { ru: 'Менеджер процессов персонала', en: 'People Operations Manager' },
    aliases: {
      ru: ['people ops', 'менеджер hr-операций'],
      en: ['people ops manager', 'hr operations manager'],
    },
    keywords: { ru: ['hr-процессы', 'people ops'], en: ['hr processes', 'people ops'] },
    popularityRank: 54,
    localePriority: { ru: 39, en: 40 },
  }),
  mc2OverlayRole({
    id: 'learning-development-manager',
    department: 'hr',
    group: 'people-operations',
    seniority: 'manager',
    labels: { ru: 'Менеджер по обучению и развитию', en: 'Learning and Development Manager' },
    aliases: { ru: ['l&d manager', 'менеджер обучения'], en: ['l&d manager', 'training manager'] },
    acronyms: ['L&D'],
    keywords: { ru: ['обучение', 'развитие'], en: ['learning', 'development'] },
    popularityRank: 60,
    localePriority: { ru: 45, en: 46 },
  }),
]
