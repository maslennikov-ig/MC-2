import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SharedCareerPlaybookPage, {
  generateMetadata,
} from '@/app/[locale]/share/career-playbook/[slug]/page'
import PublicCareerPlaybookPage, {
  generateMetadata as generatePublicMetadata,
} from '@/app/[locale]/career-playbooks/[orgSlug]/[playbookSlug]/page'
import { getPublicCareerPlaybookBySlug } from '@/app/[locale]/share/career-playbook/[slug]/data'

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`)
})

vi.mock('next/navigation', () => ({
  notFound: () => notFound(),
  redirect: (url: string) => redirect(url),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(() => (key: string) => key),
  setRequestLocale: vi.fn(),
}))

vi.mock('@/app/[locale]/share/career-playbook/[slug]/data', () => ({
  getPublicCareerPlaybookBySlug: vi.fn(),
}))

vi.mock('@/components/career-playbook/viewer/public-playbook-viewer', () => ({
  PublicPlaybookViewer: ({ title }: { title: string }) => (
    <article data-testid="public-playbook-viewer">{title}</article>
  ),
}))

const mockedGetPublicCareerPlaybookBySlug = vi.mocked(getPublicCareerPlaybookBySlug)

describe('SharedCareerPlaybookPage', () => {
  beforeEach(() => {
    notFound.mockClear()
    redirect.mockClear()
    mockedGetPublicCareerPlaybookBySlug.mockReset()
  })

  it('redirects legacy share URLs to the organization-scoped public URL', async () => {
    mockedGetPublicCareerPlaybookBySlug.mockResolvedValue({
      status: 'ok',
      playbook: {
        id: 'pb-1',
        slug: 'head-of-sales',
        organizationSlug: 'mega-campus',
        title: 'Head of Sales',
        summary: 'Role Guide summary',
        markdown: '# Head of Sales',
        department: 'sales',
        level: 'lead',
        language: 'en',
        createdAt: '2026-05-14T10:00:00.000Z',
      },
    })

    await expect(
      SharedCareerPlaybookPage({
        params: Promise.resolve({ locale: 'en', slug: 'head-of-sales' }),
      })
    ).rejects.toThrow('NEXT_REDIRECT:/en/career-playbooks/mega-campus/head-of-sales')

    expect(redirect).toHaveBeenCalledWith('/en/career-playbooks/mega-campus/head-of-sales')
    expect(screen.queryByTestId('public-playbook-viewer')).not.toBeInTheDocument()
  })

  it('returns 404 for missing and private slugs', async () => {
    mockedGetPublicCareerPlaybookBySlug.mockResolvedValueOnce({
      status: 'not-found',
      playbook: null,
    })

    await expect(
      SharedCareerPlaybookPage({
        params: Promise.resolve({ locale: 'en', slug: 'missing' }),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalledTimes(1)

    mockedGetPublicCareerPlaybookBySlug.mockResolvedValueOnce({
      status: 'private',
      playbook: null,
    })

    await expect(
      SharedCareerPlaybookPage({
        params: Promise.resolve({ locale: 'en', slug: 'private' }),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalledTimes(2)
  })

  it('renders fallback copy when public share transport is unavailable', async () => {
    mockedGetPublicCareerPlaybookBySlug.mockResolvedValue({
      status: 'unavailable',
      playbook: null,
    })

    render(
      await SharedCareerPlaybookPage({
        params: Promise.resolve({ locale: 'en', slug: 'temporarily-unavailable' }),
      })
    )

    expect(screen.getByRole('heading', { name: 'fallbackTitle' })).toBeInTheDocument()
    expect(screen.getByText('fallbackDescription')).toBeInTheDocument()
    expect(notFound).not.toHaveBeenCalled()
  })
})

describe('generateMetadata for shared career playbook', () => {
  beforeEach(() => {
    redirect.mockClear()
    mockedGetPublicCareerPlaybookBySlug.mockReset()
  })

  it('returns metadata with OG/Twitter from public playbook', async () => {
    mockedGetPublicCareerPlaybookBySlug.mockResolvedValue({
      status: 'ok',
      playbook: {
        id: 'pb-1',
        slug: 'head-of-sales',
        organizationSlug: 'mega-campus',
        title: 'Head of Sales',
        summary: 'Role Guide summary',
        markdown: '# Head of Sales',
        department: 'sales',
        level: 'lead',
        language: 'en',
        createdAt: '2026-05-14T10:00:00.000Z',
      },
    })

    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: 'en', slug: 'head-of-sales' }),
    })

    expect(metadata.title).toBe('Head of Sales')
    expect(metadata.description).toBe('Role Guide summary')
    expect(metadata.openGraph?.title).toBe('Head of Sales')
    expect(metadata.openGraph?.url).toBe(
      'https://megacampusai.com/en/career-playbooks/mega-campus/head-of-sales'
    )
    expect(metadata.twitter?.title).toBe('Head of Sales')
    expect(metadata.alternates?.canonical).toBe('/en/career-playbooks/mega-campus/head-of-sales')
  })
})

describe('PublicCareerPlaybookPage canonical route', () => {
  beforeEach(() => {
    notFound.mockClear()
    redirect.mockClear()
    mockedGetPublicCareerPlaybookBySlug.mockReset()
  })

  it('renders public viewer only when the organization slug matches', async () => {
    mockedGetPublicCareerPlaybookBySlug.mockResolvedValue({
      status: 'ok',
      playbook: {
        id: 'pb-1',
        slug: 'head-of-sales-a1b2c3',
        organizationSlug: 'mega-campus',
        title: 'Head of Sales',
        summary: 'Role Guide summary',
        markdown: '# Head of Sales',
        department: 'sales',
        level: 'lead',
        language: 'en',
        createdAt: '2026-05-14T10:00:00.000Z',
      },
    })

    render(
      await PublicCareerPlaybookPage({
        params: Promise.resolve({
          locale: 'en',
          orgSlug: 'mega-campus',
          playbookSlug: 'head-of-sales-a1b2c3',
        }),
      })
    )

    expect(screen.getByTestId('public-playbook-viewer')).toHaveTextContent('Head of Sales')
    expect(mockedGetPublicCareerPlaybookBySlug).toHaveBeenCalledWith({
      slug: 'head-of-sales-a1b2c3',
    })
  })

  it('returns 404 when the organization slug does not match', async () => {
    mockedGetPublicCareerPlaybookBySlug.mockResolvedValue({
      status: 'ok',
      playbook: {
        id: 'pb-1',
        slug: 'head-of-sales-a1b2c3',
        organizationSlug: 'mega-campus',
        title: 'Head of Sales',
        summary: 'Role Guide summary',
        markdown: '# Head of Sales',
        department: 'sales',
        level: 'lead',
        language: 'en',
        createdAt: '2026-05-14T10:00:00.000Z',
      },
    })

    await expect(
      PublicCareerPlaybookPage({
        params: Promise.resolve({
          locale: 'en',
          orgSlug: 'other-org',
          playbookSlug: 'head-of-sales-a1b2c3',
        }),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('returns canonical metadata for the organization-scoped public URL', async () => {
    mockedGetPublicCareerPlaybookBySlug.mockResolvedValue({
      status: 'ok',
      playbook: {
        id: 'pb-1',
        slug: 'head-of-sales-a1b2c3',
        organizationSlug: 'mega-campus',
        title: 'Head of Sales',
        summary: 'Role Guide summary',
        markdown: '# Head of Sales',
        department: 'sales',
        level: 'lead',
        language: 'en',
        createdAt: '2026-05-14T10:00:00.000Z',
      },
    })

    const metadata = await generatePublicMetadata({
      params: Promise.resolve({
        locale: 'en',
        orgSlug: 'mega-campus',
        playbookSlug: 'head-of-sales-a1b2c3',
      }),
    })

    expect(metadata.openGraph?.url).toBe(
      'https://megacampusai.com/en/career-playbooks/mega-campus/head-of-sales-a1b2c3'
    )
    expect(metadata.alternates?.canonical).toBe(
      '/en/career-playbooks/mega-campus/head-of-sales-a1b2c3'
    )
  })
})
