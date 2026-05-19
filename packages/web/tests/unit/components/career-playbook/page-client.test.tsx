import { NextIntlClientProvider } from 'next-intl'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import CareerPlaybookNewPageClient from '@/app/[locale]/career-playbook/new/page-client'
import {
  setCareerPlaybookClientForTests,
  useCareerPlaybookStore,
} from '@/stores/use-career-playbook-store'

const messages = {
  'career-playbook': {
    wizard: {
      eyebrow: 'Career Playbook',
      title: 'Role Guide constructor',
      subtitle: 'Answer a few fixed questions before adaptive follow-ups.',
      back: 'Back',
      next: 'Next',
      finish: 'Finish Phase A',
      freeform: 'Free-form',
      freeformTitle: 'Tell freely',
      freeformPlaceholder: 'Describe the role in your own words.',
      saveFreeform: 'Save text',
      draftSaving: 'Saving draft...',
      draftSaved: 'Draft saved locally',
      draftUnsynced: 'Local draft saved. Server sync is pending.',
      openPlaceholder: 'Type your answer',
      chooseOneLabel: 'Choose one',
      chooseManyLabel: 'Choose several',
      questionLabel: 'Question',
      answeredLabel: 'Answered',
      ofLabel: 'of',
      completionTitle: 'Phase A is ready',
      completionDescription: 'Adaptive follow-ups will continue in Phase B.',
      completionCta: 'Continue',
    },
  },
}

let startSession: Mock
let submitAnswer: Mock

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CareerPlaybookNewPageClient locale="en" userId="user-1" />
    </NextIntlClientProvider>
  )
}

describe('CareerPlaybookNewPageClient', () => {
  beforeEach(() => {
    useCareerPlaybookStore.getState().resetCareerPlaybookWizard()
    startSession = vi.fn().mockResolvedValue({
      playbookId: '00000000-0000-4000-8000-000000000006',
      uiLanguage: 'en',
      contentLanguage: 'en',
    })
    submitAnswer = vi.fn().mockResolvedValue({ savedAt: '2026-05-13T00:00:00.000Z' })
    setCareerPlaybookClientForTests({
      startSession,
      submitAnswer,
    })
    localStorage.clear()
  })

  it('starts a best-effort backend session on mount', async () => {
    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Role Guide constructor' })
    ).toBeInTheDocument()
    expect(startSession).toHaveBeenCalledWith({ language: 'en' })
  })

  it('renders Phase A and advances through fixed questions with localized copy', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Role Guide constructor' })
    ).toBeInTheDocument()
    expect(await screen.findByLabelText('Which role do you want to define?')).toBeInTheDocument()
    expect(screen.getByText('Question 1 of 6')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Which role do you want to define?'), 'Head of Sales')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('Department or functional area')).toBeInTheDocument()
    expect(screen.getByText('Draft saved locally')).toBeInTheDocument()
  })

  it('shows the Phase A completion state after the last fixed question', async () => {
    const user = userEvent.setup()

    renderPage()

    await user.type(
      await screen.findByLabelText('Which role do you want to define?'),
      'Head of Sales'
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('radio', { name: 'Sales' }))
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
    await user.click(screen.getByRole('button', { name: 'Finish Phase A' }))

    expect(await screen.findByRole('heading', { name: 'Phase A is ready' })).toBeInTheDocument()
  })
})
