import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  InteractiveDemo,
  type CareerPlaybookDemoSection,
} from '@/components/career-playbook/methodology/InteractiveDemo'
import {
  MethodologySection,
  type CareerPlaybookBlockGroup,
  type CareerPlaybookMethodology,
} from '@/components/career-playbook/methodology/MethodologySection'

const methodologies: CareerPlaybookMethodology[] = [
  {
    id: 'netflix',
    title: 'Netflix Context over Control',
    description: 'Sets mission and autonomy boundaries.',
    affectedBlocks: ['Mission', 'Anti-goals', 'Decision Matrix'],
  },
  {
    id: 'amazon',
    title: 'Amazon Leadership Principles',
    description: 'Turns judgment into decision rules.',
    affectedBlocks: ['Decision Matrix', 'KPI', 'FAQ'],
  },
  {
    id: 'toyota',
    title: 'Toyota Standardized Work',
    description: 'Converts repeated work into checklists.',
    affectedBlocks: ['Duties', 'Processes', 'Onboarding'],
  },
  {
    id: 'spotify',
    title: 'Spotify Squad Model',
    description: 'Maps dependencies and collaboration modes.',
    affectedBlocks: ['Dependencies', 'Responsibilities', 'Continuity'],
  },
  {
    id: 'bridgewater',
    title: 'Bridgewater Baseball Cards',
    description: 'Documents strengths and risk patterns.',
    affectedBlocks: ['Competencies', 'Candidate Profile', 'Red Flags'],
  },
  {
    id: 'google',
    title: 'Google Team Effectiveness',
    description: 'Describes collaboration and review cadence.',
    affectedBlocks: ['Responsibilities', 'Competencies', 'Dependencies'],
  },
]

const blockGroups: CareerPlaybookBlockGroup[] = [
  {
    title: 'Foundation',
    blocks: Array.from({ length: 6 }, (_, index) => ({
      id: `foundation-${index}`,
      label: `Foundation ${index + 1}`,
    })),
  },
  {
    title: 'Operations',
    blocks: Array.from({ length: 5 }, (_, index) => ({
      id: `operations-${index}`,
      label: `Operations ${index + 1}`,
    })),
  },
  {
    title: 'People',
    blocks: Array.from({ length: 5 }, (_, index) => ({
      id: `people-${index}`,
      label: `People ${index + 1}`,
    })),
  },
  {
    title: 'Growth',
    blocks: Array.from({ length: 5 }, (_, index) => ({
      id: `growth-${index}`,
      label: `Growth ${index + 1}`,
    })),
  },
  {
    title: 'System',
    blocks: Array.from({ length: 5 }, (_, index) => ({
      id: `system-${index}`,
      label: `System ${index + 1}`,
    })),
  },
]

const demoBlockGroups: CareerPlaybookBlockGroup[] = [
  {
    title: 'Foundation',
    blocks: Array.from({ length: 6 }, (_, index) => ({
      id: `block${index + 1}`,
      label: `${index + 1}. Foundation ${index + 1}`,
    })),
  },
  {
    title: 'Operations',
    blocks: Array.from({ length: 20 }, (_, index) => ({
      id: `block${index + 7}`,
      label: `${index + 7}. Operations ${index + 7}`,
    })),
  },
]

const demoSections: CareerPlaybookDemoSection[] = [
  {
    id: 'mission',
    title: 'Mission and key results',
    excerpt: 'Pipeline is always at least three times the monthly sales plan.',
    annotation: 'Mission connects role purpose to measurable outcomes.',
    blockLabel: 'Block 1',
  },
  {
    id: 'decisions',
    title: 'Decision matrix',
    excerpt: 'Discounts above twenty percent require commercial approval.',
    annotation: 'Decision rules turn autonomy into visible guardrails.',
    blockLabel: 'Block 5',
  },
]

const demoChrome = {
  totalBlocksLabel: '26 sections in the full guide',
  shownBlocksLabel: 'First 6 sections shown',
  remainingBlocksLabel: '20 more sections complete the instruction',
  outlineLabel: 'Document outline',
  allBlocksButtonLabel: 'All 26 sections',
  allBlocksTitle: 'All 26 instruction sections',
  allBlocksDescription:
    'The full structure is grouped by purpose. The first six sections include examples from the demo.',
  exampleLabel: 'Example',
}

describe('MethodologySection', () => {
  it('renders six methodology cards and all 26 block chips', () => {
    render(
      <MethodologySection
        eyebrow="Methodology"
        title="Built from operating systems"
        subtitle="Each system maps to concrete Role Guide blocks."
        blocksTitle="26-block map"
        selectedBlocksLabel="Selected blocks"
        methodologies={methodologies}
        blockGroups={blockGroups}
      />
    )

    expect(screen.getAllByTestId('career-playbook-methodology-card')).toHaveLength(6)
    expect(screen.getAllByTestId('career-playbook-block-chip')).toHaveLength(26)
    expect(screen.getByText('Netflix Context over Control')).toBeInTheDocument()
    expect(screen.getByText('Google Team Effectiveness')).toBeInTheDocument()
    expect(screen.getByText('Foundation 1')).toBeInTheDocument()
  })
})

describe('InteractiveDemo', () => {
  it('switches the active annotated excerpt from the selector', async () => {
    const user = userEvent.setup()

    render(
      <InteractiveDemo
        eyebrow="Interactive demo"
        title="Annotated B2B sales Role Guide preview"
        subtitle="Inspect the generated document."
        previewTitle="B2B Sales Role Guide"
        sections={demoSections}
        fullStructureGroups={demoBlockGroups}
        {...demoChrome}
      />
    )

    expect(screen.getByText(/pipeline is always/i)).toBeInTheDocument()
    expect(screen.getByText('26 sections in the full guide')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /decision matrix/i }))

    expect(screen.getByText(/discounts above twenty percent/i)).toBeInTheDocument()
    expect(screen.getByText(/visible guardrails/i)).toBeInTheDocument()
  })

  it('allows long selector labels to wrap inside their column', () => {
    render(
      <InteractiveDemo
        eyebrow="Interactive demo"
        title="Annotated B2B sales Role Guide preview"
        subtitle="Inspect the generated document."
        previewTitle="B2B Sales Role Guide"
        sections={[
          ...demoSections,
          {
            id: 'metrics',
            title: 'Very long performance indicators and control metrics label',
            excerpt: 'Metrics stay readable.',
            annotation: 'Long labels should not expand the selector column.',
            blockLabel: 'Block 6',
          },
        ]}
        fullStructureGroups={demoBlockGroups}
        {...demoChrome}
      />
    )

    expect(
      screen.getByRole('button', {
        name: /very long performance indicators and control metrics label/i,
      })
    ).toHaveClass('w-full', 'min-w-0', 'whitespace-normal')
    expect(screen.getByTestId('career-playbook-demo-selector-list')).toHaveClass(
      'max-h-[20rem]',
      'overflow-y-auto'
    )
  })

  it('opens the full 26-section structure with examples', async () => {
    const user = userEvent.setup()

    render(
      <InteractiveDemo
        eyebrow="Interactive demo"
        title="Annotated B2B sales Role Guide preview"
        subtitle="Inspect the generated document."
        previewTitle="B2B Sales Role Guide"
        sections={demoSections}
        fullStructureGroups={demoBlockGroups}
        {...demoChrome}
      />
    )

    await user.click(screen.getByRole('button', { name: /all 26 sections/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('All 26 instruction sections')).toBeInTheDocument()
    expect(screen.getAllByText('1. Foundation 1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('6. Foundation 6').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Example').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/pipeline is always/i).length).toBeGreaterThan(1)
  })
})
