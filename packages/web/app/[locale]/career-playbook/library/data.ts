import { getServerTrpcClient } from '@/lib/trpc/server-caller'
import {
  normalizeLibraryItem,
  normalizeLibraryResponse,
} from '@/components/career-playbook/library/normalizers'
import type {
  CareerPlaybookLibraryData,
  CareerPlaybookLibraryFilters,
  CareerPlaybookLibraryItem,
} from '@/components/career-playbook/library/types'

type GetCareerPlaybookLibraryInput = Partial<CareerPlaybookLibraryFilters> & {
  userId: string
  limit?: number
}

type ServerCareerPlaybookClient = {
  careerPlaybook?: {
    library?: {
      list?: {
        query: (
          input: { limit: number } & Partial<CareerPlaybookLibraryFilters>
        ) => Promise<unknown>
      }
      get?: {
        query: (input: { playbookId: string }) => Promise<unknown>
      }
    }
  }
}

export async function getCareerPlaybookLibrary(
  input: GetCareerPlaybookLibraryInput
): Promise<CareerPlaybookLibraryData> {
  const client = (await getServerTrpcClient()) as unknown as ServerCareerPlaybookClient
  const transport = client.careerPlaybook?.library?.list

  if (!transport) {
    return {
      items: [],
      nextCursor: null,
      error: 'careerPlaybook.library.list transport unavailable',
    }
  }

  try {
    const data = await transport.query({
      limit: input.limit ?? 50,
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

export async function getCareerPlaybookById(playbookId: string) {
  const client = (await getServerTrpcClient()) as unknown as ServerCareerPlaybookClient
  const transport = client.careerPlaybook?.library?.get

  if (!transport) {
    return {
      item: null as CareerPlaybookLibraryItem | null,
      error: 'careerPlaybook.library.get transport unavailable',
    }
  }

  try {
    const data = await transport.query({ playbookId })
    return {
      item: normalizeLibraryItem(data),
      error: null as string | null,
    }
  } catch (error) {
    return {
      item: null as CareerPlaybookLibraryItem | null,
      error: error instanceof Error ? error.message : 'careerPlaybook.library.get failed',
    }
  }
}
