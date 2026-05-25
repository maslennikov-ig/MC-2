'use client'

import { FileText, Loader2 } from 'lucide-react'
import type { CareerPlaybookViewerSnapshot } from '@megacampus/shared-types'

import { MarkdownRendererClient } from '@/components/markdown/MarkdownRendererClient'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import type {
  CareerPlaybookBlockId,
  CareerPlaybookViewerBlock,
} from '@/stores/use-career-playbook-store'

export interface StreamingViewCopy {
  productLabel?: string
  generatingTitle?: (title: string) => string
  blocksReady?: (ready: number, total: number) => string
  thinkingStream?: string
  streamingBlockPending?: string
  blockTitle?: (blockId: CareerPlaybookBlockId, fallback: string) => string
  blockGroupLabel?: (groupKey: CareerPlaybookViewerBlock['groupKey'], fallback: string) => string
  blockStatusLabel?: (status: CareerPlaybookViewerBlock['state']['status']) => string
}

interface StreamingViewProps {
  snapshot: CareerPlaybookViewerSnapshot
  blocks: CareerPlaybookViewerBlock[]
  showThinkingStream: boolean
  copy?: StreamingViewCopy
  onToggleThinkingStream: () => void
}

const defaultCopy: Required<StreamingViewCopy> = {
  productLabel: 'Role Guide',
  generatingTitle: (title) => `Generating ${title}`,
  blocksReady: (ready, total) => `${ready} of ${total} blocks ready`,
  thinkingStream: 'Show thinking stream',
  streamingBlockPending: 'This block is being generated.',
  blockTitle: (_blockId, fallback) => fallback,
  blockGroupLabel: (_groupKey, fallback) => fallback,
  blockStatusLabel: (status) => status,
}

const VIEWER_BLOCK_GROUP_KEYS = [
  'group_1_foundation',
  'group_2_operations',
  'group_3_people',
  'group_4_growth',
  'group_5_system',
  'group_6_wrap',
] as const

function isViewerBlockGroupKey(value: string): value is CareerPlaybookViewerBlock['groupKey'] {
  return VIEWER_BLOCK_GROUP_KEYS.some((groupKey) => groupKey === value)
}

export function StreamingView({
  snapshot,
  blocks,
  showThinkingStream,
  copy,
  onToggleThinkingStream,
}: StreamingViewProps) {
  const labels = { ...defaultCopy, ...copy }
  const generatedBlocks = blocks.filter((block) => block.state.status === 'generated')
  const progress = Math.round((generatedBlocks.length / Math.max(blocks.length, 1)) * 100)
  const visibleBlocks = blocks.filter(
    (block) => block.state.content.trim().length > 0 || block.state.status === 'generating'
  )

  return (
    <main className="career-playbook-zone">
      <section className="career-playbook-topbar">
        <div className="mx-auto grid max-w-[1760px] gap-5 px-4 py-6 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-md">
              <FileText className="mr-1 h-3.5 w-3.5" aria-hidden />
              {labels.productLabel}
            </Badge>
            <Badge variant="outline" className="rounded-md">
              {snapshot.currentGenerationGroup &&
              isViewerBlockGroupKey(snapshot.currentGenerationGroup)
                ? labels.blockGroupLabel(
                    snapshot.currentGenerationGroup,
                    snapshot.currentGenerationGroup.replaceAll('_', ' ')
                  )
                : labels.blockStatusLabel('generating')}
            </Badge>
          </div>

          <div className="grid gap-3">
            <div className="flex items-center gap-3">
              <Loader2
                className="h-5 w-5 animate-spin text-purple-600 dark:text-purple-300"
                aria-hidden
              />
              <h1 className="text-3xl font-semibold tracking-normal">
                {labels.generatingTitle(snapshot.title)}
              </h1>
            </div>
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-300">
                <span>{labels.blocksReady(generatedBlocks.length, blocks.length)}</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="career-playbook-thinking-stream"
              checked={showThinkingStream}
              onCheckedChange={onToggleThinkingStream}
              aria-label={labels.thinkingStream}
            />
            <label
              htmlFor="career-playbook-thinking-stream"
              className="text-sm text-slate-700 dark:text-slate-300"
            >
              {labels.thinkingStream}
            </label>
          </div>

          {showThinkingStream && snapshot.thinkingStream ? (
            <pre className="career-playbook-muted-card overflow-x-auto p-3 text-xs leading-5 whitespace-pre-wrap text-slate-700 dark:text-slate-300">
              {snapshot.thinkingStream}
            </pre>
          ) : null}
        </div>
      </section>

      <section className="mx-auto grid max-w-[1760px] gap-4 px-4 py-6 md:px-6">
        {visibleBlocks.map((block) => (
          <article
            key={block.blockId}
            aria-label={labels.blockTitle(block.blockId, block.title)}
            className="career-playbook-document p-4"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {labels.blockTitle(block.blockId, block.title)}
              </h2>
              <Badge variant="outline" className="rounded-md">
                {labels.blockStatusLabel(block.state.status)}
              </Badge>
            </div>
            {block.state.content.trim() ? (
              <MarkdownRendererClient content={block.state.content} />
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {labels.streamingBlockPending}
              </p>
            )}
          </article>
        ))}
      </section>
    </main>
  )
}
