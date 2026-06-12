import { NextIntlClientProvider } from 'next-intl'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import CareerPlaybookNewPageClient from '@/app/[locale]/career-playbook/new/page-client'
import {
  setCareerPlaybookClientForTests,
  useCareerPlaybookStore,
} from '@/stores/use-career-playbook-store'

vi.mock('@/components/layouts/header', () => ({
  default: () => <header data-testid="shared-header" />,
}))

const messages = {
  'career-playbook': {
    wizard: {
      eyebrow: 'Career Playbook',
      title: 'Role Guide constructor',
      subtitle: 'Answer a few fixed questions before adaptive follow-ups.',
      back: 'Back',
      next: 'Next',
      finish: 'Finish Phase A',
      draftSaving: 'Saving draft...',
      draftSaved: 'Draft saved locally',
      draftUnsynced: 'Local draft saved. Server sync is pending.',
      openPlaceholder: 'Type your answer',
      chooseOneLabel: 'Choose one',
      chooseManyLabel: 'Choose several',
      otherOptionLabel: 'Other',
      otherOptionPlaceholder: 'Type your option',
      roleSuggestionsLabel: 'Suggested roles',
      roleSuggestionsHint: 'Pick a close role or keep your own title.',
      roleSuggestionsPopularLabel: 'Popular roles',
      roleSuggestionsNoResultsLabel: 'No exact match',
      roleSuggestionsManualTemplate: 'Use "{value}"',
      roleSuggestionsMatchPopular: 'Popular role',
      roleSuggestionsMatchLabel: 'Role title',
      roleSuggestionsMatchAlias: 'Alias',
      roleSuggestionsMatchAcronym: 'Acronym',
      roleSuggestionsMatchKeyword: 'Related query',
      departmentAutoLabel: 'Functional area',
      departmentAutoChange: 'Change',
      departmentResolving: 'Selecting functional area...',
      questionLabel: 'Question',
      answeredLabel: 'Answered',
      ofLabel: 'of',
      navigationLabel: 'Questions',
      documentPreviewLabel: 'Draft document',
      documentPreviewTitle: 'Role Guide',
      documentPreviewSubtitle: 'Answers are placed into the future document structure as you work.',
      documentPreviewEmpty: 'Appears after an answer',
      questionPanelLabel: 'Current question',
      summaryLabel: 'Summary',
      summaryTitle: 'Collected answers',
      businessContextNavigationLabel: 'Context',
      businessContextDocumentLabel: 'Business context',
      businessContextTitle: 'Business context',
      businessContextDescription:
        'Add company-specific product, customer, channel, process, metric, and constraint context.',
      businessContextEmpty: 'Fill this manually or attach files',
      businessContextPanelTitle: 'Sources',
      businessContextPanelDescription:
        'Useful inputs include proposals, product descriptions, sales playbooks, KPIs, org charts, and similar role guides.',
      businessContextMaterialsTitle: 'Materials and notes',
      businessContextMaterialsHelper:
        'Paste general context and attach files. This is the single place for anything that does not fit a specific category.',
      businessContextFilledTemplate: 'Filled {count} of {total}',
      businessContextSourcesReady: 'Sources ready',
      businessContextSourcesProcessing: 'Sources processing',
      businessContextSourcesFailed: 'Sources failed',
      businessContextSourcesEmpty: 'No sources added',
      businessContextPreviousStep: 'Previous step',
      businessContextNextStep: 'Next step',
      businessContextFilesTitle: 'Files',
      businessContextFilesDescription:
        'Files are saved as sources for this Role Guide, not as course materials.',
      businessContextFreeformTitle: 'Text and notes',
      businessContextFreeformDescription:
        'Paste sales playbooks, interview notes, or any context without uploading a file.',
      businessContextFreeformPlaceholder: 'Paste context that should shape the role guide...',
      businessContextUploadMissingSession: 'Create the Career Playbook session before upload',
      businessContextUploadMaxFilesTemplate: 'Maximum {maxFiles} sources',
      businessContextUploadPending: 'Upload selected files',
      businessContextUploadedSources: 'Uploaded sources',
      businessContextSourceCountTemplate: '{count} sources',
      businessContextSourceStatusUploaded: 'Uploaded',
      businessContextSourceStatusProcessing: 'Processing',
      businessContextSourceStatusReady: 'Ready',
      businessContextSourceStatusFailed: 'Failed',
      businessContextSourceStatusRemoved: 'Removed',
      businessContextSourceTextFallback: 'Text source',
      businessContextRemoveSourceTemplate: 'Remove {name}',
      businessContextRetrySourceTemplate: 'Retry {name}',
      businessContextMissingTitle: 'Gaps',
      businessContextMissingEmpty: 'Core categories are covered',
      businessContextContinue: 'Continue to follow-ups',
      businessContextUniversal: 'Generate a universal guide',
      businessContextUniversalDescription:
        'Without company context the system creates a benchmark guide and marks what must be adapted before rollout.',
      businessContextUniversalSummary: 'Universal benchmark mode selected.',
      businessContextUploading: 'Uploading files...',
      businessContextSaving: 'Saving changes...',
      businessContextProductTitle: 'Product',
      businessContextProductHelper: 'What you sell or deliver and the value proposition.',
      businessContextProductPlaceholder: 'For example: B2B SaaS for learning automation...',
      businessContextProductHint1: 'commercial proposal',
      businessContextProductHint2: 'product description',
      businessContextProductHint3: 'product deck',
      businessContextCustomersTitle: 'Customers',
      businessContextCustomersHelper: 'Who buys, who uses it, and which segments or pains matter.',
      businessContextCustomersPlaceholder: 'For example: HR leaders in enterprise companies...',
      businessContextCustomersHint1: 'ICP',
      businessContextCustomersHint2: 'customer profile',
      businessContextCustomersHint3: 'customer research',
      businessContextSalesTitle: 'Sales and channels',
      businessContextSalesHelper: 'How customers are found and how the funnel works.',
      businessContextSalesPlaceholder: 'For example: outbound, partners, tenders...',
      businessContextSalesHint1: 'sales playbook',
      businessContextSalesHint2: 'funnel',
      businessContextSalesHint3: 'scripts',
      businessContextProcessesTitle: 'Processes',
      businessContextProcessesHelper: 'Operating procedures and handoffs between roles.',
      businessContextProcessesPlaceholder: 'For example: lead moves SDR -> AE -> implementation...',
      businessContextProcessesHint1: 'SOP',
      businessContextProcessesHint2: 'team playbook',
      businessContextProcessesHint3: 'process maps',
      businessContextMetricsTitle: 'Metrics',
      businessContextMetricsHelper: 'How the role, team, and business outcome are measured.',
      businessContextMetricsPlaceholder: 'For example: revenue, win rate, NPS...',
      businessContextMetricsHint1: 'department KPIs',
      businessContextMetricsHint2: 'dashboards',
      businessContextMetricsHint3: 'OKRs',
      businessContextOrgTitle: 'Org structure',
      businessContextOrgHelper: 'Teams, reporting lines, collaborators, and ownership boundaries.',
      businessContextOrgPlaceholder: 'For example: role sits in sales and works with marketing...',
      businessContextOrgHint1: 'org chart',
      businessContextOrgHint2: 'staffing plan',
      businessContextOrgHint3: 'similar guides',
      businessContextConstraintsTitle: 'Constraints',
      businessContextConstraintsHelper:
        'Legal, industry, geography, security, and operating constraints.',
      businessContextConstraintsPlaceholder: 'For example: enterprise security review, GDPR...',
      businessContextConstraintsHint1: 'policies',
      businessContextConstraintsHint2: 'compliance',
      businessContextConstraintsHint3: 'contract limits',
      followupNavigationLabel: 'Follow-ups',
      followupDocumentPreviewTitle: 'Follow-up context',
      followupDocumentPreviewSubtitle: 'These answers help make the final guide more specific.',
      followupDocumentPreviewEmpty: 'Answer or skip',
      phaseABadge: 'Phase A',
      phaseBBadge: 'Phase B',
      reviewBadge: 'Review',
      completionTitle: 'Ready to create?',
      completionDescription: 'Review the collected context before generating the Role Guide.',
      completionCta: 'Continue',
      followupTitle: 'Follow-up',
      skipFollowup: 'Skip',
      enoughGenerate: 'Enough, generate',
      completeness: 'Completeness',
      milestone60: 'Enough for a base',
      milestone80: 'Strong context',
      milestone100: 'Maximum context',
      followupsLoadingTitle: 'Preparing follow-ups',
      followupsLoadingDescription: 'The next questions adapt to your fixed answers.',
      followupsUnavailableTitle: 'Adaptive follow-ups are unavailable',
      followupsUnavailableDescription: 'You can still review the collected context and generate.',
      fixedAnswersTitle: 'Fixed answers',
      followupAnswersTitle: 'Follow-ups',
      freeformNotesTitle: 'Free-form notes',
      skippedLabel: 'Skipped',
      editLabel: 'Edit',
      generateCta: 'Generate Role Guide',
      generationHandoffTitle: 'Generation started',
      generationHandoffDescription: 'Generation has started.',
      generationInProgressTitle: 'Generation in progress',
      generationInProgressDescription: 'The Role Guide is being assembled.',
      generationCompletedTitle: 'Generation completed',
      generationCompletedDescription: 'The Role Guide is ready.',
      generationFailedTitle: 'Generation failed',
      generationFailedDescription: 'Try again after checking the collected context.',
      generationStarting: 'Starting generation...',
      generationErrorTitle: 'Generation could not start',
      generationRedirectHint:
        'When generation finishes, we will open the Role Guide automatically.',
      generationCanLeaveHint:
        'You can keep this page open or come back later: the status is saved.',
      generationFinalizingHint:
        'Finalizing the Role Guide. This can take a few minutes while the final document is saved.',
      generationStepQueued: 'Queueing generation',
      generationStepPreparingContext: 'Preparing the saved context',
      generationStepBuildingProfile: 'Refining the role profile',
      generationStepGeneratingFoundation: 'Generating the instruction foundation',
      generationStepReviewingFoundation: 'Reviewing the instruction foundation',
      generationStepGeneratingOperations: 'Generating operational sections',
      generationStepReviewingOperations: 'Reviewing operational sections',
      generationStepGeneratingPeople: 'Generating people and competency sections',
      generationStepReviewingPeople: 'Reviewing people and competency sections',
      generationStepGeneratingGrowth: 'Generating growth and onboarding sections',
      generationStepReviewingGrowth: 'Reviewing growth and onboarding sections',
      generationStepGeneratingSystem: 'Generating process and dependency sections',
      generationStepReviewingSystem: 'Reviewing process and dependency sections',
      generationStepGeneratingWrap: 'Generating final sections',
      generationStepReviewingWrap: 'Reviewing final sections',
      generationStepAssembling: 'Assembling the final document',
      generationStepFinalReview: 'Running the final review',
      generationStepCompleted: 'Ready, opening the Role Guide',
      generationStepFailed: 'Generation stopped',
      viewGenerated: 'Open Role Guide',
      emptySummary: 'No data yet',
    },
  },
}

let startSession: Mock
let submitAnswer: Mock
let requestFollowups: Mock
let resolveDepartmentOptions: Mock
let approveAndGenerate: Mock
let getGenerationStatus: Mock
let getDraft: Mock
let listSources: Mock
let removeSource: Mock

function renderPage(props: Partial<Parameters<typeof CareerPlaybookNewPageClient>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CareerPlaybookNewPageClient locale="en" userId="user-1" {...props} />
    </NextIntlClientProvider>
  )
}

function setBusinessContextState(playbookId: string) {
  useCareerPlaybookStore.setState({
    playbookId,
    ownerUserId: 'user-1',
    uiLanguage: 'en',
    contentLanguage: 'en',
    phase: 'business_context',
    status: 'awaiting_followups',
    fixedQuestions: [],
    fixedAnswers: {
      position: { question_key: 'position', value: 'Sales Manager' },
      department: { question_key: 'department', value: 'sales' },
      level: { question_key: 'level', value: 'middle' },
      content_language: { question_key: 'content_language', value: 'en' },
    },
  })
}

describe('CareerPlaybookNewPageClient', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    })
    useCareerPlaybookStore.getState().resetCareerPlaybookWizard()
    startSession = vi.fn().mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000000006',
      uiLanguage: 'en',
      contentLanguage: 'en',
    })
    submitAnswer = vi.fn().mockResolvedValue({ savedAt: '2026-05-13T00:00:00.000Z' })
    requestFollowups = vi.fn().mockResolvedValue({
      questions: [
        {
          question_id: '00000000-0000-4000-8000-000000000701',
          question_text: 'Which KPIs define success in this role?',
          question_type: 'open',
          options: null,
          rationale: 'KPI specificity improves the role guide.',
        },
      ],
      completeness_score: 0.82,
      stop_recommendation: 'ready_to_generate',
    })
    resolveDepartmentOptions = vi.fn().mockResolvedValue({
      status: 'needs_user_choice',
      source: 'llm',
      confidence: 0.62,
      candidates: [
        { value: 'operations', label: 'Operations', confidence: 0.72 },
        { value: 'support', label: 'Support / Customer Success', confidence: 0.68 },
      ],
    })
    approveAndGenerate = vi.fn().mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000000901',
      status: 'generating',
      phase: 'completion',
      progress: 72,
      progressDetails: {
        stage: 'building_profile',
        percent: 72,
        updated_at: '2026-06-08T17:00:00.000Z',
      },
    })
    getGenerationStatus = vi.fn().mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000000901',
      status: 'generating',
      phase: 'completion',
      progress: 72,
      progressDetails: {
        stage: 'building_profile',
        percent: 72,
        updated_at: '2026-06-08T17:00:00.000Z',
      },
    })
    getDraft = vi.fn().mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000000777',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      currentFixedIndex: 0,
      fixedAnswers: {
        position: {
          question_key: 'position',
          value: 'Existing Head of Sales',
          answered_at: '2026-05-13T00:00:00.000Z',
        },
      },
      status: 'answering_fixed',
      phase: 'fixed',
    })
    listSources = vi.fn().mockResolvedValue([])
    removeSource = vi.fn().mockResolvedValue({ ok: true })
    setCareerPlaybookClientForTests({
      startSession,
      requestFollowups,
      resolveDepartmentOptions,
      approveAndGenerate,
      getGenerationStatus,
      submitAnswer,
      listSources,
      removeSource,
    })
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('starts a best-effort backend session on mount', async () => {
    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Role Guide constructor' })
    ).toBeInTheDocument()
    expect(startSession).toHaveBeenCalledWith({ language: 'en' })
  })

  it('starts a blank wizard when explicitly opening a fresh guide', async () => {
    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000777',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      fixedQuestions: [],
      fixedAnswers: {
        position: {
          question_key: 'position',
          value: 'Deleted Head of Sales',
          answered_at: '2026-05-13T00:00:00.000Z',
        },
      },
      currentFixedIndex: 0,
    })

    renderPage({ resetOnMount: true })

    const positionInput = await screen.findByLabelText('Which role do you want to define?')
    expect(positionInput).toHaveValue('')
    expect(startSession).toHaveBeenCalledWith({ language: 'en' })
    expect(useCareerPlaybookStore.getState().playbookId).not.toBe(
      '00000000-0000-4000-8000-000000000777'
    )
  })

  it('resumes the concrete guide selected from the library constructor action', async () => {
    setCareerPlaybookClientForTests({
      startSession,
      getDraft,
      requestFollowups,
      resolveDepartmentOptions,
      approveAndGenerate,
      getGenerationStatus,
      submitAnswer,
      listSources,
    })

    renderPage({ resumePlaybookId: '00000000-0000-4000-8000-000000000777' })

    expect(await screen.findByLabelText('Which role do you want to define?')).toHaveValue(
      'Existing Head of Sales'
    )
    expect(getDraft).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000000777',
    })
    expect(startSession).not.toHaveBeenCalled()
  })

  it('renders Phase A and advances through fixed questions with localized copy', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Role Guide constructor' })
    ).toBeInTheDocument()
    expect(await screen.findByLabelText('Which role do you want to define?')).toBeInTheDocument()
    expect(screen.getByTestId('career-playbook-workspace')).toHaveClass('max-w-[1760px]')
    expect(screen.getAllByText('Question 1 of 6').length).toBeGreaterThan(0)

    await user.type(screen.getByLabelText('Which role do you want to define?'), 'Head of Sales')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect((await screen.findAllByText('Role seniority level')).length).toBeGreaterThan(0)
    expect(screen.getByText('Functional area: Sales')).toBeInTheDocument()
    expect(resolveDepartmentOptions).not.toHaveBeenCalled()
    expect(screen.getByText('Draft saved locally')).toBeInTheDocument()
  })

  it('asks the backend for narrow department choices when the role title is ambiguous', async () => {
    const user = userEvent.setup()

    renderPage()

    await user.type(
      await screen.findByLabelText('Which role do you want to define?'),
      'Unusual company role'
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(resolveDepartmentOptions).toHaveBeenCalledWith({
      title: 'Unusual company role',
      language: 'en',
    })
    expect((await screen.findAllByText('Department or functional area')).length).toBeGreaterThan(0)
    expect(screen.getByRole('radio', { name: 'Operations' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Support / Customer Success' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Sales' })).not.toBeInTheDocument()
  })

  it('continues to business context from any fixed question when all fixed answers are already present', async () => {
    const user = userEvent.setup()

    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000831',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'fixed',
      status: 'answering_fixed',
      currentFixedIndex: 0,
      fixedQuestions: [],
      fixedAnswers: {
        position: {
          question_key: 'position',
          value: 'Sales Manager',
        },
        department: {
          question_key: 'department',
          value: 'sales',
        },
        level: {
          question_key: 'level',
          value: 'middle',
        },
        reporting: {
          question_key: 'reporting',
          value: 'Reports to Head of Sales.',
        },
        team_size: {
          question_key: 'team_size',
          value: '1-10',
        },
        company_stage: {
          question_key: 'company_stage',
          value: 'growth',
        },
        content_language: {
          question_key: 'content_language',
          value: 'en',
        },
      },
    })

    renderPage()

    await waitFor(() => expect(screen.getAllByText('Question 1 of 6').length).toBeGreaterThan(0))
    await user.click(screen.getByRole('button', { name: 'Finish Phase A' }))

    expect(await screen.findByRole('heading', { name: 'Materials and notes' })).toBeInTheDocument()
    expect(requestFollowups).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Generate a universal guide' }))

    expect(requestFollowups).toHaveBeenCalled()
    await waitFor(() => expect(screen.getAllByText('Follow-up 1 of 1').length).toBeGreaterThan(0))
    expect(submitAnswer).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000000831',
      phase: 'business_context',
      answer: {
        business_context: expect.objectContaining({
          mode: 'universal',
          status: 'skipped',
        }),
      },
    })
  })

  it('marks pasted business notes as completed context before requesting follow-ups', async () => {
    const user = userEvent.setup()

    setBusinessContextState('00000000-0000-4000-8000-000000000836')
    useCareerPlaybookStore.setState({
      freeformDraft: 'B2B SaaS, enterprise sales cycle, strict implementation SLA.',
      dirtyFreeformDraft: true,
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Materials and notes' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue to follow-ups' }))

    await waitFor(() => expect(screen.getAllByText('Follow-up 1 of 1').length).toBeGreaterThan(0))
    expect(requestFollowups).toHaveBeenCalled()
    expect(submitAnswer).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000000836',
      phase: 'freeform',
      answer: {
        freeform_text: 'B2B SaaS, enterprise sales cycle, strict implementation SLA.',
      },
    })
    expect(submitAnswer).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000000836',
      phase: 'business_context',
      answer: {
        business_context: expect.objectContaining({
          mode: 'universal',
          status: 'skipped',
          skip_reason: 'freeform_business_context',
        }),
      },
    })
  })

  it('keeps business context retryable when follow-up generation fails', async () => {
    const user = userEvent.setup()
    requestFollowups.mockRejectedValueOnce(new Error('Follow-up generation failed'))

    setBusinessContextState('00000000-0000-4000-8000-000000000837')
    useCareerPlaybookStore.setState({
      freeformDraft: 'B2B SaaS, enterprise sales cycle, strict implementation SLA.',
      dirtyFreeformDraft: true,
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Materials and notes' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue to follow-ups' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Follow-up generation failed')
    expect(screen.getByRole('heading', { name: 'Materials and notes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue to follow-ups' })).toBeEnabled()
  })

  it('does not request follow-ups without a saved department context', async () => {
    const user = userEvent.setup()

    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000832',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'fixed',
      status: 'answering_fixed',
      currentFixedIndex: 5,
      fixedQuestions: [],
      fixedAnswers: {
        position: {
          question_key: 'position',
          value: 'Unusual company role',
        },
        level: {
          question_key: 'level',
          value: 'middle',
        },
        reporting: {
          question_key: 'reporting',
          value: 'Reports to COO.',
        },
        team_size: {
          question_key: 'team_size',
          value: '1-10',
        },
        company_stage: {
          question_key: 'company_stage',
          value: 'growth',
        },
        content_language: {
          question_key: 'content_language',
          value: 'en',
        },
      },
    })

    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Finish Phase A' }))

    expect(resolveDepartmentOptions).toHaveBeenCalledWith({
      title: 'Unusual company role',
      language: 'en',
    })
    expect(requestFollowups).not.toHaveBeenCalled()
    expect((await screen.findAllByText('Department or functional area')).length).toBeGreaterThan(0)
  })

  it('continues from Phase A into adaptive follow-ups and completion review', async () => {
    const user = userEvent.setup()

    renderPage()

    await user.type(
      await screen.findByLabelText('Which role do you want to define?'),
      'Head of Sales'
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('radio', { name: /Lead \/ Team Lead/ }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.type(
      screen.getByLabelText('Who does this role report to, and are there direct reports?'),
      'Reports to CRO.'
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('radio', { name: '1000+ people (Enterprise)' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getAllByText('What is the company or product stage?').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Finish Phase A' }))

    expect(await screen.findByRole('heading', { name: 'Materials and notes' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Product' }))
    await user.type(screen.getByLabelText('Product'), 'B2B SaaS for sales enablement')
    await user.click(screen.getByRole('button', { name: 'Continue to follow-ups' }))

    await waitFor(() => expect(screen.getAllByText('Follow-up 1 of 1').length).toBeGreaterThan(0))
    expect(requestFollowups).toHaveBeenCalled()
    expect(submitAnswer).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000000006',
      phase: 'business_context',
      answer: {
        business_context: expect.objectContaining({
          mode: 'company_specific',
          status: 'ready',
        }),
      },
    })
    expect(screen.getByText('Completeness: 82%')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Which KPIs define success in this role?'), 'Win rate')
    await user.click(screen.getByRole('button', { name: 'Enough, generate' }))

    expect(await screen.findByRole('heading', { name: 'Ready to create?' })).toBeInTheDocument()
    expect(screen.getAllByText('Fixed answers').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Follow-ups').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Department or functional area').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sales').length).toBeGreaterThan(0)
    expect(screen.getByText('Win rate')).toBeInTheDocument()
  })

  it('preserves all source IDs when uploading multiple business context files before follow-ups', async () => {
    const user = userEvent.setup()
    const sourceIdOne = '00000000-0000-4000-8000-000000001001'
    const sourceIdTwo = '00000000-0000-4000-8000-000000001002'
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sourceId: sourceIdOne,
            fileId: '00000000-0000-4000-8000-000000002001',
            storagePath: 'uploads/context-one.pdf',
            status: 'processing',
            message: 'queued',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sourceId: sourceIdTwo,
            fileId: '00000000-0000-4000-8000-000000002002',
            storagePath: 'uploads/context-two.pdf',
            status: 'processing',
            message: 'queued',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

    setBusinessContextState('00000000-0000-4000-8000-000000000833')

    const { container } = renderPage()

    expect(await screen.findByRole('heading', { name: 'Materials and notes' })).toBeInTheDocument()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, [
      new File(['product'], 'product.pdf', { type: 'application/pdf' }),
      new File(['kpi'], 'kpi.pdf', { type: 'application/pdf' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Continue to follow-ups' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({ method: 'POST' })
      expect(init?.headers).toBeUndefined()
      expect(init?.body).toBeInstanceOf(FormData)
      const body = init?.body as FormData
      expect(body.get('playbookId')).toBe('00000000-0000-4000-8000-000000000833')
      expect(body.get('file')).toBeInstanceOf(File)
    }
    expect(requestFollowups).not.toHaveBeenCalled()
    expect(submitAnswer).not.toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'business_context' })
    )
    expect(useCareerPlaybookStore.getState().businessContext).toEqual(
      expect.objectContaining({
        mode: 'company_specific',
        status: 'collecting',
        source_ids: [sourceIdOne, sourceIdTwo],
        digest: expect.objectContaining({
          source_ids: [sourceIdOne, sourceIdTwo],
        }),
      })
    )
    expect(screen.getAllByText('product.pdf').length).toBeGreaterThan(0)
    expect(screen.getAllByText('kpi.pdf').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Processing').length).toBeGreaterThanOrEqual(2)

    fetchMock.mockRestore()
  })

  it('shows persisted business context source status and removes a source on request', async () => {
    const user = userEvent.setup()
    const sourceId = '00000000-0000-4000-8000-000000001004'

    setBusinessContextState('00000000-0000-4000-8000-000000000835')
    useCareerPlaybookStore.setState({
      businessContext: {
        mode: 'company_specific',
        status: 'collecting',
        digest: {
          product: [],
          customers: [],
          sales_channels: [],
          processes: [],
          metrics: [],
          org_structure: [],
          constraints: [],
          source_ids: [sourceId],
          missing_signals: [],
          user_edited: false,
        },
        source_ids: [sourceId],
      },
      businessContextSources: [
        {
          id: sourceId,
          playbookId: '00000000-0000-4000-8000-000000000835',
          sourceType: 'file',
          status: 'processing',
          filename: 'sales-playbook.pdf',
          fileCatalogId: '00000000-0000-4000-8000-000000002004',
          errorMessage: null,
          createdAt: '2026-06-03T09:00:00.000Z',
          updatedAt: '2026-06-03T09:01:00.000Z',
        },
      ],
    })

    renderPage()

    expect(await screen.findByText('sales-playbook.pdf')).toBeInTheDocument()
    expect(screen.getByText('Processing')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove sales-playbook.pdf' }))

    expect(removeSource).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000000835',
      sourceId,
    })
    expect(screen.queryByText('sales-playbook.pdf')).not.toBeInTheDocument()
  })

  it('keeps typed business context when a source upload resolves after editing', async () => {
    const user = userEvent.setup()
    const sourceId = '00000000-0000-4000-8000-000000001003'
    let resolveUpload!: (response: Response) => void
    const uploadResponse = new Promise<Response>((resolve) => {
      resolveUpload = resolve
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => uploadResponse)

    setBusinessContextState('00000000-0000-4000-8000-000000000834')

    const { container } = renderPage()

    expect(await screen.findByRole('heading', { name: 'Materials and notes' })).toBeInTheDocument()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, [new File(['product'], 'product.pdf', { type: 'application/pdf' })])

    const continueClick = user.click(screen.getByRole('button', { name: 'Continue to follow-ups' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Product' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Product' }), {
      target: { value: 'B2B learning platform' },
    })

    resolveUpload(
      new Response(
        JSON.stringify({
          sourceId,
          fileId: '00000000-0000-4000-8000-000000002003',
          storagePath: 'uploads/context-product.pdf',
          status: 'processing',
          message: 'queued',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    await continueClick
    await waitFor(() =>
      expect(useCareerPlaybookStore.getState().businessContext.source_ids).toContain(sourceId)
    )
    expect(requestFollowups).not.toHaveBeenCalled()
    expect(useCareerPlaybookStore.getState().businessContext).toEqual(
      expect.objectContaining({
        mode: 'company_specific',
        status: 'collecting',
        source_ids: [sourceId],
        digest: expect.objectContaining({
          product: ['B2B learning platform'],
          source_ids: [sourceId],
        }),
      })
    )

    fetchMock.mockRestore()
  })

  it('flushes skipped remaining follow-ups before approving generation', async () => {
    const user = userEvent.setup()

    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000905',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'followups',
      status: 'answering_followups',
      fixedQuestions: [],
      fixedAnswers: {
        position: {
          question_key: 'position',
          value: 'Sales Manager',
        },
        department: {
          question_key: 'department',
          value: 'sales',
        },
        level: {
          question_key: 'level',
          value: 'middle',
        },
        reporting: {
          question_key: 'reporting',
          value: 'Reports to CRO.',
        },
        team_size: {
          question_key: 'team_size',
          value: '201-1000',
        },
        content_language: {
          question_key: 'content_language',
          value: 'en',
        },
      },
      followupQuestions: [
        {
          question_id: '00000000-0000-4000-8000-000000000906',
          question_text: 'Which KPIs define success in this role?',
          question_type: 'open',
          options: null,
          rationale: 'KPI specificity improves the role guide.',
        },
        {
          question_id: '00000000-0000-4000-8000-000000000907',
          question_text: 'Which tools should this role own?',
          question_type: 'multi_choice',
          options: [
            { value: 'crm', label: 'CRM' },
            { value: 'bi', label: 'BI' },
          ],
          rationale: 'Tools clarify operating expectations.',
        },
      ],
      followupAnswers: {
        '00000000-0000-4000-8000-000000000906': {
          question_id: '00000000-0000-4000-8000-000000000906',
          question_text: 'Which KPIs define success in this role?',
          question_type: 'open',
          value: 'Win rate',
          skipped: false,
        },
      },
      dirtyFollowupQuestionIds: [],
      currentFollowupIndex: 0,
      completenessScore: 0.6,
      followupGenerationCount: 1,
    })

    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Enough, generate' }))
    expect(await screen.findByRole('heading', { name: 'Ready to create?' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Generate Role Guide' }))

    expect(submitAnswer).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000000905',
      phase: 'followup',
      answer: {
        question_id: '00000000-0000-4000-8000-000000000907',
        value: undefined,
        skipped: true,
      },
    })
    expect(approveAndGenerate).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000000905',
    })
  })

  it('keeps a persisted Phase B draft when bootstrapping fixed questions after reload', async () => {
    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000801',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'followups',
      status: 'answering_followups',
      fixedQuestions: [],
      fixedAnswers: {
        position: {
          question_key: 'position',
          value: 'Head of Sales',
        },
      },
      followupQuestions: [
        {
          question_id: '00000000-0000-4000-8000-000000000802',
          question_text: 'Which KPIs define success in this role?',
          question_type: 'open',
          options: null,
          rationale: 'KPI specificity improves the role guide.',
        },
      ],
      followupAnswers: {
        '00000000-0000-4000-8000-000000000802': {
          question_id: '00000000-0000-4000-8000-000000000802',
          question_text: 'Which KPIs define success in this role?',
          question_type: 'open',
          value: 'Win rate',
          skipped: false,
        },
      },
      currentFollowupIndex: 0,
      completenessScore: 0.8,
      dirtyFollowupQuestionIds: ['00000000-0000-4000-8000-000000000802'],
    })

    renderPage()

    await waitFor(() => expect(screen.getAllByText('Follow-up 1 of 1').length).toBeGreaterThan(0))
    expect(screen.getByLabelText('Which KPIs define success in this role?')).toHaveValue('Win rate')
    expect(useCareerPlaybookStore.getState().dirtyFollowupQuestionIds).toEqual([
      '00000000-0000-4000-8000-000000000802',
    ])
  })

  it('moves to review when an additional follow-up request says the draft is ready', async () => {
    const user = userEvent.setup()
    requestFollowups.mockResolvedValueOnce({
      questions: [],
      completeness_score: 0.76,
      stop_recommendation: 'ready_to_generate',
    })

    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000811',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'followups',
      status: 'answering_followups',
      fixedQuestions: [],
      fixedAnswers: {
        position: {
          question_key: 'position',
          value: 'Head of Sales',
        },
      },
      followupQuestions: [
        {
          question_id: '00000000-0000-4000-8000-000000000812',
          question_text: 'Which KPIs define success in this role?',
          question_type: 'open',
          options: null,
          rationale: 'KPI specificity improves the role guide.',
        },
      ],
      currentFollowupIndex: 0,
      completenessScore: 0.4,
      followupGenerationCount: 0,
      followupGenerationLimit: 2,
    })

    renderPage()

    await user.type(
      await screen.findByLabelText('Which KPIs define success in this role?'),
      'Win rate'
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByRole('heading', { name: 'Ready to create?' })).toBeInTheDocument()
    expect(screen.getByText('Completeness')).toBeInTheDocument()
    expect(screen.getByText('76%')).toBeInTheDocument()
    expect(screen.getByText('Win rate')).toBeInTheDocument()
  })

  it('shows a generation handoff state after clicking the generate CTA', async () => {
    const user = userEvent.setup()

    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000901',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'completion',
      status: 'ready_to_generate',
      fixedQuestions: [],
      fixedAnswers: {
        position: {
          question_key: 'position',
          value: 'Product Lead',
        },
      },
    })

    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Generate Role Guide' }))

    expect(approveAndGenerate).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000000901',
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Generation in progress')
    expect(screen.getByRole('status')).toHaveTextContent('72%')
    expect(screen.getByRole('status')).toHaveTextContent('Refining the role profile')
  })

  it('polls generation status while generating and stops after completion', async () => {
    vi.useFakeTimers()
    getGenerationStatus
      .mockResolvedValueOnce({
        playbookId: '00000000-0000-4000-8000-000000000904',
        status: 'generating',
        phase: 'completion',
        progress: 85,
      })
      .mockResolvedValueOnce({
        playbookId: '00000000-0000-4000-8000-000000000904',
        status: 'completed',
        phase: 'completion',
        progress: 100,
        finalMarkdown: '# Product Lead Role Guide',
      })

    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000904',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'completion',
      status: 'generating',
      fixedQuestions: [],
      fixedAnswers: {
        position: {
          question_key: 'position',
          value: 'Product Lead',
        },
      },
    })

    renderPage()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getGenerationStatus).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('Generation in progress')
    expect(screen.getByRole('status')).toHaveTextContent('85%')
    expect(
      screen.getByRole('button', { name: 'Edit Which role do you want to define?' })
    ).toBeDisabled()

    await act(async () => {
      vi.advanceTimersByTime(3000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getGenerationStatus).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('status')).toHaveTextContent('Generation completed')
    expect(screen.getAllByText('The Role Guide is ready.').length).toBeGreaterThan(0)
    const viewerLink = screen.getByRole('link', { name: 'Open Role Guide' })
    expect(viewerLink).toHaveAttribute(
      'href',
      '/en/career-playbook/00000000-0000-4000-8000-000000000904'
    )

    await act(async () => {
      vi.advanceTimersByTime(9000)
      await Promise.resolve()
    })

    expect(getGenerationStatus).toHaveBeenCalledTimes(2)
  })

  it('clarifies the finalizing state when generation remains near complete', async () => {
    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000914',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'completion',
      status: 'generating',
      progress: 99,
      generationProgressDetails: {
        stage: 'final_review',
        percent: 99,
        updated_at: '2026-06-08T17:00:00.000Z',
      },
      fixedQuestions: [],
      fixedAnswers: {
        position: {
          question_key: 'position',
          value: 'Product Lead',
        },
      },
    })

    renderPage()

    expect(await screen.findByRole('status')).toHaveTextContent('99%')
    expect(screen.getByRole('status')).toHaveTextContent('Running the final review')
    expect(screen.getByRole('status')).toHaveTextContent(
      'Finalizing the Role Guide. This can take a few minutes while the final document is saved.'
    )
  })

  it('keeps the generate CTA retryable when backend generation cannot start', async () => {
    const user = userEvent.setup()
    approveAndGenerate.mockRejectedValue(new Error('backend offline'))

    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000902',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'completion',
      status: 'ready_to_generate',
      fixedQuestions: [],
      fixedAnswers: {
        position: {
          question_key: 'position',
          value: 'Product Lead',
        },
      },
    })

    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Generate Role Guide' }))

    expect(approveAndGenerate).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000000902',
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Generation could not start')
    expect(screen.getByText('backend offline')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate Role Guide' })).toBeEnabled()
  })

  it('shows a retryable error when generation transport is unavailable', async () => {
    const user = userEvent.setup()
    setCareerPlaybookClientForTests({
      startSession,
      requestFollowups,
      submitAnswer,
    })

    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000903',
      ownerUserId: 'user-1',
      uiLanguage: 'en',
      contentLanguage: 'en',
      phase: 'completion',
      status: 'ready_to_generate',
      fixedQuestions: [],
      fixedAnswers: {
        position: {
          question_key: 'position',
          value: 'Product Lead',
        },
      },
    })

    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Generate Role Guide' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Generation could not start')
    expect(screen.getByText('Role Guide generation is unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate Role Guide' })).toBeEnabled()
  })
})
