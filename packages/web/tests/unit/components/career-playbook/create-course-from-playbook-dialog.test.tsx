import { NextIntlClientProvider } from 'next-intl'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CreateCourseFromPlaybookDialog } from '@/components/career-playbook/viewer/CreateCourseFromPlaybookDialog'

const previewCourseFromPlaybook = vi.fn()
const createCourseFromPlaybook = vi.fn()
const routerPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPush,
  }),
}))

vi.mock('@/components/career-playbook/library/client-adapter', () => ({
  previewCourseFromPlaybook: (...args: unknown[]) =>
    previewCourseFromPlaybook(...(args as [input: { playbookId: string }])),
  createCourseFromPlaybook: (...args: unknown[]) =>
    createCourseFromPlaybook(...(args as [input: Record<string, unknown>])),
}))

const messages = {
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
        descriptionPreviewTab: 'Preview',
        descriptionEditTab: 'Edit',
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
  },
}

function renderDialog() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreateCourseFromPlaybookDialog
        playbookId="pb-1"
        trigger={<button type="button">Create course</button>}
      />
    </NextIntlClientProvider>
  )
}

function mockPreview() {
  previewCourseFromPlaybook.mockResolvedValue({
    playbookId: 'pb-1',
    brief: {
      title: 'Product Lead',
      courseDescription: 'A course about platform product leadership.',
      targetAudience: 'Lead Product Platform',
      learningOutcomes: ['Improve activation', 'Run discovery rituals'],
      language: 'en',
      courseSize: 'auto',
      style: 'professional',
    },
    defaults: {
      includeWebResearch: false,
      includeBusinessContextSources: false,
    },
    sources: {
      roleGuide: { included: true },
      webResearch: {
        available: true,
        defaultIncluded: false,
      },
      businessContextSources: {
        available: true,
        defaultIncluded: false,
        sourceCount: 1,
        sources: [
          {
            id: 'source-1',
            filename: 'company-handbook.md',
            status: 'ready',
          },
        ],
      },
    },
  })
}

function mockMarkdownPreview() {
  previewCourseFromPlaybook.mockResolvedValue({
    playbookId: 'pb-1',
    brief: {
      title: 'Product Lead',
      courseDescription:
        '# Learning path\n\n## Module 1\n\n- Map role outcomes\n- Practice operating rituals',
      targetAudience: 'Lead Product Platform',
      learningOutcomes: ['Improve activation', 'Run discovery rituals'],
      language: 'en',
      courseSize: 'auto',
      style: 'professional',
    },
    defaults: {
      includeWebResearch: false,
      includeBusinessContextSources: false,
    },
    sources: {
      roleGuide: { included: true },
      webResearch: {
        available: true,
        defaultIncluded: false,
      },
      businessContextSources: {
        available: false,
        defaultIncluded: false,
        sourceCount: 0,
        sources: [],
      },
    },
  })
}

describe('CreateCourseFromPlaybookDialog', () => {
  beforeEach(() => {
    previewCourseFromPlaybook.mockReset()
    createCourseFromPlaybook.mockReset()
    routerPush.mockReset()
  })

  it('opens from trigger, pre-fills the passport, and creates from default source choices', async () => {
    const user = userEvent.setup()
    mockPreview()
    createCourseFromPlaybook.mockResolvedValue({
      success: true,
      courseId: 'course-1',
      redirectUrl: '/en/courses/acme/product-lead/generating',
      sourceDocumentIds: ['source-1'],
    })

    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Create course' }))

    expect(await screen.findByRole('dialog', { name: 'Review course draft' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Course title')).toHaveValue('Product Lead')
    await user.click(screen.getByRole('tab', { name: 'Edit' }))
    expect(screen.getByLabelText('What the course will cover')).toHaveValue(
      'A course about platform product leadership.'
    )
    expect(screen.getByLabelText('Learning outcomes')).toHaveValue(
      'Improve activation\nRun discovery rituals'
    )
    expect(screen.getByLabelText('Include web research')).not.toBeChecked()
    expect(screen.getByLabelText('Include uploaded company context')).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Create and generate' }))

    expect(createCourseFromPlaybook).toHaveBeenCalledWith({
      playbookId: 'pb-1',
      includeWebResearch: false,
      includeBusinessContextSources: false,
      overrides: {
        title: 'Product Lead',
        courseDescription: 'A course about platform product leadership.',
        targetAudience: 'Lead Product Platform',
        learningOutcomes: ['Improve activation', 'Run discovery rituals'],
        language: 'en',
        courseSize: 'auto',
        style: 'professional',
      },
    })
    expect(routerPush).toHaveBeenCalledWith('/en/courses/acme/product-lead/generating')
  })

  it('submits edited fields and explicitly selected supporting sources', async () => {
    const user = userEvent.setup()
    mockPreview()
    createCourseFromPlaybook.mockResolvedValue({
      success: true,
      courseId: 'course-1',
      redirectUrl: '/en/courses/acme/edited/generating',
      sourceDocumentIds: ['source-1', 'source-2'],
    })

    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Create course' }))
    const title = await screen.findByLabelText('Course title')
    await user.clear(title)
    await user.type(title, 'Edited onboarding course')
    await user.click(screen.getByLabelText('Include web research'))
    await user.click(screen.getByLabelText('Include uploaded company context'))

    await user.click(screen.getByRole('button', { name: 'Create and generate' }))

    expect(createCourseFromPlaybook).toHaveBeenCalledWith(
      expect.objectContaining({
        includeWebResearch: true,
        includeBusinessContextSources: true,
        overrides: expect.objectContaining({
          title: 'Edited onboarding course',
        }),
      })
    )
  })

  it('renders markdown course descriptions as a readable preview by default', async () => {
    const user = userEvent.setup()
    mockMarkdownPreview()

    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Create course' }))

    expect(await screen.findByRole('heading', { name: 'Learning path' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Module 1' })).toBeInTheDocument()
    expect(screen.getByText('Map role outcomes')).toBeInTheDocument()
  })

  it('shows loading and error states without navigating', async () => {
    const user = userEvent.setup()
    mockPreview()
    let rejectRequest: (error: Error) => void = () => {}
    createCourseFromPlaybook.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject
        })
    )

    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Create course' }))
    await user.click(await screen.findByRole('button', { name: 'Create and generate' }))

    expect(screen.getByRole('button', { name: 'Creating course...' })).toBeDisabled()
    rejectRequest(new Error('Bridge unavailable'))
    expect(await screen.findByText('Bridge unavailable')).toBeInTheDocument()
    expect(screen.getByText('Course creation failed')).toBeInTheDocument()
    expect(routerPush).not.toHaveBeenCalled()
  })
})
