import { beforeEach, describe, expect, it, vi } from 'vitest'

const trpcMocks = vi.hoisted(() => ({
  getBrowserTrpcClient: vi.fn(),
  exportPdfQuery: vi.fn(),
}))

vi.mock('@/lib/trpc/browser-client', () => ({
  getBrowserTrpcClient: trpcMocks.getBrowserTrpcClient,
}))

import {
  CAREER_PLAYBOOK_BLOCK_CATALOG,
  setCareerPlaybookClientForTests,
  useCareerPlaybookStore,
  type CareerPlaybookBlockId,
  type CareerPlaybookClient,
  type CareerPlaybookViewerSnapshot,
} from '@/stores/use-career-playbook-store'

function resetStore() {
  useCareerPlaybookStore.getState().resetCareerPlaybookWizard()
  setCareerPlaybookClientForTests(null)
  trpcMocks.exportPdfQuery.mockReset()
  trpcMocks.getBrowserTrpcClient.mockReset()
  trpcMocks.getBrowserTrpcClient.mockReturnValue({
    careerPlaybook: {
      exportPdf: { query: trpcMocks.exportPdfQuery },
    },
  })
  localStorage.clear()
}

describe('useCareerPlaybookStore viewer state', () => {
  beforeEach(() => {
    resetStore()
  })

  it('loads a viewer snapshot with ordered header plus 26 role guide blocks', async () => {
    useCareerPlaybookStore.setState({
      playbookId: '00000000-0000-4000-8000-000000000777',
      status: 'answering_fixed',
      contentLanguage: 'ru',
    })
    const snapshot: CareerPlaybookViewerSnapshot = {
      playbookId: '00000000-0000-4000-8000-000000001001',
      title: 'Head of Sales',
      department: 'Sales',
      level: 'lead',
      contentLanguage: 'en',
      status: 'completed',
      blocks: Object.fromEntries(
        CAREER_PLAYBOOK_BLOCK_CATALOG.map((block, index) => [
          block.blockId,
          {
            content: `## ${index}. ${block.title}\n\nInitial content for ${block.blockId}.`,
            status: 'generated',
            attempt: 0,
          },
        ])
      ) as Record<
        CareerPlaybookBlockId,
        CareerPlaybookViewerSnapshot['blocks'][CareerPlaybookBlockId]
      >,
    }
    const getViewer = vi
      .fn<NonNullable<CareerPlaybookClient['getViewer']>>()
      .mockResolvedValue(snapshot)
    setCareerPlaybookClientForTests({ getViewer, submitAnswer: vi.fn() })

    await expect(
      useCareerPlaybookStore
        .getState()
        .loadCareerPlaybookViewer('00000000-0000-4000-8000-000000001001')
    ).resolves.toEqual({ ok: true })

    expect(getViewer).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000001001',
    })
    expect(useCareerPlaybookStore.getState().viewer?.title).toBe('Head of Sales')
    expect(useCareerPlaybookStore.getState().viewerBlocks).toHaveLength(27)
    expect(useCareerPlaybookStore.getState().viewerBlocks[0]?.blockId).toBe('header')
    expect(useCareerPlaybookStore.getState().viewerBlocks.at(-1)?.blockId).toBe('block_26')
    expect(useCareerPlaybookStore.getState().playbookId).toBe(
      '00000000-0000-4000-8000-000000000777'
    )
    expect(useCareerPlaybookStore.getState().status).toBe('answering_fixed')
    expect(useCareerPlaybookStore.getState().contentLanguage).toBe('ru')
  })

  it('clears stale viewer data when loading a different playbook', async () => {
    const getViewer = vi
      .fn<NonNullable<CareerPlaybookClient['getViewer']>>()
      .mockRejectedValueOnce(new Error('METHOD_NOT_SUPPORTED'))
      .mockRejectedValueOnce(new Error('FORBIDDEN'))
    setCareerPlaybookClientForTests({ getViewer, submitAnswer: vi.fn() })
    useCareerPlaybookStore.getState().hydrateCareerPlaybookViewer({
      playbookId: '00000000-0000-4000-8000-000000001010',
      title: 'Old playbook',
      department: 'Sales',
      level: 'lead',
      contentLanguage: 'en',
      status: 'completed',
      blocks: { header: { content: '# Old playbook', status: 'generated', attempt: 0 } },
    })

    await expect(
      useCareerPlaybookStore
        .getState()
        .loadCareerPlaybookViewer('00000000-0000-4000-8000-000000001011')
    ).resolves.toEqual({
      ok: false,
      error: 'METHOD_NOT_SUPPORTED',
      backendPending: true,
    })
    expect(useCareerPlaybookStore.getState().viewer).toBeNull()
    expect(useCareerPlaybookStore.getState().viewerBlocks).toEqual([])

    await expect(
      useCareerPlaybookStore
        .getState()
        .loadCareerPlaybookViewer('00000000-0000-4000-8000-000000001012')
    ).resolves.toEqual({ ok: false, error: 'FORBIDDEN', backendPending: false })
    expect(useCareerPlaybookStore.getState().viewer).toBeNull()
  })

  it('ignores a superseded viewer response when another playbook load starts later', async () => {
    let resolveFirstViewer: (snapshot: CareerPlaybookViewerSnapshot) => void = () => {}
    const firstViewerPromise = new Promise<CareerPlaybookViewerSnapshot>((resolve) => {
      resolveFirstViewer = resolve
    })
    const secondSnapshot = viewerSnapshot('00000000-0000-4000-8000-000000001022', 'Second')
    const firstSnapshot = viewerSnapshot('00000000-0000-4000-8000-000000001021', 'First')
    const getViewer = vi
      .fn<NonNullable<CareerPlaybookClient['getViewer']>>()
      .mockReturnValueOnce(firstViewerPromise)
      .mockResolvedValueOnce(secondSnapshot)
    setCareerPlaybookClientForTests({ getViewer, submitAnswer: vi.fn() })

    const firstLoad = useCareerPlaybookStore
      .getState()
      .loadCareerPlaybookViewer('00000000-0000-4000-8000-000000001021')
    const secondLoad = useCareerPlaybookStore
      .getState()
      .loadCareerPlaybookViewer('00000000-0000-4000-8000-000000001022')

    await expect(secondLoad).resolves.toEqual({ ok: true })
    resolveFirstViewer(firstSnapshot)
    await expect(firstLoad).resolves.toEqual({
      ok: false,
      error: 'Career Playbook viewer request was superseded',
    })
    expect(useCareerPlaybookStore.getState().viewer?.playbookId).toBe(
      '00000000-0000-4000-8000-000000001022'
    )
  })

  it('edits and regenerates viewer blocks through the injectable client seam', async () => {
    const editBlock = vi.fn<NonNullable<CareerPlaybookClient['editBlock']>>().mockResolvedValue({
      blockId: 'block_1',
      content: 'Edited mission',
      status: 'generated',
      attempt: 0,
    })
    const regenerateBlock = vi
      .fn<NonNullable<CareerPlaybookClient['regenerateBlock']>>()
      .mockResolvedValue({
        blockId: 'block_1',
        content: 'Regenerated mission',
        status: 'generated',
        attempt: 1,
      })
    setCareerPlaybookClientForTests({ editBlock, regenerateBlock, submitAnswer: vi.fn() })
    hydrateSingleBlockViewer('00000000-0000-4000-8000-000000001002', 'Revenue Lead')

    await expect(
      useCareerPlaybookStore.getState().editCareerPlaybookViewerBlock('block_1', 'Edited mission')
    ).resolves.toEqual({ ok: true })
    expect(editBlock).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000001002',
      blockId: 'block_1',
      content: 'Edited mission',
    })
    expect(useCareerPlaybookStore.getState().viewer?.blocks.block_1?.content).toBe('Edited mission')

    await expect(
      useCareerPlaybookStore
        .getState()
        .regenerateCareerPlaybookViewerBlock('block_1', 'Make it more specific')
    ).resolves.toEqual({ ok: true })
    expect(regenerateBlock).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000001002',
      blockId: 'block_1',
      instruction: 'Make it more specific',
    })
    expect(useCareerPlaybookStore.getState().viewer?.blocks.block_1?.content).toBe(
      'Regenerated mission'
    )
  })

  it('updates numeric facts through the injectable client seam', async () => {
    const updateNumericFact = vi
      .fn<NonNullable<CareerPlaybookClient['updateNumericFact']>>()
      .mockResolvedValue({
        blockId: 'block_6',
        content: 'Win rate: 21%',
        status: 'generated',
        attempt: 1,
        numeric_facts: [
          {
            id: 'block_6-21-percent-0',
            block_id: 'block_6',
            raw_text: '21%',
            normalized_value: '21%',
            status: 'verified',
            source: 'user_input',
            confidence: 1,
            occurrence_index: 0,
            explanation: 'Исправлено пользователем.',
          },
        ],
      })
    setCareerPlaybookClientForTests({ updateNumericFact, submitAnswer: vi.fn() })
    useCareerPlaybookStore.getState().hydrateCareerPlaybookViewer({
      playbookId: '00000000-0000-4000-8000-000000001006',
      title: 'Sales Lead',
      department: 'Sales',
      level: 'lead',
      contentLanguage: 'ru',
      status: 'completed',
      blocks: {
        block_6: {
          content: 'Win rate: 18%',
          status: 'generated',
          attempt: 1,
          numeric_facts: [
            {
              id: 'block_6-18-percent-0',
              block_id: 'block_6',
              raw_text: '18%',
              normalized_value: '18%',
              status: 'needs_review',
              source: 'model_suggestion',
              confidence: 0.45,
              occurrence_index: 0,
              explanation: 'Точное значение не найдено в источниках.',
            },
          ],
        },
      },
    })

    await expect(
      useCareerPlaybookStore.getState().updateCareerPlaybookNumericFact({
        blockId: 'block_6',
        factId: 'block_6-18-percent-0',
        replacementText: '21%',
        scope: 'occurrence',
      })
    ).resolves.toEqual({ ok: true })

    expect(updateNumericFact).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000001006',
      blockId: 'block_6',
      factId: 'block_6-18-percent-0',
      replacementText: '21%',
      scope: 'occurrence',
    })
    expect(useCareerPlaybookStore.getState().viewer?.blocks.block_6?.content).toBe('Win rate: 21%')
    expect(
      useCareerPlaybookStore.getState().viewer?.blocks.block_6?.numeric_facts?.[0]?.status
    ).toBe('verified')
  })

  it('surfaces missing viewer status for PDF export without mutating data', async () => {
    setCareerPlaybookClientForTests({ submitAnswer: vi.fn() })

    await expect(useCareerPlaybookStore.getState().requestCareerPlaybookPdf()).resolves.toEqual({
      ok: false,
      error: 'Career Playbook viewer is not loaded',
    })

    expect(useCareerPlaybookStore.getState().viewerActionMessage).toBeNull()
  })

  it('downloads a backend PDF export for the loaded viewer', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:career-pdf')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const appendChild = vi.spyOn(document.body, 'appendChild')
    const removeChild = vi.spyOn(document.body, 'removeChild')

    trpcMocks.exportPdfQuery.mockResolvedValue({
      pdfBase64: btoa('%PDF mocked career playbook'),
      fileName: 'career-playbook-product-lead.pdf',
      contentType: 'application/pdf',
      sizeBytes: 27,
    })
    hydrateSingleBlockViewer('00000000-0000-4000-8000-000000001005', 'Product Lead')

    await expect(useCareerPlaybookStore.getState().requestCareerPlaybookPdf()).resolves.toEqual({
      ok: true,
    })

    expect(trpcMocks.exportPdfQuery).toHaveBeenCalledWith({
      playbookId: '00000000-0000-4000-8000-000000001005',
    })
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(click).toHaveBeenCalledTimes(1)
    expect(appendChild).toHaveBeenCalledWith(
      expect.objectContaining({ download: 'career-playbook-product-lead.pdf' })
    )
    expect(removeChild).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:career-pdf')
    expect(useCareerPlaybookStore.getState().viewerActionMessage).toBeNull()

    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
    click.mockRestore()
    appendChild.mockRestore()
    removeChild.mockRestore()
  })

  it('keeps viewer edit and regenerate usable as explicit local fallbacks', async () => {
    setCareerPlaybookClientForTests({ submitAnswer: vi.fn() })
    hydrateSingleBlockViewer('00000000-0000-4000-8000-000000001004', 'Operations Lead')

    await expect(
      useCareerPlaybookStore.getState().editCareerPlaybookViewerBlock('block_1', 'Local edit')
    ).resolves.toEqual({ ok: true })

    expect(useCareerPlaybookStore.getState().viewer?.blocks.block_1?.content).toBe('Local edit')
    expect(useCareerPlaybookStore.getState().viewerActionMessage).toBe(
      'Block edit saved locally until the backend action is connected'
    )

    await expect(
      useCareerPlaybookStore
        .getState()
        .regenerateCareerPlaybookViewerBlock('block_1', 'Make it measurable')
    ).resolves.toEqual({ ok: true })

    expect(useCareerPlaybookStore.getState().viewer?.blocks.block_1?.content).toContain(
      'Make it measurable'
    )
    expect(useCareerPlaybookStore.getState().viewer?.blocks.block_1?.attempt).toBe(1)
    expect(useCareerPlaybookStore.getState().viewerActionMessage).toBe(
      'Block regenerated locally until the backend action is connected'
    )
  })
})

function viewerSnapshot(playbookId: string, title: string): CareerPlaybookViewerSnapshot {
  return {
    playbookId,
    title: `${title} playbook`,
    department: 'Sales',
    level: 'lead',
    contentLanguage: 'en',
    status: 'completed',
    blocks: { header: { content: `# ${title} playbook`, status: 'generated', attempt: 0 } },
  }
}

function hydrateSingleBlockViewer(playbookId: string, title: string) {
  useCareerPlaybookStore.getState().hydrateCareerPlaybookViewer({
    playbookId,
    title,
    department: 'Sales',
    level: 'lead',
    contentLanguage: 'en',
    status: 'completed',
    blocks: { block_1: { content: 'Original mission', status: 'generated', attempt: 0 } },
  })
}
