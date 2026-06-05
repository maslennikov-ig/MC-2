'use client'

import type { LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PanelIconButtonProps {
  label: string
  Icon: LucideIcon
  onClick: () => void
  expanded?: boolean
  className?: string
}

export function PanelIconButton({
  label,
  Icon,
  onClick,
  expanded,
  className,
}: PanelIconButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      aria-expanded={expanded}
      title={label}
      onClick={onClick}
      className={cn('h-9 w-9 shrink-0 rounded-md', className)}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </Button>
  )
}
