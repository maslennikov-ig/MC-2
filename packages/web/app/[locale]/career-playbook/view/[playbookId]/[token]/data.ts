import { getServerTrpcClient } from '@/lib/trpc/server-caller'
import type {
  CareerPlaybookPublicSharePlaybook,
  CareerPlaybookPublicShareResult,
} from '@/components/career-playbook/library/types'

type RawRecord = Record<string, unknown>

type ServerCareerPlaybookClient = {
  careerPlaybook?: {
    share?: {
      getViewByToken?: {
        query: (input: { playbookId: string; token: string }) => Promise<unknown>
      }
    }
  }
}

export type CareerPlaybookViewAudience = 'employee' | 'manager' | 'hr'

export interface CareerPlaybookViewResult extends CareerPlaybookPublicShareResult {
  audience: CareerPlaybookViewAudience | null
}

function readString(record: RawRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim().length > 0) return value
  }
  return null
}

function normalize(rawValue: unknown): CareerPlaybookPublicSharePlaybook | null {
  if (!rawValue || typeof rawValue !== 'object') return null
  const row = rawValue as RawRecord
  const id = readString(row, 'id')
  if (!id) return null

  const title = readString(row, 'title', 'position_title', 'positionTitle') ?? 'Untitled Role Guide'
  const markdown = readString(row, 'final_markdown', 'finalMarkdown', 'markdown', 'content') ?? ''

  return {
    id,
    slug: readString(row, 'share_slug', 'shareSlug', 'slug') ?? id,
    organizationSlug: readString(row, 'organization_slug', 'organizationSlug'),
    title,
    summary: readString(row, 'summary', 'description') ?? markdown.slice(0, 180).trim(),
    markdown,
    department: readString(row, 'department'),
    level: readString(row, 'level'),
    language: readString(row, 'language'),
    imageUrl: readString(row, 'imageUrl', 'image_url'),
    imageStatus: readString(
      row,
      'imageStatus',
      'image_status'
    ) as CareerPlaybookPublicSharePlaybook['imageStatus'],
    imageAltText: readString(row, 'imageAltText', 'image_alt_text'),
    imageErrorMessage: readString(row, 'imageErrorMessage', 'image_error_message'),
    createdAt: readString(row, 'created_at', 'createdAt') ?? new Date(0).toISOString(),
  }
}

/**
 * A wrong or stale link is "not found", never "forbidden": telling a visitor a
 * link exists but is not theirs is itself a disclosure.
 */
export async function getCareerPlaybookView(input: {
  playbookId: string
  token: string
}): Promise<CareerPlaybookViewResult> {
  const client = (await getServerTrpcClient()) as unknown as ServerCareerPlaybookClient
  const transport = client.careerPlaybook?.share?.getViewByToken

  if (!transport) {
    return { status: 'unavailable', playbook: null, audience: null }
  }

  try {
    const response = await transport.query(input)
    if (!response || typeof response !== 'object') {
      return { status: 'not-found', playbook: null, audience: null }
    }

    const payload = response as RawRecord
    const playbook = normalize(payload)
    if (!playbook || !playbook.markdown.trim()) {
      return { status: 'not-found', playbook: null, audience: null }
    }

    const audience = readString(payload, 'audience') as CareerPlaybookViewAudience | null
    return { status: 'ok', playbook, audience }
  } catch {
    return { status: 'not-found', playbook: null, audience: null }
  }
}
