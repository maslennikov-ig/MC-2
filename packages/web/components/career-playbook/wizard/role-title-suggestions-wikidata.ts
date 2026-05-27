import type { RoleTitleSuggestion } from './role-title-suggestions.types'

export const wikidataRoleTitleSuggestionSourceMetadata = {
  wikidata: {
    license: 'CC0 1.0',
    licenseUrl: 'https://www.wikidata.org/wiki/Wikidata:Licensing',
    apiUrl: 'https://www.wikidata.org/w/api.php?action=wbgetentities',
    entityUrlTemplate: 'https://www.wikidata.org/wiki/{qid}',
    attribution:
      'This service uses structured data from Wikidata. Reviewed MC2 labels and aliases are merged with allowlisted Wikidata entity labels.',
    importPolicy:
      'Only reviewed allowlist QIDs are imported; no broad Wikidata dump, SPARQL crawl, HH, or Faker source is used at runtime.',
  },
} as const

export const wikidataRoleTitleSuggestions: RoleTitleSuggestion[] = [
  {
    id: 'system-administrator',
    department: 'engineering',
    group: 'data-platform',
    seniority: 'individual_contributor',
    labels: {
      ru: 'Системный администратор',
      en: 'System Administrator',
    },
    aliases: {
      ru: ['сисадмин', 'ИТ-администратор', 'sysadmin', 'system administrator', 'Sysad'],
      en: ['sysadmin', 'IT administrator', 'System Administrator', 'systems administrators'],
    },
    keywords: {
      ru: ['инфраструктура', 'серверы', 'доступы', 'сети'],
      en: ['infrastructure', 'servers', 'access management', 'networks'],
    },
    popularityRank: 62,
    localePriority: {
      ru: 44,
      en: 60,
    },
    sourceReferences: {
      wikidataQid: 'Q327353',
    },
    source: 'wikidata',
  },
  {
    id: 'database-administrator',
    department: 'data',
    group: 'data-platform',
    seniority: 'individual_contributor',
    labels: {
      ru: 'Администратор базы данных',
      en: 'Database Administrator',
    },
    aliases: {
      ru: ['dba', 'администратор баз данных', 'database administrator'],
      en: ['DBA', 'database admin', 'data base administrator'],
    },
    acronyms: ['DBA'],
    keywords: {
      ru: ['базы данных', 'postgres', 'sql', 'резервное копирование'],
      en: ['databases', 'postgres', 'sql', 'backup'],
    },
    popularityRank: 63,
    localePriority: {
      ru: 45,
      en: 61,
    },
    sourceReferences: {
      wikidataQid: 'Q1078262',
    },
    source: 'wikidata',
  },
  {
    id: 'office-manager',
    department: 'operations',
    group: 'business-operations',
    seniority: 'individual_contributor',
    labels: {
      ru: 'Офис-менеджер',
      en: 'Office Manager',
    },
    aliases: {
      ru: ['офис менеджер', 'администратор офиса', 'office manager'],
      en: ['office administrator', 'office management'],
    },
    keywords: {
      ru: ['офис', 'административная поддержка', 'закупки'],
      en: ['office', 'administration', 'supplies'],
    },
    popularityRank: 64,
    localePriority: {
      ru: 46,
      en: 62,
    },
    sourceReferences: {
      wikidataQid: 'Q1966741',
    },
    source: 'wikidata',
  },
  {
    id: 'secretary',
    department: 'operations',
    group: 'business-operations',
    seniority: 'individual_contributor',
    labels: {
      ru: 'Секретарь',
      en: 'Secretary',
    },
    aliases: {
      ru: ['ассистент руководителя', 'секретарь-референт', 'secretary'],
      en: ['administrative assistant', 'executive assistant'],
    },
    keywords: {
      ru: ['документы', 'расписание', 'приемная'],
      en: ['documents', 'schedule', 'front office'],
    },
    popularityRank: 65,
    localePriority: {
      ru: 47,
      en: 63,
    },
    sourceReferences: {
      wikidataQid: 'Q319544',
    },
    source: 'wikidata',
  },
  {
    id: 'technical-support-specialist',
    department: 'support',
    group: 'customer-support',
    seniority: 'individual_contributor',
    labels: {
      ru: 'Специалист технической поддержки',
      en: 'Computer User Support Specialist',
    },
    aliases: {
      ru: ['техподдержка', 'специалист техподдержки', 'специалист поддержки'],
      en: [
        'technical support specialist',
        'user support specialist',
        'help desk specialist',
        'support specialist',
      ],
    },
    keywords: {
      ru: ['поддержка', 'обращения', 'инциденты', 'пользователи'],
      en: ['support', 'tickets', 'incidents', 'users'],
    },
    popularityRank: 66,
    localePriority: {
      ru: 48,
      en: 64,
    },
    sourceReferences: {
      wikidataQid: 'Q33492554',
    },
    source: 'wikidata',
  },
]
