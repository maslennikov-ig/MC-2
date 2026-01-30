/**
 * Mock data for clarifying questions redesign comparison
 */
import type { QuestionPriority, QuestionType } from '@megacampus/shared-types'

export interface MockSuggestedAnswer {
  text: string
  rationale?: string
  is_recommended?: boolean
}

export interface MockQuestion {
  id: string
  text: string
  type: QuestionType
  priority: QuestionPriority
  isAnswered: boolean
  currentAnswer?: string
  currentAnswers?: string[]
  suggestedAnswers: MockSuggestedAnswer[]
}

export const mockQuestions: MockQuestion[] = [
  {
    id: '1',
    text: 'Какие типы мероприятий продаёт отдел?',
    type: 'multi_choice',
    priority: 'critical',
    isAnswered: true,
    currentAnswers: ['Концерты', 'Бизнес-мероприятия', 'Спортивные события'],
    suggestedAnswers: [
      { text: 'Концерты', rationale: 'Музыкальные мероприятия' },
      { text: 'Бизнес-мероприятия', rationale: 'Конференции, семинары' },
      { text: 'Спортивные события', rationale: 'Матчи, соревнования' },
      { text: 'Выставки', rationale: 'Арт-события, галереи' },
    ],
  },
  {
    id: '2',
    text: 'Какой уровень опыта у продавцов?',
    type: 'single_choice',
    priority: 'critical',
    isAnswered: true,
    currentAnswer: 'Смешанный: от новичков до опытных',
    suggestedAnswers: [
      { text: 'Начинающие (менее 1 года)', rationale: 'Требуется базовое обучение' },
      { text: 'Средний опыт (1-3 года)', rationale: 'Знают основы, нужна специализация' },
      {
        text: 'Смешанный: от новичков до опытных',
        rationale: 'Разный уровень в команде',
        is_recommended: true,
      },
      { text: 'Опытные (3+ лет)', rationale: 'Продвинутое обучение' },
    ],
  },
  {
    id: '3',
    text: 'Какие основные проблемы стоят перед отделом продаж?',
    type: 'open',
    priority: 'critical',
    isAnswered: true,
    currentAnswer:
      'Низкая конверсия холодных звонков, сложности с удержанием клиентов, отсутствие скриптов для работы с возражениями',
    suggestedAnswers: [
      {
        text: 'Низкая конверсия на этапе первичного контакта',
        rationale: 'Типичная проблема в продажах мероприятий',
        is_recommended: true,
      },
      {
        text: 'Сложности с upsell и cross-sell',
        rationale: 'Потенциал для роста среднего чека',
      },
    ],
  },
  {
    id: '4',
    text: 'Используются ли CRM системы в работе?',
    type: 'single_choice',
    priority: 'important',
    isAnswered: false,
    suggestedAnswers: [
      { text: 'Да, активно используем', rationale: 'Полная интеграция в процессы' },
      { text: 'Частично', rationale: 'Не все функции используются', is_recommended: true },
      { text: 'Нет, планируем внедрение', rationale: 'Нужны рекомендации по выбору' },
      { text: 'Нет, не планируем', rationale: 'Работаем по-другому' },
    ],
  },
  {
    id: '5',
    text: 'Какой средний чек на мероприятия?',
    type: 'open',
    priority: 'nice_to_have',
    isAnswered: false,
    suggestedAnswers: [
      { text: 'До 5 000 рублей', rationale: 'Массовый сегмент' },
      { text: '5 000 - 20 000 рублей', rationale: 'Средний сегмент', is_recommended: true },
      { text: 'Более 20 000 рублей', rationale: 'Премиум сегмент' },
    ],
  },
  {
    id: '6',
    text: 'Какие каналы продаж используются?',
    type: 'multi_choice',
    priority: 'important',
    isAnswered: false,
    suggestedAnswers: [
      { text: 'Телефонные продажи', rationale: 'Классический канал', is_recommended: true },
      { text: 'Email-маркетинг', rationale: 'Автоматизированные рассылки' },
      { text: 'Социальные сети', rationale: 'Таргетированная реклама' },
      { text: 'Партнёрские программы', rationale: 'Агентская сеть' },
    ],
  },
]

export const variantDescriptions = {
  minimal: {
    title: 'Минималистичный монохром',
    description:
      'Оттенки серого + один акцентный цвет. Тонкая полоска приоритета вместо яркого бордера.',
    pros: ['Чистый, профессиональный вид', 'Фокус на контенте', 'Меньше визуального шума'],
    cons: ['Может быть слишком сдержанным', 'Приоритеты менее заметны'],
  },
  accordion: {
    title: 'Аккордеон',
    description: 'Свёрнутые отвеченные вопросы, развёрнутые неотвеченные.',
    pros: ['Компактность', 'Легко сканировать прогресс', 'Фокус на текущем вопросе'],
    cons: ['Нужен дополнительный клик для просмотра ответа', 'Менее наглядно'],
  },
  wizard: {
    title: 'Пошаговый Wizard',
    description: 'Один вопрос за раз с прогресс-баром.',
    pros: ['Максимальный фокус', 'Нет информационной перегрузки', 'Gamification'],
    cons: ['Нельзя увидеть все вопросы сразу', 'Больше кликов для навигации'],
  },
  field: {
    title: 'Карточки с тонкими индикаторами',
    description: 'shadcn Field паттерн с минималистичными индикаторами состояния.',
    pros: ['Современный вид', 'Консистентность с shadcn', 'Профессионально'],
    cons: ['Требует больше вертикального пространства', 'Менее компактно'],
  },
  floating: {
    title: 'Плавающие карточки с группировкой',
    description: 'Группировка по приоритету в секции с анимациями.',
    pros: ['Чёткая структура', 'Gamification через секции', 'Визуально приятно'],
    cons: ['Сложнее в реализации', 'Больше анимаций = больше отвлечений'],
  },
}

export type VariantKey = keyof typeof variantDescriptions
