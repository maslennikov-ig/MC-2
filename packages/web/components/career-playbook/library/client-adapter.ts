'use client'

import { getBrowserTrpcClient } from '@/lib/trpc/browser-client'
import { normalizeLibraryResponse } from './normalizers'
import type { CareerPlaybookLibraryData } from './types'

type BrowserCareerPlaybookClient = {
  careerPlaybook?: {
    library?: {
      delete?: {
        mutate: (input: { playbookId: string }) => Promise<unknown>
      }
      list?: {
        query: (input: { limit: number; cursor?: string; search?: string }) => Promise<unknown>
      }
    }
    share?: {
      shareToggle?: {
        mutate: (input: { playbookId: string; isPublic: boolean }) => Promise<unknown>
      }
    }
  }
}

export async function fetchCareerPlaybookLibraryPage(input: {
  locale: string
  cursor?: string | null
  search?: string
  limit?: number
}): Promise<CareerPlaybookLibraryData> {
  const client = getBrowserTrpcClient() as unknown as BrowserCareerPlaybookClient
  const procedure = client.careerPlaybook?.library?.list

  if (!procedure) {
    return {
      items: [],
      nextCursor: null,
      error: `careerPlaybook.library.list unavailable (${input.locale})`,
    }
  }

  try {
    const data = await procedure.query({
      limit: input.limit ?? 50,
      cursor: input.cursor ?? undefined,
      search: input.search,
    })
    return normalizeLibraryResponse(data)
  } catch (error) {
    return {
      items: [],
      nextCursor: null,
      error: error instanceof Error ? error.message : 'careerPlaybook.library.list failed',
    }
  }
}

export async function deleteCareerPlaybookMany(playbookIds: string[], locale: string) {
  const client = getBrowserTrpcClient() as unknown as BrowserCareerPlaybookClient
  const procedure = client.careerPlaybook?.library?.delete

  if (!procedure) {
    throw new Error(`careerPlaybook.library.delete unavailable (${locale})`)
  }

  const deletedIds: string[] = []
  await Promise.all(
    playbookIds.map(async (playbookId) => {
      await procedure.mutate({ playbookId })
      deletedIds.push(playbookId)
    })
  )

  return { deletedIds }
}

export async function toggleCareerPlaybookShare(
  playbookId: string,
  isPublic: boolean,
  locale: string
) {
  const client = getBrowserTrpcClient() as unknown as BrowserCareerPlaybookClient
  const procedure = client.careerPlaybook?.share?.shareToggle

  if (!procedure) {
    throw new Error(`careerPlaybook.share.shareToggle unavailable (${locale})`)
  }

  return procedure.mutate({ playbookId, isPublic })
}
