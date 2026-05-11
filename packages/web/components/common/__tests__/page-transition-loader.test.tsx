import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { PageTransitionLoader } from '../page-transition-loader'

vi.mock('next/navigation', () => ({
  usePathname: () => '/ru/admin/generation/course-1',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/ui/full-page-loader', () => ({
  FullPageLoader: () => <div data-testid="full-page-loader" />,
}))

describe('PageTransitionLoader', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('does not show the global page loader for tab buttons named Preview', () => {
    render(
      <>
        <PageTransitionLoader />
        <button type="button" role="tab">
          Preview
        </button>
      </>
    )

    act(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))
      vi.advanceTimersByTime(350)
    })

    expect(screen.queryByTestId('full-page-loader')).not.toBeInTheDocument()
  })
})
