'use client'

import type { MouseEvent, ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface CatalogActionButtonProps {
  icon?: ReactNode
  label: string
  onClick?: (event: MouseEvent) => void
  disabled?: boolean
  variant?: 'ghost' | 'outline' | 'default' | 'destructive' | 'secondary' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-xs'
  className?: string
  isActive?: boolean
  children?: ReactNode
}

export function CatalogActionButton({
  children,
  className,
  disabled = false,
  icon,
  isActive = false,
  label,
  onClick,
  size = 'icon-sm',
  variant = 'ghost',
}: CatalogActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          asChild={Boolean(children)}
          className={cn('transition-colors', isActive && 'text-purple-400', className)}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation()
            onClick?.(event)
          }}
          size={size}
          variant={variant}
        >
          {children ?? (
            <>
              {icon}
              <span className="sr-only">{label}</span>
            </>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  )
}
