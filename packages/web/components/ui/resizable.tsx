'use client'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { GroupProps, SeparatorProps } from 'react-resizable-panels'

import { cn } from '@/lib/utils'
import { DragHandleDots2Icon } from '@radix-ui/react-icons'

const ResizablePanelGroup = ({
  className,
  direction,
  ...props
}: Omit<GroupProps, 'orientation'> & {
  direction?: 'horizontal' | 'vertical'
}) => (
  <Group
    orientation={direction}
    className={cn('flex h-full w-full aria-[orientation=vertical]:flex-col', className)}
    {...props}
  />
)

const ResizablePanel = Panel

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: SeparatorProps & {
  withHandle?: boolean
}) => (
  <Separator
    className={cn(
      'bg-border focus-visible:ring-ring relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-none aria-[orientation=vertical]:h-px aria-[orientation=vertical]:w-full aria-[orientation=vertical]:after:left-0 aria-[orientation=vertical]:after:h-1 aria-[orientation=vertical]:after:w-full aria-[orientation=vertical]:after:translate-x-0 aria-[orientation=vertical]:after:-translate-y-1/2 [&[aria-orientation=vertical]>div]:rotate-90',
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-sm border">
        <DragHandleDots2Icon className="h-2.5 w-2.5" />
      </div>
    )}
  </Separator>
)

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
