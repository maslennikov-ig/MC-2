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
  source: 'curated'
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

const departmentLabels: Record<RoleDepartment, Record<RoleTitleSuggestionLocale, string>> = {
  sales: { ru: 'Продажи', en: 'Sales' },
  marketing: { ru: 'Маркетинг', en: 'Marketing' },
  product: { ru: 'Продукт', en: 'Product' },
  engineering: { ru: 'Инженерия', en: 'Engineering' },
  design: { ru: 'Дизайн', en: 'Design' },
  data: { ru: 'Данные', en: 'Data' },
  operations: { ru: 'Операции', en: 'Operations' },
  hr: { ru: 'Люди и HR', en: 'People and HR' },
  finance: { ru: 'Финансы', en: 'Finance' },
  support: { ru: 'Клиентский опыт', en: 'Customer Experience' },
  legal: { ru: 'Право и комплаенс', en: 'Legal and Compliance' },
}

const role = (suggestion: Omit<RoleTitleSuggestion, 'source'>): RoleTitleSuggestion => ({
  ...suggestion,
  source: 'curated',
})

export const roleTitleSuggestions: RoleTitleSuggestion[] = [
  role({
    id: 'product-manager',
    department: 'product',
    group: 'product-management',
    seniority: 'individual_contributor',
    labels: { ru: 'Product Manager', en: 'Product Manager' },
    aliases: { ru: ['продакт', 'менеджер продукта'], en: ['product lead'] },
    acronyms: ['PM'],
    keywords: { ru: ['продукт', 'роадмап', 'гипотезы'], en: ['roadmap', 'discovery'] },
    popularityRank: 1,
    localePriority: { ru: 1, en: 1 },
  }),
  role({
    id: 'product-owner',
    department: 'product',
    group: 'product-management',
    seniority: 'individual_contributor',
    labels: { ru: 'Product Owner', en: 'Product Owner' },
    aliases: { ru: ['владелец продукта'], en: ['po', 'scrum product owner'] },
    acronyms: ['PO'],
    keywords: { ru: ['бэклог', 'спринт'], en: ['backlog', 'scrum'] },
    popularityRank: 12,
    localePriority: { ru: 8, en: 8 },
  }),
  role({
    id: 'head-of-product',
    department: 'product',
    group: 'product-leadership',
    seniority: 'head',
    labels: { ru: 'Head of Product', en: 'Head of Product' },
    aliases: { ru: ['руководитель продукта'], en: ['product lead'] },
    keywords: { ru: ['портфель продуктов'], en: ['product portfolio'] },
    popularityRank: 17,
    localePriority: { ru: 10, en: 10 },
  }),
  role({
    id: 'chief-product-officer',
    department: 'product',
    group: 'product-leadership',
    seniority: 'executive',
    labels: { ru: 'Chief Product Officer', en: 'Chief Product Officer' },
    aliases: { ru: ['cpo', 'директор по продукту'], en: ['cpo', 'vp product'] },
    acronyms: ['CPO'],
    keywords: { ru: ['продуктовая стратегия'], en: ['product strategy'] },
    popularityRank: 34,
    localePriority: { ru: 18, en: 18 },
  }),
  role({
    id: 'technical-product-manager',
    department: 'product',
    group: 'product-management',
    seniority: 'individual_contributor',
    labels: { ru: 'Technical Product Manager', en: 'Technical Product Manager' },
    aliases: { ru: ['технический продакт'], en: ['technical pm', 'platform product manager'] },
    acronyms: ['TPM'],
    keywords: { ru: ['api', 'платформа'], en: ['api', 'platform'] },
    popularityRank: 26,
    localePriority: { ru: 15, en: 15 },
  }),
  role({
    id: 'growth-product-manager',
    department: 'product',
    group: 'product-management',
    seniority: 'individual_contributor',
    labels: { ru: 'Growth Product Manager', en: 'Growth Product Manager' },
    aliases: { ru: ['growth pm', 'продуктовый менеджер роста'], en: ['growth pm'] },
    acronyms: ['GPM'],
    keywords: { ru: ['активация', 'retention'], en: ['activation', 'retention'] },
    popularityRank: 31,
    localePriority: { ru: 20, en: 20 },
  }),
  role({
    id: 'product-analyst',
    department: 'product',
    group: 'analytics',
    seniority: 'individual_contributor',
    labels: { ru: 'Продуктовый аналитик', en: 'Product Analyst' },
    aliases: { ru: ['product analyst', 'аналитик продукта'], en: ['product analytics'] },
    keywords: { ru: ['метрики продукта', 'воронка'], en: ['product metrics', 'funnel'] },
    popularityRank: 29,
    localePriority: { ru: 12, en: 22 },
  }),
  role({
    id: 'product-marketing-manager',
    department: 'marketing',
    group: 'content-brand',
    seniority: 'manager',
    labels: { ru: 'Product Marketing Manager', en: 'Product Marketing Manager' },
    aliases: { ru: ['pmm', 'маркетолог продукта'], en: ['pmm', 'go-to-market manager'] },
    acronyms: ['PMM'],
    keywords: { ru: ['позиционирование', 'gtm'], en: ['positioning', 'gtm'] },
    popularityRank: 38,
    localePriority: { ru: 32, en: 28 },
  }),
  role({
    id: 'software-engineer',
    department: 'engineering',
    group: 'software-engineering',
    seniority: 'individual_contributor',
    labels: { ru: 'Software Engineer', en: 'Software Engineer' },
    aliases: {
      ru: ['разработчик', 'программист', 'инженер-программист'],
      en: ['developer', 'programmer'],
    },
    keywords: { ru: ['код', 'разработка'], en: ['coding', 'software development'] },
    popularityRank: 2,
    localePriority: { ru: 2, en: 2 },
  }),
  role({
    id: 'frontend-developer',
    department: 'engineering',
    group: 'software-engineering',
    seniority: 'individual_contributor',
    labels: { ru: 'Frontend Developer', en: 'Frontend Developer' },
    aliases: {
      ru: ['фронтенд-разработчик', 'frontend engineer', 'разработчик интерфейсов'],
      en: ['frontend engineer', 'front-end developer'],
    },
    keywords: { ru: ['react', 'интерфейс'], en: ['react', 'ui engineering'] },
    popularityRank: 6,
    localePriority: { ru: 4, en: 5 },
  }),
  role({
    id: 'backend-developer',
    department: 'engineering',
    group: 'software-engineering',
    seniority: 'individual_contributor',
    labels: { ru: 'Backend Developer', en: 'Backend Developer' },
    aliases: {
      ru: ['бэкенд-разработчик', 'backend engineer', 'серверный разработчик'],
      en: ['backend engineer', 'server-side developer'],
    },
    keywords: { ru: ['api', 'сервер'], en: ['api', 'server'] },
    popularityRank: 7,
    localePriority: { ru: 5, en: 6 },
  }),
  role({
    id: 'fullstack-developer',
    department: 'engineering',
    group: 'software-engineering',
    seniority: 'individual_contributor',
    labels: { ru: 'Fullstack Developer', en: 'Fullstack Developer' },
    aliases: {
      ru: ['фулстек-разработчик', 'full-stack engineer'],
      en: ['full-stack engineer', 'full stack developer'],
    },
    keywords: { ru: ['frontend', 'backend'], en: ['frontend', 'backend'] },
    popularityRank: 13,
    localePriority: { ru: 7, en: 7 },
  }),
  role({
    id: 'mobile-developer',
    department: 'engineering',
    group: 'software-engineering',
    seniority: 'individual_contributor',
    labels: { ru: 'Mobile Developer', en: 'Mobile Developer' },
    aliases: {
      ru: ['мобильный разработчик', 'ios developer', 'android developer'],
      en: ['ios developer', 'android developer'],
    },
    keywords: { ru: ['ios', 'android'], en: ['ios', 'android'] },
    popularityRank: 41,
    localePriority: { ru: 27, en: 27 },
  }),
  role({
    id: 'qa-engineer',
    department: 'engineering',
    group: 'software-engineering',
    seniority: 'individual_contributor',
    labels: { ru: 'QA Engineer', en: 'QA Engineer' },
    aliases: {
      ru: ['тестировщик', 'инженер по качеству'],
      en: ['quality assurance engineer', 'tester'],
    },
    acronyms: ['QA'],
    keywords: { ru: ['тестирование', 'качество'], en: ['testing', 'quality'] },
    popularityRank: 20,
    localePriority: { ru: 14, en: 14 },
  }),
  role({
    id: 'devops-engineer',
    department: 'engineering',
    group: 'data-platform',
    seniority: 'individual_contributor',
    labels: { ru: 'DevOps-инженер', en: 'DevOps Engineer' },
    aliases: {
      ru: ['sre', 'platform engineer', 'инженер инфраструктуры'],
      en: ['sre', 'platform engineer'],
    },
    acronyms: ['SRE'],
    keywords: { ru: ['инфраструктура', 'ci cd'], en: ['infrastructure', 'ci cd'] },
    popularityRank: 15,
    localePriority: { ru: 11, en: 11 },
  }),
  role({
    id: 'platform-engineer',
    department: 'engineering',
    group: 'data-platform',
    seniority: 'individual_contributor',
    labels: { ru: 'Platform Engineer', en: 'Platform Engineer' },
    aliases: {
      ru: ['инженер платформы', 'devops'],
      en: ['devops engineer', 'infrastructure engineer'],
    },
    keywords: { ru: ['платформа разработки'], en: ['developer platform'] },
    popularityRank: 37,
    localePriority: { ru: 26, en: 24 },
  }),
  role({
    id: 'engineering-manager',
    department: 'engineering',
    group: 'engineering-leadership',
    seniority: 'manager',
    labels: { ru: 'Engineering Manager', en: 'Engineering Manager' },
    aliases: {
      ru: ['руководитель разработки', 'менеджер инженеров'],
      en: ['software development manager'],
    },
    keywords: { ru: ['команда разработки'], en: ['engineering team'] },
    popularityRank: 14,
    localePriority: { ru: 9, en: 9 },
  }),
  role({
    id: 'tech-lead',
    department: 'engineering',
    group: 'engineering-leadership',
    seniority: 'lead',
    labels: { ru: 'Tech Lead', en: 'Tech Lead' },
    aliases: { ru: ['техлид', 'technical lead'], en: ['technical lead'] },
    keywords: { ru: ['архитектура', 'ревью кода'], en: ['architecture', 'code review'] },
    popularityRank: 19,
    localePriority: { ru: 13, en: 13 },
  }),
  role({
    id: 'solution-architect',
    department: 'engineering',
    group: 'engineering-leadership',
    seniority: 'lead',
    labels: { ru: 'Solution Architect', en: 'Solution Architect' },
    aliases: { ru: ['архитектор решений', 'системный архитектор'], en: ['systems architect'] },
    keywords: { ru: ['архитектура решений'], en: ['solution design'] },
    popularityRank: 42,
    localePriority: { ru: 28, en: 30 },
  }),
  role({
    id: 'security-engineer',
    department: 'engineering',
    group: 'data-platform',
    seniority: 'individual_contributor',
    labels: { ru: 'Security Engineer', en: 'Security Engineer' },
    aliases: {
      ru: ['инженер по безопасности', 'appsec'],
      en: ['appsec engineer', 'cybersecurity engineer'],
    },
    keywords: { ru: ['безопасность', 'уязвимости'], en: ['security', 'vulnerabilities'] },
    popularityRank: 49,
    localePriority: { ru: 34, en: 34 },
  }),
  role({
    id: 'data-analyst',
    department: 'data',
    group: 'analytics',
    seniority: 'individual_contributor',
    labels: { ru: 'Data Analyst', en: 'Data Analyst' },
    aliases: { ru: ['аналитик данных', 'bi analyst'], en: ['bi analyst', 'analytics analyst'] },
    keywords: { ru: ['дашборд', 'метрики'], en: ['dashboard', 'metrics'] },
    popularityRank: 8,
    localePriority: { ru: 6, en: 4 },
  }),
  role({
    id: 'business-intelligence-analyst',
    department: 'data',
    group: 'analytics',
    seniority: 'individual_contributor',
    labels: { ru: 'BI Analyst', en: 'BI Analyst' },
    aliases: {
      ru: ['бизнес-аналитик данных', 'аналитик bi'],
      en: ['business intelligence analyst'],
    },
    acronyms: ['BI'],
    keywords: { ru: ['отчеты', 'визуализация'], en: ['reports', 'visualization'] },
    popularityRank: 27,
    localePriority: { ru: 21, en: 19 },
  }),
  role({
    id: 'data-scientist',
    department: 'data',
    group: 'analytics',
    seniority: 'individual_contributor',
    labels: { ru: 'Data Scientist', en: 'Data Scientist' },
    aliases: {
      ru: ['специалист по данным', 'ml researcher'],
      en: ['machine learning scientist', 'ml scientist'],
    },
    acronyms: ['ML'],
    keywords: { ru: ['машинное обучение', 'модель'], en: ['machine learning', 'modeling'] },
    popularityRank: 18,
    localePriority: { ru: 16, en: 12 },
  }),
  role({
    id: 'data-engineer',
    department: 'data',
    group: 'data-platform',
    seniority: 'individual_contributor',
    labels: { ru: 'Data Engineer', en: 'Data Engineer' },
    aliases: { ru: ['инженер данных', 'etl engineer'], en: ['etl engineer', 'analytics engineer'] },
    keywords: { ru: ['etl', 'пайплайн данных'], en: ['etl', 'data pipeline'] },
    popularityRank: 21,
    localePriority: { ru: 17, en: 16 },
  }),
  role({
    id: 'machine-learning-engineer',
    department: 'data',
    group: 'data-platform',
    seniority: 'individual_contributor',
    labels: { ru: 'Machine Learning Engineer', en: 'Machine Learning Engineer' },
    aliases: {
      ru: ['ml engineer', 'инженер машинного обучения'],
      en: ['ml engineer', 'ai engineer'],
    },
    acronyms: ['MLE', 'ML'],
    keywords: { ru: ['mlops', 'модель'], en: ['mlops', 'model serving'] },
    popularityRank: 44,
    localePriority: { ru: 33, en: 31 },
  }),
  role({
    id: 'analytics-engineer',
    department: 'data',
    group: 'analytics',
    seniority: 'individual_contributor',
    labels: { ru: 'Analytics Engineer', en: 'Analytics Engineer' },
    aliases: {
      ru: ['инженер аналитики', 'dbt analyst'],
      en: ['dbt developer', 'data modeling engineer'],
    },
    keywords: { ru: ['модель данных'], en: ['data modeling'] },
    popularityRank: 51,
    localePriority: { ru: 36, en: 36 },
  }),
  role({
    id: 'head-of-data',
    department: 'data',
    group: 'data-platform',
    seniority: 'head',
    labels: { ru: 'Head of Data', en: 'Head of Data' },
    aliases: { ru: ['руководитель данных', 'директор по данным'], en: ['data director'] },
    keywords: { ru: ['data strategy'], en: ['data strategy'] },
    popularityRank: 55,
    localePriority: { ru: 40, en: 40 },
  }),
  role({
    id: 'ux-ui-designer',
    department: 'design',
    group: 'product-management',
    seniority: 'individual_contributor',
    labels: { ru: 'UX/UI Designer', en: 'UX/UI Designer' },
    aliases: { ru: ['дизайнер интерфейсов', 'ui ux designer'], en: ['ui designer', 'ux designer'] },
    keywords: { ru: ['интерфейс', 'макет'], en: ['interface', 'wireframe'] },
    popularityRank: 11,
    localePriority: { ru: 3, en: 18 },
  }),
  role({
    id: 'product-designer',
    department: 'design',
    group: 'product-management',
    seniority: 'individual_contributor',
    labels: { ru: 'Product Designer', en: 'Product Designer' },
    aliases: { ru: ['продуктовый дизайнер', 'дизайнер продукта'], en: ['ux ui designer'] },
    keywords: { ru: ['прототип', 'ux'], en: ['prototype', 'ux'] },
    popularityRank: 22,
    localePriority: { ru: 19, en: 17 },
  }),
  role({
    id: 'ux-researcher',
    department: 'design',
    group: 'product-management',
    seniority: 'individual_contributor',
    labels: { ru: 'UX Researcher', en: 'UX Researcher' },
    aliases: { ru: ['исследователь пользователей', 'ux researcher'], en: ['user researcher'] },
    keywords: { ru: ['интервью', 'исследования'], en: ['interviews', 'research'] },
    popularityRank: 45,
    localePriority: { ru: 31, en: 33 },
  }),
  role({
    id: 'brand-designer',
    department: 'design',
    group: 'content-brand',
    seniority: 'individual_contributor',
    labels: { ru: 'Brand Designer', en: 'Brand Designer' },
    aliases: { ru: ['бренд-дизайнер', 'графический дизайнер'], en: ['graphic designer'] },
    keywords: { ru: ['бренд', 'айдентика'], en: ['brand', 'identity'] },
    popularityRank: 52,
    localePriority: { ru: 38, en: 38 },
  }),
  role({
    id: 'motion-designer',
    department: 'design',
    group: 'content-brand',
    seniority: 'individual_contributor',
    labels: { ru: 'Motion Designer', en: 'Motion Designer' },
    aliases: { ru: ['моушн-дизайнер', 'аниматор'], en: ['animator'] },
    keywords: { ru: ['анимация', 'видео'], en: ['animation', 'video'] },
    popularityRank: 67,
    localePriority: { ru: 48, en: 50 },
  }),
  role({
    id: 'design-lead',
    department: 'design',
    group: 'design-leadership',
    seniority: 'lead',
    labels: { ru: 'Design Lead', en: 'Design Lead' },
    aliases: { ru: ['ведущий дизайнер', 'руководитель дизайна'], en: ['lead designer'] },
    keywords: { ru: ['дизайн-система'], en: ['design system'] },
    popularityRank: 46,
    localePriority: { ru: 35, en: 35 },
  }),
  role({
    id: 'b2b-sales-manager',
    department: 'sales',
    group: 'account-management',
    seniority: 'manager',
    labels: { ru: 'Менеджер по продажам B2B', en: 'B2B Sales Manager' },
    aliases: {
      ru: ['sales manager', 'менеджер b2b продаж'],
      en: ['sales manager', 'b2b account manager'],
    },
    keywords: { ru: ['воронка продаж', 'сделки'], en: ['sales pipeline', 'deals'] },
    popularityRank: 3,
    localePriority: { ru: 2, en: 3 },
  }),
  role({
    id: 'head-of-sales',
    department: 'sales',
    group: 'commercial-leadership',
    seniority: 'head',
    labels: { ru: 'Руководитель отдела продаж', en: 'Head of Sales' },
    aliases: {
      ru: ['директор по продажам', 'head of sales', 'sales director'],
      en: ['sales director', 'vp sales'],
    },
    keywords: { ru: ['команда продаж'], en: ['sales team'] },
    popularityRank: 4,
    localePriority: { ru: 1, en: 4 },
  }),
  role({
    id: 'account-executive',
    department: 'sales',
    group: 'account-management',
    seniority: 'individual_contributor',
    labels: { ru: 'Account Executive', en: 'Account Executive' },
    aliases: { ru: ['ae', 'менеджер по ключевым клиентам'], en: ['ae', 'sales executive'] },
    acronyms: ['AE'],
    keywords: { ru: ['клиенты', 'выручка'], en: ['customers', 'revenue'] },
    popularityRank: 16,
    localePriority: { ru: 16, en: 14 },
  }),
  role({
    id: 'sales-development-representative',
    department: 'sales',
    group: 'account-management',
    seniority: 'individual_contributor',
    labels: { ru: 'Sales Development Representative', en: 'Sales Development Representative' },
    aliases: { ru: ['sdr', 'специалист лидогенерации'], en: ['sdr', 'lead generation specialist'] },
    acronyms: ['SDR'],
    keywords: { ru: ['лиды', 'исходящие продажи'], en: ['leads', 'outbound'] },
    popularityRank: 25,
    localePriority: { ru: 24, en: 23 },
  }),
  role({
    id: 'key-account-manager',
    department: 'sales',
    group: 'account-management',
    seniority: 'manager',
    labels: { ru: 'Key Account Manager', en: 'Key Account Manager' },
    aliases: {
      ru: ['кам', 'менеджер ключевых клиентов'],
      en: ['kam', 'strategic account manager'],
    },
    acronyms: ['KAM'],
    keywords: { ru: ['ключевые клиенты'], en: ['key accounts'] },
    popularityRank: 28,
    localePriority: { ru: 23, en: 25 },
  }),
  role({
    id: 'sales-operations-manager',
    department: 'sales',
    group: 'business-operations',
    seniority: 'manager',
    labels: { ru: 'Sales Operations Manager', en: 'Sales Operations Manager' },
    aliases: {
      ru: ['sales ops', 'менеджер операционной поддержки продаж'],
      en: ['sales ops manager'],
    },
    keywords: { ru: ['crm', 'прогноз продаж'], en: ['crm', 'sales forecast'] },
    popularityRank: 39,
    localePriority: { ru: 30, en: 29 },
  }),
  role({
    id: 'channel-sales-manager',
    department: 'sales',
    group: 'account-management',
    seniority: 'manager',
    labels: { ru: 'Channel Sales Manager', en: 'Channel Sales Manager' },
    aliases: { ru: ['партнерские продажи', 'channel manager'], en: ['partner sales manager'] },
    keywords: { ru: ['партнеры', 'каналы'], en: ['partners', 'channels'] },
    popularityRank: 57,
    localePriority: { ru: 42, en: 42 },
  }),
  role({
    id: 'revenue-operations-manager',
    department: 'sales',
    group: 'business-operations',
    seniority: 'manager',
    labels: { ru: 'Revenue Operations Manager', en: 'Revenue Operations Manager' },
    aliases: { ru: ['revops', 'менеджер revenue operations'], en: ['revops manager'] },
    acronyms: ['RevOps'],
    keywords: { ru: ['выручка', 'операции продаж'], en: ['revenue', 'go-to-market operations'] },
    popularityRank: 43,
    localePriority: { ru: 39, en: 32 },
  }),
  role({
    id: 'marketing-manager',
    department: 'marketing',
    group: 'growth-marketing',
    seniority: 'manager',
    labels: { ru: 'Маркетинг-менеджер', en: 'Marketing Manager' },
    aliases: { ru: ['marketing manager', 'менеджер маркетинга'], en: ['growth marketing manager'] },
    keywords: { ru: ['кампании', 'лиды'], en: ['campaigns', 'leads'] },
    popularityRank: 9,
    localePriority: { ru: 9, en: 9 },
  }),
  role({
    id: 'performance-marketing-manager',
    department: 'marketing',
    group: 'growth-marketing',
    seniority: 'manager',
    labels: { ru: 'Performance Marketing Manager', en: 'Performance Marketing Manager' },
    aliases: {
      ru: ['перформанс-маркетолог', 'paid ads'],
      en: ['paid marketing manager', 'ppc manager'],
    },
    keywords: { ru: ['реклама', 'cpa'], en: ['paid ads', 'cpa'] },
    popularityRank: 23,
    localePriority: { ru: 18, en: 21 },
  }),
  role({
    id: 'content-marketing-manager',
    department: 'marketing',
    group: 'content-brand',
    seniority: 'manager',
    labels: { ru: 'Content Marketing Manager', en: 'Content Marketing Manager' },
    aliases: { ru: ['контент-маркетолог', 'content manager'], en: ['content manager'] },
    keywords: { ru: ['контент', 'редакция'], en: ['content', 'editorial'] },
    popularityRank: 30,
    localePriority: { ru: 25, en: 26 },
  }),
  role({
    id: 'brand-manager',
    department: 'marketing',
    group: 'content-brand',
    seniority: 'manager',
    labels: { ru: 'Brand Manager', en: 'Brand Manager' },
    aliases: { ru: ['бренд-менеджер'], en: ['brand lead'] },
    keywords: { ru: ['бренд', 'позиционирование'], en: ['brand', 'positioning'] },
    popularityRank: 40,
    localePriority: { ru: 29, en: 37 },
  }),
  role({
    id: 'growth-marketer',
    department: 'marketing',
    group: 'growth-marketing',
    seniority: 'individual_contributor',
    labels: { ru: 'Growth Marketer', en: 'Growth Marketer' },
    aliases: { ru: ['маркетолог роста', 'growth manager'], en: ['growth manager'] },
    keywords: { ru: ['эксперименты', 'активация'], en: ['experiments', 'activation'] },
    popularityRank: 33,
    localePriority: { ru: 28, en: 24 },
  }),
  role({
    id: 'seo-specialist',
    department: 'marketing',
    group: 'growth-marketing',
    seniority: 'individual_contributor',
    labels: { ru: 'SEO Specialist', en: 'SEO Specialist' },
    aliases: { ru: ['seo-специалист', 'специалист по seo'], en: ['seo manager'] },
    acronyms: ['SEO'],
    keywords: { ru: ['органический трафик', 'поиск'], en: ['organic traffic', 'search'] },
    popularityRank: 36,
    localePriority: { ru: 27, en: 34 },
  }),
  role({
    id: 'crm-marketing-manager',
    department: 'marketing',
    group: 'growth-marketing',
    seniority: 'manager',
    labels: { ru: 'CRM Marketing Manager', en: 'CRM Marketing Manager' },
    aliases: {
      ru: ['crm-маркетолог', 'email marketing manager'],
      en: ['email marketing manager', 'lifecycle marketer'],
    },
    acronyms: ['CRM'],
    keywords: { ru: ['рассылки', 'retention'], en: ['email', 'lifecycle'] },
    popularityRank: 48,
    localePriority: { ru: 41, en: 39 },
  }),
  role({
    id: 'marketing-operations-manager',
    department: 'marketing',
    group: 'business-operations',
    seniority: 'manager',
    labels: { ru: 'Marketing Operations Manager', en: 'Marketing Operations Manager' },
    aliases: { ru: ['marketing ops', 'операции маркетинга'], en: ['marketing ops manager'] },
    keywords: { ru: ['маркетинг-стек', 'атрибуция'], en: ['marketing stack', 'attribution'] },
    popularityRank: 53,
    localePriority: { ru: 43, en: 41 },
  }),
  role({
    id: 'customer-success-manager',
    department: 'support',
    group: 'customer-implementation',
    seniority: 'manager',
    labels: { ru: 'Customer Success Manager', en: 'Customer Success Manager' },
    aliases: { ru: ['csm', 'менеджер по успеху клиентов'], en: ['csm', 'client success manager'] },
    acronyms: ['CSM'],
    keywords: { ru: ['удержание клиентов', 'аккаунты'], en: ['retention', 'accounts'] },
    popularityRank: 5,
    localePriority: { ru: 6, en: 5 },
  }),
  role({
    id: 'support-specialist',
    department: 'support',
    group: 'customer-support',
    seniority: 'individual_contributor',
    labels: { ru: 'Специалист поддержки', en: 'Support Specialist' },
    aliases: { ru: ['customer support', 'саппорт'], en: ['customer support specialist'] },
    keywords: { ru: ['тикеты', 'клиенты'], en: ['tickets', 'customers'] },
    popularityRank: 24,
    localePriority: { ru: 22, en: 20 },
  }),
  role({
    id: 'customer-support-lead',
    department: 'support',
    group: 'customer-support',
    seniority: 'lead',
    labels: { ru: 'Руководитель поддержки', en: 'Customer Support Lead' },
    aliases: { ru: ['support lead', 'лид поддержки'], en: ['support lead', 'head of support'] },
    keywords: { ru: ['sla', 'поддержка'], en: ['sla', 'support'] },
    popularityRank: 35,
    localePriority: { ru: 26, en: 31 },
  }),
  role({
    id: 'implementation-manager',
    department: 'support',
    group: 'customer-implementation',
    seniority: 'manager',
    labels: { ru: 'Implementation Manager', en: 'Implementation Manager' },
    aliases: { ru: ['менеджер внедрения', 'onboarding manager'], en: ['onboarding manager'] },
    keywords: {
      ru: ['внедрение', 'онбординг клиента'],
      en: ['implementation', 'customer onboarding'],
    },
    popularityRank: 50,
    localePriority: { ru: 37, en: 36 },
  }),
  role({
    id: 'technical-account-manager',
    department: 'support',
    group: 'customer-implementation',
    seniority: 'manager',
    labels: { ru: 'Technical Account Manager', en: 'Technical Account Manager' },
    aliases: { ru: ['tam', 'технический аккаунт-менеджер'], en: ['tam'] },
    acronyms: ['TAM'],
    keywords: { ru: ['техническая поддержка клиента'], en: ['technical customer success'] },
    popularityRank: 56,
    localePriority: { ru: 44, en: 43 },
  }),
  role({
    id: 'project-manager',
    department: 'operations',
    group: 'business-operations',
    seniority: 'manager',
    labels: { ru: 'Project Manager', en: 'Project Manager' },
    aliases: { ru: ['менеджер проекта', 'руководитель проекта'], en: ['project lead'] },
    acronyms: ['PM'],
    keywords: { ru: ['сроки', 'план проекта'], en: ['timeline', 'project plan'] },
    popularityRank: 10,
    localePriority: { ru: 10, en: 12 },
  }),
  role({
    id: 'program-manager',
    department: 'operations',
    group: 'business-operations',
    seniority: 'manager',
    labels: { ru: 'Program Manager', en: 'Program Manager' },
    aliases: { ru: ['менеджер программы', 'руководитель программы'], en: ['program lead'] },
    acronyms: ['PM'],
    keywords: { ru: ['портфель проектов'], en: ['program portfolio'] },
    popularityRank: 32,
    localePriority: { ru: 30, en: 28 },
  }),
  role({
    id: 'operations-manager',
    department: 'operations',
    group: 'business-operations',
    seniority: 'manager',
    labels: { ru: 'Операционный менеджер', en: 'Operations Manager' },
    aliases: { ru: ['operations manager', 'операционный руководитель'], en: ['ops manager'] },
    keywords: { ru: ['процессы', 'операции'], en: ['processes', 'operations'] },
    popularityRank: 11,
    localePriority: { ru: 8, en: 8 },
  }),
  role({
    id: 'business-analyst',
    department: 'operations',
    group: 'business-operations',
    seniority: 'individual_contributor',
    labels: { ru: 'Бизнес-аналитик', en: 'Business Analyst' },
    aliases: { ru: ['business analyst', 'системный аналитик'], en: ['systems analyst'] },
    keywords: { ru: ['требования', 'процессы'], en: ['requirements', 'processes'] },
    popularityRank: 14,
    localePriority: { ru: 11, en: 11 },
  }),
  role({
    id: 'chief-operating-officer',
    department: 'operations',
    group: 'business-operations',
    seniority: 'executive',
    labels: { ru: 'Chief Operating Officer', en: 'Chief Operating Officer' },
    aliases: { ru: ['coo', 'операционный директор'], en: ['coo', 'operations director'] },
    acronyms: ['COO'],
    keywords: { ru: ['операционная система'], en: ['operating model'] },
    popularityRank: 47,
    localePriority: { ru: 32, en: 32 },
  }),
  role({
    id: 'process-manager',
    department: 'operations',
    group: 'business-operations',
    seniority: 'manager',
    labels: { ru: 'Process Manager', en: 'Process Manager' },
    aliases: { ru: ['менеджер процессов', 'process owner'], en: ['process owner'] },
    keywords: { ru: ['регламенты', 'процессы'], en: ['process improvement'] },
    popularityRank: 58,
    localePriority: { ru: 41, en: 45 },
  }),
  role({
    id: 'hr-business-partner',
    department: 'hr',
    group: 'people-operations',
    seniority: 'manager',
    labels: { ru: 'HR Business Partner', en: 'HR Business Partner' },
    aliases: {
      ru: ['hrbp', 'people partner', 'эйчар бизнес партнер'],
      en: ['hrbp', 'people partner'],
    },
    acronyms: ['HRBP'],
    keywords: { ru: ['люди', 'команды'], en: ['people', 'teams'] },
    popularityRank: 18,
    localePriority: { ru: 15, en: 15 },
  }),
  role({
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
  role({
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
  role({
    id: 'people-operations-manager',
    department: 'hr',
    group: 'people-operations',
    seniority: 'manager',
    labels: { ru: 'People Operations Manager', en: 'People Operations Manager' },
    aliases: {
      ru: ['people ops', 'менеджер hr-операций'],
      en: ['people ops manager', 'hr operations manager'],
    },
    keywords: { ru: ['hr-процессы', 'people ops'], en: ['hr processes', 'people ops'] },
    popularityRank: 54,
    localePriority: { ru: 39, en: 40 },
  }),
  role({
    id: 'learning-development-manager',
    department: 'hr',
    group: 'people-operations',
    seniority: 'manager',
    labels: { ru: 'Learning and Development Manager', en: 'Learning and Development Manager' },
    aliases: { ru: ['l&d manager', 'менеджер обучения'], en: ['l&d manager', 'training manager'] },
    acronyms: ['L&D'],
    keywords: { ru: ['обучение', 'развитие'], en: ['learning', 'development'] },
    popularityRank: 60,
    localePriority: { ru: 45, en: 46 },
  }),
  role({
    id: 'finance-manager',
    department: 'finance',
    group: 'finance-control',
    seniority: 'manager',
    labels: { ru: 'Финансовый менеджер', en: 'Finance Manager' },
    aliases: { ru: ['finance manager', 'финансовый контролер'], en: ['financial manager'] },
    keywords: { ru: ['бюджет', 'финансы'], en: ['budget', 'finance'] },
    popularityRank: 20,
    localePriority: { ru: 17, en: 17 },
  }),
  role({
    id: 'financial-controller',
    department: 'finance',
    group: 'finance-control',
    seniority: 'manager',
    labels: { ru: 'Финансовый контролёр', en: 'Financial Controller' },
    aliases: { ru: ['финансовый контролер', 'controller'], en: ['controller'] },
    keywords: { ru: ['контроль', 'отчетность'], en: ['controls', 'reporting'] },
    popularityRank: 37,
    localePriority: { ru: 27, en: 29 },
  }),
  role({
    id: 'accountant',
    department: 'finance',
    group: 'finance-control',
    seniority: 'individual_contributor',
    labels: { ru: 'Бухгалтер', en: 'Accountant' },
    aliases: { ru: ['accountant', 'специалист бухгалтерии'], en: ['bookkeeper'] },
    keywords: { ru: ['учет', 'налоги'], en: ['accounting', 'taxes'] },
    popularityRank: 50,
    localePriority: { ru: 28, en: 44 },
  }),
  role({
    id: 'fp-and-a-manager',
    department: 'finance',
    group: 'finance-control',
    seniority: 'manager',
    labels: { ru: 'FP&A Manager', en: 'FP&A Manager' },
    aliases: {
      ru: ['финансовое планирование', 'financial planning manager'],
      en: ['financial planning manager'],
    },
    acronyms: ['FP&A'],
    keywords: { ru: ['планирование', 'прогноз'], en: ['planning', 'forecasting'] },
    popularityRank: 62,
    localePriority: { ru: 47, en: 47 },
  }),
  role({
    id: 'chief-financial-officer',
    department: 'finance',
    group: 'finance-control',
    seniority: 'executive',
    labels: { ru: 'Chief Financial Officer', en: 'Chief Financial Officer' },
    aliases: { ru: ['cfo', 'финансовый директор'], en: ['cfo', 'finance director'] },
    acronyms: ['CFO'],
    keywords: { ru: ['финансовая стратегия'], en: ['financial strategy'] },
    popularityRank: 61,
    localePriority: { ru: 44, en: 44 },
  }),
  role({
    id: 'legal-counsel',
    department: 'legal',
    group: 'legal-compliance',
    seniority: 'individual_contributor',
    labels: { ru: 'Юрист', en: 'Legal Counsel' },
    aliases: { ru: ['legal counsel', 'корпоративный юрист'], en: ['lawyer', 'corporate counsel'] },
    keywords: { ru: ['договоры', 'право'], en: ['contracts', 'legal'] },
    popularityRank: 30,
    localePriority: { ru: 24, en: 30 },
  }),
  role({
    id: 'compliance-manager',
    department: 'legal',
    group: 'legal-compliance',
    seniority: 'manager',
    labels: { ru: 'Compliance Manager', en: 'Compliance Manager' },
    aliases: { ru: ['комплаенс-менеджер', 'compliance officer'], en: ['compliance officer'] },
    keywords: { ru: ['регуляторика', 'комплаенс'], en: ['regulation', 'compliance'] },
    popularityRank: 64,
    localePriority: { ru: 48, en: 48 },
  }),
  role({
    id: 'contract-manager',
    department: 'legal',
    group: 'legal-compliance',
    seniority: 'manager',
    labels: { ru: 'Contract Manager', en: 'Contract Manager' },
    aliases: { ru: ['менеджер договоров', 'специалист по договорам'], en: ['contracts manager'] },
    keywords: { ru: ['договоры', 'согласование'], en: ['contracts', 'review'] },
    popularityRank: 66,
    localePriority: { ru: 49, en: 49 },
  }),
  role({
    id: 'data-protection-officer',
    department: 'legal',
    group: 'legal-compliance',
    seniority: 'lead',
    labels: { ru: 'Data Protection Officer', en: 'Data Protection Officer' },
    aliases: { ru: ['dpo', 'специалист по персональным данным'], en: ['dpo', 'privacy officer'] },
    acronyms: ['DPO'],
    keywords: { ru: ['персональные данные', 'privacy'], en: ['privacy', 'personal data'] },
    popularityRank: 70,
    localePriority: { ru: 52, en: 52 },
  }),
]

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

interface RoleMatchScore {
  matchKind: RoleMatchKind
  matchLabel: string
  score: number
}

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
