import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  CareerPlaybookCostEvidenceTable,
  type CareerPlaybookCostEvidence,
} from '@/components/career-playbook/admin/CareerPlaybookCostEvidenceTable'

const evidence: CareerPlaybookCostEvidence = {
  totalCount: 1,
  pageCount: 1,
  totalCostUsd: 0.043,
  totalInputTokens: 3400,
  totalOutputTokens: 1300,
  totalTokens: 4700,
  playbooks: [
    {
      playbookId: '44444444-4444-4444-8444-444444444444',
      title: 'Sales Manager B2B',
      status: 'completed',
      costBreakdownValid: true,
      language: 'ru',
      organizationId: '22222222-2222-4222-8222-222222222222',
      userId: '55555555-5555-4555-8555-555555555555',
      createdAt: '2026-05-19T10:00:00.000Z',
      completedAt: '2026-05-19T10:10:00.000Z',
      totalCostUsd: 0.043,
      totalInputTokens: 3400,
      totalOutputTokens: 1300,
      totalTokens: 4700,
      nodes: [
        {
          stage: 'spec',
          node: 'specBuilder',
          model: 'anthropic/claude-sonnet-4.5',
          inputTokens: 1200,
          outputTokens: 400,
          totalTokens: 1600,
          costUsd: 0.012,
        },
        {
          stage: 'group_2',
          node: 'group2Generator',
          model: 'anthropic/claude-sonnet-4.5',
          inputTokens: 2200,
          outputTokens: 900,
          totalTokens: 3100,
          costUsd: 0.031,
        },
      ],
    },
  ],
}

describe('CareerPlaybookCostEvidenceTable', () => {
  it('renders aggregate totals and per-node cost evidence', () => {
    render(<CareerPlaybookCostEvidenceTable evidence={evidence} locale="en" />)

    expect(screen.getByText('1 playbook')).toBeInTheDocument()
    expect(screen.getAllByText('$0.0430')[0]).toBeInTheDocument()
    expect(screen.getAllByText('4,700')[0]).toBeInTheDocument()

    const nodeRows = screen.getAllByRole('row').filter((row) => within(row).queryByText('spec'))
    expect(nodeRows).toHaveLength(1)
    expect(within(nodeRows[0]).getByText('specBuilder')).toBeInTheDocument()
    expect(within(nodeRows[0]).getByText('1,200')).toBeInTheDocument()
    expect(within(nodeRows[0]).getByText('$0.0120')).toBeInTheDocument()

    expect(screen.getByText('group_2')).toBeInTheDocument()
    expect(screen.getByText('group2Generator')).toBeInTheDocument()
  })

  it('renders an empty evidence state', () => {
    render(
      <CareerPlaybookCostEvidenceTable
        locale="en"
        evidence={{
          totalCount: 0,
          pageCount: 0,
          totalCostUsd: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalTokens: 0,
          playbooks: [],
        }}
      />
    )

    expect(screen.getByText('No Career Playbook costs found')).toBeInTheDocument()
  })

  it('distinguishes shown page totals from the full filtered count', () => {
    render(
      <CareerPlaybookCostEvidenceTable
        locale="en"
        evidence={{
          ...evidence,
          totalCount: 2,
          pageCount: 1,
        }}
      />
    )

    expect(screen.getByText('1 of 2 playbooks')).toBeInTheDocument()
    expect(screen.getAllByText('$0.0430')[0]).toBeInTheDocument()
  })
})
