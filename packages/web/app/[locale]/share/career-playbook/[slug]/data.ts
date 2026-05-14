import { getServerTrpcClient } from '@/lib/trpc/server-caller'
import type {
  CareerPlaybookPublicSharePlaybook,
  CareerPlaybookPublicShareResult,
} from '@/components/career-playbook/library/types'

type RawRecord = Record<string, unknown>

type ServerCareerPlaybookClient = {
  careerPlaybook?: {
    share?: {
      getPublicBySlug?: {
        query: (input: { shareSlug: string }) => Promise<unknown>
      }
    }
  }
}

interface GetPublicCareerPlaybookBySlugInput {
  slug: string
}

function readString(record: RawRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim().length > 0) return value
  }
  return null
}

function readBoolean(record: RawRecord, ...keys: string[]): boolean | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'boolean') return value
  }
  return null
}

function normalizePublicPlaybook(
  rawValue: unknown,
  slug: string
): CareerPlaybookPublicSharePlaybook | null {
  if (!rawValue || typeof rawValue !== 'object') return null
  const row = rawValue as RawRecord
  const id = readString(row, 'id')
  if (!id) return null

  const title = readString(row, 'title', 'position_title', 'positionTitle') ?? 'Untitled Role Guide'
  const markdown = readString(row, 'final_markdown', 'finalMarkdown', 'markdown', 'content') ?? ''
  const summary = readString(row, 'summary', 'description') ?? markdown.slice(0, 180).trim()

  return {
    id,
    slug: readString(row, 'share_slug', 'shareSlug', 'slug') ?? slug,
    title,
    summary,
    markdown,
    department: readString(row, 'department'),
    level: readString(row, 'level'),
    language: readString(row, 'language'),
    createdAt: readString(row, 'created_at', 'createdAt') ?? new Date(0).toISOString(),
  }
}

function mapQueryError(error: unknown): CareerPlaybookPublicShareResult['status'] {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof error === 'string'
        ? error.toLowerCase()
        : ''

  if (message.includes('not_found') || message.includes('not found')) return 'not-found'
  if (message.includes('forbidden') || message.includes('private')) return 'private'
  if (message.includes('method_not_supported') || message.includes('not implemented'))
    return 'unavailable'

  return 'unavailable'
}

export async function getPublicCareerPlaybookBySlug(
  input: GetPublicCareerPlaybookBySlugInput
): Promise<CareerPlaybookPublicShareResult> {
  const client = (await getServerTrpcClient()) as unknown as ServerCareerPlaybookClient
  const transport = client.careerPlaybook?.share?.getPublicBySlug

  if (!transport) {
    return { status: 'unavailable', playbook: null }
  }

  try {
    const response = await transport.query({ shareSlug: input.slug })
    if (!response || typeof response !== 'object') {
      return { status: 'not-found', playbook: null }
    }

    const payload = response as RawRecord
    if (payload.status === 'not-found') return { status: 'not-found', playbook: null }
    if (payload.status === 'private') return { status: 'private', playbook: null }

    const candidate = (payload.playbook ?? payload.item ?? payload.data ?? payload) as unknown
    const normalized = normalizePublicPlaybook(candidate, input.slug)
    if (!normalized) return { status: 'not-found', playbook: null }

    const isPublic = readBoolean(candidate as RawRecord, 'is_public', 'isPublic')
    if (isPublic === false) return { status: 'private', playbook: null }

    return { status: 'ok', playbook: normalized }
  } catch (error) {
    return { status: mapQueryError(error), playbook: null }
  }
}
