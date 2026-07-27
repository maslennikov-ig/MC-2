import { NextIntlClientProvider } from 'next-intl'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CareerPlaybookViewerPageClient from '@/app/[locale]/career-playbook/[id]/page-client'
import {
  setCareerPlaybookClientForTests,
  useCareerPlaybookStore,
  type CareerPlaybookClient,
} from '@/stores/use-career-playbook-store'

vi.mock('@/components/layouts/header', () => ({
  default: () => <header data-testid="shared-header" />,
}))

const updateVisibility = vi.fn()
const previewCourseFromPlaybook = vi.fn()
const createCourseFromPlaybook = vi.fn()
const routerPush = vi.fn()
const copyToClipboard = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPush,
  }),
}))

vi.mock('@/components/career-playbook/library/client-adapter', () => ({
  updateCareerPlaybookVisibility: (...args: unknown[]) =>
    updateVisibility(
      ...(args as [
        playbookId: string,
        visibility: 'private' | 'organization' | 'public',
        locale: string,
      ])
    ),
  previewCourseFromPlaybook: (...args: unknown[]) =>
    previewCourseFromPlaybook(...(args as [input: { playbookId: string }])),
  createCourseFromPlaybook: (...args: unknown[]) =>
    createCourseFromPlaybook(...(args as [input: Record<string, unknown>])),
}))

vi.mock('@/lib/utils/clipboard', () => ({
  copyToClipboard,
}))

const messages = {
  common: {
    visibility: {
      private: 'Private',
      organization: 'Organization',
      public: 'Public',
      label: 'Visibility',
      changeSuccess: 'Visibility updated',
      changeError: 'Failed to update visibility',
    },
  },
  'career-playbook': {
    library: {
      createCourseDialog: {
        title: 'Review course draft',
        description: 'Check the course passport before generation starts.',
        loadingPreview: 'Loading course draft...',
        previewErrorTitle: 'Could not prepare course draft',
        retryPreview: 'Retry',
        roleGuideSourceTitle: 'Primary source',
        roleGuideSourceDescription: 'The final Role Guide will be uploaded as the main source.',
        titleLabel: 'Course title',
        descriptionLabel: 'What the course will cover',
        targetAudienceLabel: 'Target audience',
        learningOutcomesLabel: 'Learning outcomes',
        learningOutcomesHelp: 'One outcome per line.',
        languageLabel: 'Language',
        courseSizeLabel: 'Course size',
        styleLabel: 'Style',
        styleOptions: {
          professional: 'Professional',
          practical: 'Practical',
          problem_based: 'Problem based',
          analytical: 'Analytical',
          conversational: 'Conversational',
          storytelling: 'Storytelling',
          interactive: 'Interactive',
          motivational: 'Motivational',
          academic: 'Academic',
          technical: 'Technical',
          research: 'Research',
          gamified: 'Gamified',
        },
        sourcesTitle: 'Supporting sources',
        webResearchLabel: 'Include web research',
        webResearchDescription: 'Use external role research as an additional source.',
        businessContextLabel: 'Include uploaded company context',
        businessContextDescription: '{count} source files are available.',
        businessContextUnavailable: 'No uploaded company context sources are available.',
        createAndGenerate: 'Create and generate',
        loading: 'Creating course...',
        errorTitle: 'Course creation failed',
        genericError: 'Could not create a course from this Role Guide.',
      },
    },
    viewer: {
      productLabel: 'Role Guide',
      contents: 'Contents',
      contentsAriaLabel: 'Role guide contents',
      actionsLabel: 'Role Guide actions',
      pdf: 'PDF',
      share: 'Share',
      createCourse: 'Create course',
      openCourse: 'View course',
      delete: 'Delete',
      editBlock: 'Edit {title}',
      regenerateBlock: 'Regenerate {title}',
      collapseBlock: 'Collapse {title}',
      expandBlock: 'Expand {title}',
      hideContents: 'Hide left panel',
      showContents: 'Show left panel',
      hideInspector: 'Hide right panel',
      showInspector: 'Show right panel',
      readingMode: 'Reading mode',
      exitReadingMode: 'Exit reading mode',
      readingHint: 'Clean reading without side panels',
      inspectorLabel: 'Document inspector',
      inspectorTitle: 'Document inspector',
      inspectorStatusTitle: 'Status',
      inspectorReadinessTitle: 'Readiness',
      inspectorWarningsTitle: 'Quality warnings',
      inspectorWarningsDescription: 'Review automated quality warnings before rollout.',
      qualityIssueOpenBlock: 'Open block',
      qualityIssueEditBlock: 'Edit',
      qualityIssueRegenerateBlock: 'Regenerate',
      qualityIssueSuggestionLabel: 'What to fix',
      qualityIssueLegacyTitle: 'System warning',
      qualityIssueSeverity: {
        critical: 'Critical',
        warning: 'Warning',
        info: 'Info',
      },
      inspectorReadyBlocks: '{ready} of {total} blocks ready',
      inspectorLanguage: 'Document language: {language}',
      inspectorNextStep: 'Next step: create an adaptation course',
      inspectorPrepare: 'Prepare for rollout',
      imageStatusTitle: 'Image',
      imageRegenerate: 'Regenerate',
      imageUnavailable: 'Image has not been created yet',
      imageStatusLabels: {
        pending: 'Pending',
        queued: 'Queued',
        generating: 'Generating',
        completed: 'Completed',
        failed: 'Failed',
      },
      waitingBlock: 'This block is waiting for generation.',
      editorTitle: 'Edit block',
      editorDescription:
        'Edit the markdown directly, or ask the backend regenerator for a focused rewrite.',
      blockMarkdown: 'Block markdown',
      saveChanges: 'Save changes',
      regenerationInstruction: 'Regeneration instruction',
      regenerationPlaceholder: 'Make this block more specific to enterprise sales.',
      regenerateBlockButton: 'Regenerate block',
      loading: 'Loading Role Guide...',
      unavailableTitle: 'Role Guide is unavailable',
      unavailableDescription: 'The viewer could not be loaded.',
      retry: 'Retry',
      viewerBackendPending:
        'Viewer backend is unavailable; showing a local preview until integration lands.',
      localPreviewTitle: 'Role Guide preview',
      localPreviewContent: '# Role Guide preview\n\nBackend viewer transport is not connected yet.',
      sharePending: 'Share links are unavailable until the backend action is connected',
      shareCopied: 'Public link copied',
      shareUnavailable: 'Make the guide public before sharing',
      shareCopyError: 'Could not copy public link',
      shareConfirmTitle: 'Make this Role Guide public?',
      shareConfirmDescription:
        'Anyone with the link will be able to view this Role Guide. The link will be copied automatically.',
      shareConfirmCancel: 'Cancel',
      shareConfirmAction: 'Make public and copy link',
      shareLinkLabel: 'Public link',
      shareCopyButton: 'Copy',
      sharePublishError: 'Could not create public link',
      coursePending: 'Course creation is unavailable until the backend action is connected',
      deletePending: 'Delete is unavailable until the backend action is connected',
      pdfPending: 'PDF export is unavailable until the backend action is connected',
      editLocal: 'Block edit saved locally until the backend action is connected',
      regenerateLocal: 'Block regenerated locally until the backend action is connected',
      generatingTitle: 'Generating {title}',
      blocksReady: '{ready} of {total} blocks ready',
      thinkingStream: 'Show thinking stream',
      streamingBlockPending: 'This block is being generated.',
      statusLabels: {
        draft: 'Draft',
        answering_fixed: 'Answering fixed questions',
        awaiting_followups: 'Awaiting follow-ups',
        answering_followups: 'Answering follow-ups',
        ready_to_generate: 'Ready to generate',
        generating: 'Generating',
        completed: 'Completed',
        failed: 'Failed',
      },
      blockStatusLabels: {
        pending: 'Pending',
        generating: 'Generating',
        generated: 'Ready',
        failed: 'Failed',
        regenerating: 'Regenerating',
      },
      blockGroups: {
        group_1_foundation: 'Foundation',
        group_2_operations: 'Operations',
        group_3_people: 'People',
        group_4_growth: 'Growth',
        group_5_system: 'System',
        group_6_wrap: 'Wrap-up',
      },
      blocks: {
        header: 'Role guide header',
        block_1: 'Mission and key results',
        block_2: 'Anti-goals',
        block_3: 'Responsibility zones',
        block_4: 'Duties',
        block_5: 'Decision authority matrix',
        block_6: 'KPI and metrics',
        block_7: 'Competencies',
        block_8: 'Tools and technologies',
        block_9: 'Human-tool collaboration',
        block_10: 'Dependencies',
        block_11: 'Career path',
        block_12: 'Candidate profile',
        block_13: 'Day in the life',
        block_14: 'Onboarding',
        block_15: 'Motivation',
        block_16: 'Main process',
        block_17: 'Red flags',
        block_18: 'FAQ',
        block_19: 'Industry context',
        block_20: 'Business model',
        block_21: 'Failure modes',
        block_22: 'Role README',
        block_23: 'Continuity plan',
        block_24: 'Role canvas',
        block_25: 'Footer',
        block_26: 'Implementation checklist',
      },
    },
  },
}

const ruMessages = {
  common: {
    visibility: {
      private: 'Приватный',
      organization: 'Для организации',
      public: 'Публичный',
      label: 'Видимость',
      changeSuccess: 'Видимость обновлена',
      changeError: 'Не удалось обновить видимость',
    },
  },
  'career-playbook': {
    library: {
      createCourseDialog: {
        ...messages['career-playbook'].library.createCourseDialog,
        title: 'Проверить курс перед созданием',
        description: 'Проверьте паспорт курса перед запуском генерации.',
        loadingPreview: 'Загружаем черновик курса...',
        previewErrorTitle: 'Не удалось подготовить черновик курса',
        retryPreview: 'Повторить',
        roleGuideSourceTitle: 'Основной источник',
        roleGuideSourceDescription:
          'Финальная должностная инструкция будет загружена как основной источник.',
        titleLabel: 'Название курса',
        descriptionLabel: 'Что будет в курсе',
        targetAudienceLabel: 'Целевая аудитория',
        learningOutcomesLabel: 'Результаты обучения',
        learningOutcomesHelp: 'Один результат на строку.',
        languageLabel: 'Язык',
        courseSizeLabel: 'Размер курса',
        styleLabel: 'Стиль',
        styleOptions: {
          professional: 'Профессиональный',
          practical: 'Практический',
          problem_based: 'Проблемно-ориентированный',
          analytical: 'Аналитический',
          conversational: 'Разговорный',
          storytelling: 'Сторителлинг',
          interactive: 'Интерактивный',
          motivational: 'Мотивационный',
          academic: 'Академический',
          technical: 'Технический',
          research: 'Исследовательский',
          gamified: 'Игровой',
        },
        sourcesTitle: 'Дополнительные источники',
        webResearchLabel: 'Добавить web research',
        webResearchDescription:
          'Использовать внешнее исследование роли как дополнительный источник.',
        businessContextLabel: 'Добавить загруженный бизнес-контекст',
        businessContextDescription: 'Доступно файлов: {count}.',
        businessContextUnavailable: 'Загруженные источники бизнес-контекста недоступны.',
        createAndGenerate: 'Создать и запустить генерацию',
        loading: 'Создаём курс...',
        errorTitle: 'Не удалось создать курс',
        genericError: 'Не удалось создать курс из должностной инструкции.',
      },
    },
    viewer: {
      ...messages['career-playbook'].viewer,
      contents: 'Содержание',
      contentsAriaLabel: 'Содержание должностной инструкции',
      actionsLabel: 'Действия с должностной инструкцией',
      share: 'Поделиться',
      createCourse: 'Создать курс из инструкции',
      openCourse: 'Посмотреть курс',
      delete: 'Удалить',
      hideContents: 'Скрыть левую панель',
      showContents: 'Показать левую панель',
      hideInspector: 'Скрыть правый блок',
      showInspector: 'Показать правый блок',
      readingMode: 'Режим чтения',
      exitReadingMode: 'Выйти из режима чтения',
      readingHint: 'Чистое чтение без боковых панелей',
      inspectorLabel: 'Инспектор документа',
      inspectorTitle: 'Инспектор документа',
      inspectorStatusTitle: 'Состояние',
      inspectorReadinessTitle: 'Готовность',
      inspectorWarningsTitle: 'Предупреждения качества',
      inspectorWarningsDescription: 'Проверьте предупреждения качества перед внедрением.',
      qualityIssueOpenBlock: 'Открыть блок',
      qualityIssueEditBlock: 'Редактировать',
      qualityIssueRegenerateBlock: 'Перегенерировать',
      qualityIssueSuggestionLabel: 'Что исправить',
      qualityIssueLegacyTitle: 'Системное предупреждение',
      qualityIssueSeverity: {
        critical: 'Критично',
        warning: 'Предупреждение',
        info: 'Инфо',
      },
      inspectorReadyBlocks: 'Готово блоков: {ready} из {total}',
      inspectorLanguage: 'Язык документа: {language}',
      inspectorNextStep: 'Следующий шаг: создать курс для адаптации',
      inspectorPrepare: 'Подготовить к внедрению',
      imageStatusTitle: 'Изображение',
      imageRegenerate: 'Перегенерировать',
      imageUnavailable: 'Изображение ещё не создано',
      imageStatusLabels: {
        pending: 'Ожидает',
        queued: 'В очереди',
        generating: 'Генерируется',
        completed: 'Готово',
        failed: 'Ошибка',
      },
      localPreviewTitle: 'Превью должностной инструкции',
      localPreviewContent:
        '# Превью должностной инструкции\n\nСерверный просмотр ещё не подключён.',
      viewerBackendPending:
        'Серверный просмотр пока недоступен; показываем локальное превью до подключения интеграции.',
      shareCopied: 'Публичная ссылка скопирована',
      shareUnavailable: 'Сделать публичную ссылку может только владелец или администратор',
      shareCopyError: 'Не удалось скопировать публичную ссылку',
      shareConfirmTitle: 'Сделать инструкцию публичной?',
      shareConfirmDescription:
        'Любой человек со ссылкой сможет открыть эту должностную инструкцию. Ссылка скопируется автоматически.',
      shareConfirmCancel: 'Отмена',
      shareConfirmAction: 'Сделать публичной и скопировать ссылку',
      shareLinkLabel: 'Публичная ссылка',
      shareCopyButton: 'Скопировать',
      sharePublishError: 'Не удалось создать публичную ссылку',
      statusLabels: {
        draft: 'Черновик',
        answering_fixed: 'Ответы на основные вопросы',
        awaiting_followups: 'Ожидает уточнений',
        answering_followups: 'Ответы на уточнения',
        ready_to_generate: 'Готово к генерации',
        generating: 'Генерируется',
        completed: 'Готово',
        failed: 'Ошибка',
      },
      blockStatusLabels: {
        pending: 'Ожидает',
        generating: 'Генерируется',
        generated: 'Готово',
        failed: 'Ошибка',
        regenerating: 'Генерируется заново',
      },
      blockGroups: {
        group_1_foundation: 'Основа',
        group_2_operations: 'Работа',
        group_3_people: 'Люди и навыки',
        group_4_growth: 'Рост',
        group_5_system: 'Система',
        group_6_wrap: 'Итог',
      },
      blocks: {
        header: 'Шапка документа',
        block_1: 'Миссия и ключевые результаты',
        block_2: 'Что не входит в роль',
        block_3: 'Зоны ответственности',
        block_4: 'Обязанности',
        block_5: 'Матрица полномочий',
        block_6: 'Показатели эффективности',
        block_7: 'Компетенции',
        block_8: 'Инструменты и технологии',
        block_9: 'Работа человека и цифровых инструментов',
        block_10: 'Зависимости',
        block_11: 'Карьерный путь',
        block_12: 'Профиль кандидата',
        block_13: 'День в роли',
        block_14: 'Адаптация',
        block_15: 'Мотивация',
        block_16: 'Основной процесс',
        block_17: 'Красные флаги',
        block_18: 'Частые вопросы',
        block_19: 'Контекст отрасли',
        block_20: 'Бизнес-модель',
        block_21: 'Сценарии сбоев',
        block_22: 'Памятка роли',
        block_23: 'План преемственности',
        block_24: 'Карта роли',
        block_25: 'Заключение',
        block_26: 'Чеклист внедрения',
      },
    },
  },
}

function renderPage({
  locale = 'en',
  playbookId = '00000000-0000-4000-8000-000000002001',
}: {
  locale?: 'en' | 'ru'
  playbookId?: string
} = {}) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'ru' ? ruMessages : messages}>
      <CareerPlaybookViewerPageClient locale={locale} playbookId={playbookId} />
    </NextIntlClientProvider>
  )
}

function mockCoursePreview() {
  previewCourseFromPlaybook.mockResolvedValue({
    playbookId: '00000000-0000-4000-8000-000000002001',
    brief: {
      title: 'Руководитель продаж',
      courseDescription: 'Курс по должностной инструкции руководителя продаж.',
      targetAudience: 'Руководители продаж',
      learningOutcomes: ['Выстроить KPI', 'Запустить адаптацию'],
      language: 'ru',
      courseSize: 'auto',
      style: 'professional',
    },
    defaults: {
      includeWebResearch: false,
      includeBusinessContextSources: false,
    },
    sources: {
      roleGuide: { included: true },
      webResearch: { available: true, defaultIncluded: false },
      businessContextSources: {
        available: false,
        defaultIncluded: false,
        sourceCount: 0,
        sources: [],
      },
    },
  })
}

describe('CareerPlaybookViewerPageClient', () => {
  beforeEach(() => {
    useCareerPlaybookStore.getState().resetCareerPlaybookWizard()
    setCareerPlaybookClientForTests(null)
    updateVisibility.mockReset()
    previewCourseFromPlaybook.mockReset()
    createCourseFromPlaybook.mockReset()
    routerPush.mockReset()
    copyToClipboard.mockReset()
    copyToClipboard.mockResolvedValue(true)
    localStorage.clear()
  })

  it('does not create a local preview for non-skeleton backend failures', async () => {
    const getViewer = vi
      .fn<NonNullable<CareerPlaybookClient['getViewer']>>()
      .mockRejectedValue(new Error('FORBIDDEN'))
    setCareerPlaybookClientForTests({ getViewer, submitAnswer: vi.fn() })

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Role Guide is unavailable' })
    ).toBeInTheDocument()
    expect(screen.getByText('FORBIDDEN')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Role Guide preview' })).not.toBeInTheDocument()
  })

  it('creates a localized local preview only for backend-pending skeleton errors', async () => {
    const getViewer = vi
      .fn<NonNullable<CareerPlaybookClient['getViewer']>>()
      .mockRejectedValue(new Error('METHOD_NOT_SUPPORTED'))
    setCareerPlaybookClientForTests({ getViewer, submitAnswer: vi.fn() })

    renderPage({ locale: 'ru' })

    expect(
      await screen.findAllByRole('heading', { name: 'Превью должностной инструкции' })
    ).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Поделиться' })).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: 'Содержание должностной инструкции' })
    ).toHaveTextContent('Содержание')
    expect(
      screen.getByRole('navigation', { name: 'Содержание должностной инструкции' })
    ).toHaveTextContent('Миссия и ключевые результаты')
    expect(screen.queryByRole('link', { name: 'Mission and key results' })).not.toBeInTheDocument()
  })

  it('updates owner visibility from the reader inspector', async () => {
    const user = userEvent.setup()
    const getViewer = vi.fn<NonNullable<CareerPlaybookClient['getViewer']>>().mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000002001',
      title: 'Руководитель продаж',
      department: 'Продажи',
      level: 'lead',
      contentLanguage: 'ru',
      status: 'completed',
      visibility: 'private',
      isPublic: false,
      shareSlug: null,
      ownerId: 'owner-user',
      viewerPermissions: {
        canEdit: true,
        canManageVisibility: true,
        canCreateCourse: true,
        canDelete: true,
      },
      blocks: {
        header: {
          content: '# Руководитель продаж',
          status: 'generated',
          attempt: 0,
        },
      },
    })
    updateVisibility.mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000002001',
      isPublic: false,
      visibility: 'organization',
      shareSlug: null,
      viewerPermissions: {
        canEdit: true,
        canManageVisibility: true,
        canCreateCourse: true,
        canDelete: true,
      },
    })
    setCareerPlaybookClientForTests({ getViewer, submitAnswer: vi.fn() })

    renderPage({ locale: 'ru' })

    await user.click(await screen.findByRole('button', { name: /Видимость: Приватный/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Для организации' }))

    expect(updateVisibility).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000002001',
      'organization',
      'ru'
    )
    await waitFor(() => {
      expect(useCareerPlaybookStore.getState().viewer?.visibility).toBe('organization')
    })
    expect(screen.getByRole('button', { name: /Видимость: Для организации/ })).toBeInTheDocument()
  })

  it('opens the real course preview dialog from the private viewer action', async () => {
    const user = userEvent.setup()
    mockCoursePreview()
    const getViewer = vi.fn<NonNullable<CareerPlaybookClient['getViewer']>>().mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000002001',
      title: 'Руководитель продаж',
      department: 'Продажи',
      level: 'lead',
      contentLanguage: 'ru',
      status: 'completed',
      visibility: 'private',
      isPublic: false,
      shareSlug: null,
      ownerId: 'owner-user',
      viewerPermissions: {
        canEdit: true,
        canManageVisibility: true,
        canCreateCourse: true,
        canDelete: true,
      },
      blocks: {
        header: {
          content: '# Руководитель продаж',
          status: 'generated',
          attempt: 0,
        },
      },
    })
    setCareerPlaybookClientForTests({ getViewer, submitAnswer: vi.fn() })

    renderPage({ locale: 'ru' })

    await user.click(await screen.findByRole('button', { name: 'Создать курс из инструкции' }))

    expect(
      await screen.findByRole('dialog', { name: 'Проверить курс перед созданием' })
    ).toBeInTheDocument()
    expect(await screen.findByLabelText('Название курса')).toHaveValue('Руководитель продаж')
    expect(screen.getByRole('option', { name: 'Стандартный (30-50 уроков)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Профессиональный' })).toBeInTheDocument()
    expect(
      screen.queryByText('Создание курса будет доступно после подключения серверного действия')
    ).not.toBeInTheDocument()
  })

  it('hides the course creation action when viewer permissions deny it', async () => {
    mockCoursePreview()
    const getViewer = vi.fn<NonNullable<CareerPlaybookClient['getViewer']>>().mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000002001',
      title: 'Руководитель продаж',
      department: 'Продажи',
      level: 'lead',
      contentLanguage: 'ru',
      status: 'completed',
      visibility: 'private',
      isPublic: false,
      shareSlug: null,
      ownerId: 'owner-user',
      viewerPermissions: {
        canEdit: true,
        canManageVisibility: true,
        canCreateCourse: false,
        canDelete: true,
      },
      blocks: {
        header: {
          content: '# Руководитель продаж',
          status: 'generated',
          attempt: 0,
        },
      },
    })
    setCareerPlaybookClientForTests({ getViewer, submitAnswer: vi.fn() })

    renderPage({ locale: 'ru' })

    expect(await screen.findByRole('heading', { name: 'Руководитель продаж' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Создать курс из инструкции' })
    ).not.toBeInTheDocument()
    expect(previewCourseFromPlaybook).not.toHaveBeenCalled()
  })

  it('opens an already linked course instead of showing course creation', async () => {
    mockCoursePreview()
    const getViewer = vi.fn<NonNullable<CareerPlaybookClient['getViewer']>>().mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000002001',
      title: 'Руководитель продаж',
      department: 'Продажи',
      level: 'lead',
      contentLanguage: 'ru',
      status: 'completed',
      visibility: 'private',
      isPublic: false,
      shareSlug: null,
      ownerId: 'owner-user',
      viewerPermissions: {
        canEdit: true,
        canManageVisibility: true,
        canCreateCourse: true,
        canDelete: true,
      },
      linkedCourse: {
        id: 'course-1',
        title: 'Курс для руководителя продаж',
        slug: 'sales-leadership-course',
        organizationSlug: 'mega-campus',
        status: 'draft',
        generationStatus: 'completed',
      },
      blocks: {
        header: {
          content: '# Руководитель продаж',
          status: 'generated',
          attempt: 0,
        },
      },
    } as never)
    setCareerPlaybookClientForTests({ getViewer, submitAnswer: vi.fn() })

    renderPage({ locale: 'ru' })

    expect(await screen.findByRole('heading', { name: 'Руководитель продаж' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Посмотреть курс' })).toHaveAttribute(
      'href',
      '/ru/courses/mega-campus/sales-leadership-course'
    )
    expect(
      screen.queryByRole('button', { name: 'Создать курс из инструкции' })
    ).not.toBeInTheDocument()
    expect(previewCourseFromPlaybook).not.toHaveBeenCalled()
  })

  it('renders viewer snapshots with unknown waiting statuses without crashing', async () => {
    const getViewer = vi.fn<NonNullable<CareerPlaybookClient['getViewer']>>().mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000002001',
      title: 'Контент-менеджер',
      department: 'Маркетинг',
      level: 'senior',
      contentLanguage: 'ru',
      status: 'waiting',
      visibility: 'private',
      isPublic: false,
      shareSlug: null,
      ownerId: 'owner-user',
      viewerPermissions: {
        canEdit: true,
        canManageVisibility: true,
        canCreateCourse: true,
        canDelete: true,
      },
      blocks: {
        header: {
          content: '# Контент-менеджер',
          status: 'waiting',
          attempt: 0,
        },
      },
    } as never)
    setCareerPlaybookClientForTests({ getViewer, submitAnswer: vi.fn() })

    renderPage({ locale: 'ru' })

    expect(await screen.findByRole('heading', { name: 'Контент-менеджер' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('Ожидает').length).toBeGreaterThan(0))
  })

  it('copies the canonical public URL from the reader inspector', async () => {
    const user = userEvent.setup()
    const getViewer = vi.fn<NonNullable<CareerPlaybookClient['getViewer']>>().mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000002001',
      title: 'Head of Sales',
      department: 'Sales',
      level: 'lead',
      contentLanguage: 'en',
      status: 'completed',
      visibility: 'public',
      isPublic: true,
      shareSlug: 'head-of-sales-a1b2c3',
      organizationSlug: 'mega-campus',
      ownerId: 'owner-user',
      viewerPermissions: {
        canEdit: true,
        canManageVisibility: true,
        canCreateCourse: true,
        canDelete: true,
      },
      blocks: {
        header: {
          content: '# Head of Sales',
          status: 'generated',
          attempt: 0,
        },
      },
    })
    setCareerPlaybookClientForTests({ getViewer, submitAnswer: vi.fn() })

    renderPage({ locale: 'en' })

    await user.click(await screen.findByRole('button', { name: 'Share' }))

    expect(copyToClipboard).toHaveBeenCalledWith(
      'http://localhost:3000/en/career-playbooks/mega-campus/head-of-sales-a1b2c3'
    )
    expect(screen.getByText('Public link copied')).toBeInTheDocument()
  })

  it('asks before publishing a private viewer for sharing and respects cancel', async () => {
    const user = userEvent.setup()
    const getViewer = vi.fn<NonNullable<CareerPlaybookClient['getViewer']>>().mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000002001',
      title: 'Руководитель продаж',
      department: 'Продажи',
      level: 'lead',
      contentLanguage: 'ru',
      status: 'completed',
      visibility: 'private',
      isPublic: false,
      shareSlug: null,
      organizationSlug: 'mega-campus',
      ownerId: 'owner-user',
      viewerPermissions: {
        canEdit: true,
        canManageVisibility: true,
        canCreateCourse: true,
        canDelete: true,
      },
      blocks: {
        header: {
          content: '# Руководитель продаж',
          status: 'generated',
          attempt: 0,
        },
      },
    })
    setCareerPlaybookClientForTests({ getViewer, submitAnswer: vi.fn() })

    renderPage({ locale: 'ru' })

    await user.click(await screen.findByRole('button', { name: 'Поделиться' }))

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Сделать инструкцию публичной?',
    })
    expect(within(dialog).getByText(/Любой человек со ссылкой сможет открыть/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))

    expect(updateVisibility).not.toHaveBeenCalled()
    expect(copyToClipboard).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Публичная ссылка')).not.toBeInTheDocument()
  })

  it('publishes a private viewer, auto-copies the URL, and shows the public link block', async () => {
    const user = userEvent.setup()
    const getViewer = vi.fn<NonNullable<CareerPlaybookClient['getViewer']>>().mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000002001',
      title: 'Руководитель продаж',
      department: 'Продажи',
      level: 'lead',
      contentLanguage: 'ru',
      status: 'completed',
      visibility: 'private',
      isPublic: false,
      shareSlug: null,
      organizationSlug: 'mega-campus',
      ownerId: 'owner-user',
      viewerPermissions: {
        canEdit: true,
        canManageVisibility: true,
        canCreateCourse: true,
        canDelete: true,
      },
      blocks: {
        header: {
          content: '# Руководитель продаж',
          status: 'generated',
          attempt: 0,
        },
      },
    })
    updateVisibility.mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000002001',
      isPublic: true,
      visibility: 'public',
      shareSlug: 'rukovoditel-prodazh-a1b2c3',
      organizationSlug: 'mega-campus',
      viewerPermissions: {
        canEdit: true,
        canManageVisibility: true,
        canCreateCourse: true,
        canDelete: true,
      },
    })
    setCareerPlaybookClientForTests({ getViewer, submitAnswer: vi.fn() })

    renderPage({ locale: 'ru' })

    await user.click(await screen.findByRole('button', { name: 'Поделиться' }))
    await user.click(
      await screen.findByRole('button', { name: 'Сделать публичной и скопировать ссылку' })
    )

    const expectedUrl =
      'http://localhost:3000/ru/career-playbooks/mega-campus/rukovoditel-prodazh-a1b2c3'

    expect(updateVisibility).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000002001',
      'public',
      'ru'
    )
    expect(copyToClipboard).toHaveBeenCalledWith(expectedUrl)
    expect(await screen.findByLabelText('Публичная ссылка')).toHaveValue(expectedUrl)
    expect(screen.getByText('Публичная ссылка скопирована')).toBeInTheDocument()
    await waitFor(() => {
      expect(useCareerPlaybookStore.getState().viewer?.visibility).toBe('public')
    })
  })

  it('copies the visible public link again from the inline share block', async () => {
    const user = userEvent.setup()
    const getViewer = vi.fn<NonNullable<CareerPlaybookClient['getViewer']>>().mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000002001',
      title: 'Head of Sales',
      department: 'Sales',
      level: 'lead',
      contentLanguage: 'en',
      status: 'completed',
      visibility: 'public',
      isPublic: true,
      shareSlug: 'head-of-sales-a1b2c3',
      organizationSlug: 'mega-campus',
      ownerId: 'owner-user',
      viewerPermissions: {
        canEdit: true,
        canManageVisibility: true,
        canCreateCourse: true,
        canDelete: true,
      },
      blocks: {
        header: {
          content: '# Head of Sales',
          status: 'generated',
          attempt: 0,
        },
      },
    })
    setCareerPlaybookClientForTests({ getViewer, submitAnswer: vi.fn() })

    renderPage({ locale: 'en' })

    await user.click(await screen.findByRole('button', { name: 'Share' }))
    await user.click(await screen.findByRole('button', { name: 'Copy' }))

    expect(copyToClipboard).toHaveBeenCalledTimes(2)
    expect(copyToClipboard).toHaveBeenLastCalledWith(
      'http://localhost:3000/en/career-playbooks/mega-campus/head-of-sales-a1b2c3'
    )
  })

  it('does not show a public link when publishing succeeds without a share slug', async () => {
    const user = userEvent.setup()
    const getViewer = vi.fn<NonNullable<CareerPlaybookClient['getViewer']>>().mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000002001',
      title: 'Руководитель продаж',
      department: 'Продажи',
      level: 'lead',
      contentLanguage: 'ru',
      status: 'completed',
      visibility: 'private',
      isPublic: false,
      shareSlug: null,
      organizationSlug: 'mega-campus',
      ownerId: 'owner-user',
      viewerPermissions: {
        canEdit: true,
        canManageVisibility: true,
        canCreateCourse: true,
        canDelete: true,
      },
      blocks: {
        header: {
          content: '# Руководитель продаж',
          status: 'generated',
          attempt: 0,
        },
      },
    })
    updateVisibility.mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000002001',
      isPublic: true,
      visibility: 'public',
      shareSlug: null,
      organizationSlug: 'mega-campus',
      viewerPermissions: {
        canEdit: true,
        canManageVisibility: true,
        canCreateCourse: true,
        canDelete: true,
      },
    })
    setCareerPlaybookClientForTests({ getViewer, submitAnswer: vi.fn() })

    renderPage({ locale: 'ru' })

    await user.click(await screen.findByRole('button', { name: 'Поделиться' }))
    await user.click(
      await screen.findByRole('button', { name: 'Сделать публичной и скопировать ссылку' })
    )

    expect(copyToClipboard).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Публичная ссылка')).not.toBeInTheDocument()
    expect(await screen.findByText('Не удалось создать публичную ссылку')).toBeInTheDocument()
  })

  it('clears a previous viewer when the URL points at another playbook', async () => {
    const getViewer = vi
      .fn<NonNullable<CareerPlaybookClient['getViewer']>>()
      .mockRejectedValue(new Error('METHOD_NOT_SUPPORTED'))
    setCareerPlaybookClientForTests({ getViewer, submitAnswer: vi.fn() })
    useCareerPlaybookStore.getState().hydrateCareerPlaybookViewer({
      playbookId: '00000000-0000-4000-8000-000000002099',
      title: 'Old playbook',
      department: 'Sales',
      level: 'lead',
      contentLanguage: 'en',
      status: 'completed',
      blocks: {
        header: {
          content: '# Old playbook',
          status: 'generated',
          attempt: 0,
        },
      },
    })

    renderPage({ playbookId: '00000000-0000-4000-8000-000000002100' })

    expect(await screen.findAllByRole('heading', { name: 'Role Guide preview' })).not.toHaveLength(
      0
    )
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Old playbook' })).not.toBeInTheDocument()
    })
  })
})
