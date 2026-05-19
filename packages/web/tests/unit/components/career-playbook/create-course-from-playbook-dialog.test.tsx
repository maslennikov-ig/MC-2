import { NextIntlClientProvider } from 'next-intl'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CreateCourseFromPlaybookDialog } from '@/components/career-playbook/viewer/CreateCourseFromPlaybookDialog'

const createCourseFromPlaybook = vi.fn()
const routerPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPush,
  }),
}))

vi.mock('@/components/career-playbook/library/client-adapter', () => ({
  createCourseFromPlaybook: (...args: unknown[]) =>
    createCourseFromPlaybook(
      ...(args as [input: { playbookId: string; includeWebResearch: boolean }])
    ),
}))

const messages = {
  'career-playbook': {
    library: {
      createCourseDialog: {
        title: 'Create course from Role Guide',
        description:
          'Start course generation from this completed Role Guide. You can add materials after the course is created.',
        startWithoutMaterials: 'Start without extra materials',
        addMaterialsLater: 'Materials can be added after course creation if needed.',
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

describe('CreateCourseFromPlaybookDialog', () => {
  beforeEach(() => {
    createCourseFromPlaybook.mockReset()
    routerPush.mockReset()
  })

  it('opens from trigger and creates a course without extra materials', async () => {
    const user = userEvent.setup()
    createCourseFromPlaybook.mockResolvedValue({
      success: true,
      courseId: 'course-1',
      redirectUrl: '/en/courses/acme/product-lead/generating',
      sourceDocumentIds: ['source-1'],
    })

    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Create course' }))

    expect(
      screen.getByRole('dialog', { name: 'Create course from Role Guide' })
    ).toBeInTheDocument()
    expect(
      screen.getByText('Materials can be added after course creation if needed.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add materials before creation' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Start without extra materials' }))

    expect(createCourseFromPlaybook).toHaveBeenCalledWith({
      playbookId: 'pb-1',
      includeWebResearch: true,
    })
    expect(routerPush).toHaveBeenCalledWith('/en/courses/acme/product-lead/generating')
  })

  it('shows loading and error states without navigating', async () => {
    const user = userEvent.setup()
    let rejectRequest: (error: Error) => void = () => {}
    createCourseFromPlaybook.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject
        })
    )

    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Create course' }))
    await user.click(screen.getByRole('button', { name: 'Start without extra materials' }))

    expect(screen.getByRole('button', { name: 'Creating course...' })).toBeDisabled()
    rejectRequest(new Error('Bridge unavailable'))
    expect(await screen.findByText('Bridge unavailable')).toBeInTheDocument()
    expect(screen.getByText('Course creation failed')).toBeInTheDocument()
    expect(routerPush).not.toHaveBeenCalled()
  })
})
