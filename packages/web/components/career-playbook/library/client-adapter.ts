'use client'

import { getBrowserTrpcClient } from '@/lib/trpc/browser-client'
import { normalizeLibraryResponse } from './normalizers'
import type {
  CareerPlaybookLibraryData,
  CareerPlaybookLibraryFilters,
  CareerPlaybookVisibility,
  CreateCourseFromPlaybookInput,
  CreateCourseFromPlaybookResult,
  PreviewCourseFromPlaybookResult,
} from './types'

type BrowserCareerPlaybookClient = {
  careerPlaybook?: {
    library?: {
      delete?: {
        mutate: (input: { playbookId: string }) => Promise<unknown>
      }
      updateVisibility?: {
        mutate: (input: {
          playbookId: string
          visibility: CareerPlaybookVisibility
        }) => Promise<unknown>
      }
      list?: {
        query: (
          input: { limit: number; cursor?: string } & Partial<CareerPlaybookLibraryFilters>
        ) => Promise<unknown>
      }
    }
    share?: {
      shareToggle?: {
        mutate: (input: { playbookId: string; isPublic: boolean }) => Promise<unknown>
      }
    }
    courseBridge?: {
      previewCourseFromPlaybook?: {
        query: (input: { playbookId: string }) => Promise<PreviewCourseFromPlaybookResult>
      }
      createCourseFromPlaybook?: {
        mutate: (input: CreateCourseFromPlaybookInput) => Promise<CreateCourseFromPlaybookResult>
      }
    }
  }
}

export async function fetchCareerPlaybookLibraryPage(input: {
  locale: string
  cursor?: string | null
  search?: string
  status?: CareerPlaybookLibraryFilters['status']
  department?: string
  level?: string
  sort?: CareerPlaybookLibraryFilters['sort']
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
      status: input.status,
      department: input.department,
      level: input.level,
      sort: input.sort,
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

export async function deleteCareerPlaybook(playbookId: string, locale: string) {
  const client = getBrowserTrpcClient() as unknown as BrowserCareerPlaybookClient
  const procedure = client.careerPlaybook?.library?.delete

  if (!procedure) {
    throw new Error(`careerPlaybook.library.delete unavailable (${locale})`)
  }

  await procedure.mutate({ playbookId })

  return { deletedId: playbookId }
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

export async function updateCareerPlaybookVisibility(
  playbookId: string,
  visibility: CareerPlaybookVisibility,
  locale: string
) {
  const client = getBrowserTrpcClient() as unknown as BrowserCareerPlaybookClient
  const procedure = client.careerPlaybook?.library?.updateVisibility

  if (!procedure) {
    throw new Error(`careerPlaybook.library.updateVisibility unavailable (${locale})`)
  }

  return procedure.mutate({ playbookId, visibility })
}

export async function createCourseFromPlaybook(
  input: CreateCourseFromPlaybookInput
): Promise<CreateCourseFromPlaybookResult> {
  const client = getBrowserTrpcClient() as unknown as BrowserCareerPlaybookClient
  const procedure = client.careerPlaybook?.courseBridge?.createCourseFromPlaybook

  if (!procedure) {
    throw new Error('careerPlaybook.courseBridge.createCourseFromPlaybook unavailable')
  }

  return procedure.mutate(input)
}

export async function previewCourseFromPlaybook(input: {
  playbookId: string
}): Promise<PreviewCourseFromPlaybookResult> {
  const client = getBrowserTrpcClient() as unknown as BrowserCareerPlaybookClient
  const procedure = client.careerPlaybook?.courseBridge?.previewCourseFromPlaybook

  if (!procedure) {
    throw new Error('careerPlaybook.courseBridge.previewCourseFromPlaybook unavailable')
  }

  return procedure.query(input)
}
