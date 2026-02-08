'use client'

import React, { ReactNode } from 'react'
import * as Accordion from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PhaseAccordionProps {
  children: ReactNode
  type?: 'single' | 'multiple'
  defaultValue?: string | string[]
  className?: string
}

interface AccordionItemProps {
  value: string
  title: string
  description?: string
  children: ReactNode
  className?: string
}

export const PhaseAccordion = ({
  children,
  type = 'multiple',
  defaultValue,
  className,
}: PhaseAccordionProps) => {
  const accordionProps =
    type === 'single'
      ? { type: 'single' as const, collapsible: true, defaultValue: defaultValue as string }
      : { type: 'multiple' as const, defaultValue: defaultValue as string[] }

  return (
    <Accordion.Root {...accordionProps} className={cn('space-y-2', className)}>
      {children}
    </Accordion.Root>
  )
}

export const AccordionItem = ({
  value,
  title,
  description,
  children,
  className,
}: AccordionItemProps) => {
  return (
    <Accordion.Item
      value={value}
      className={cn(
        'overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800',
        className
      )}
    >
      <Accordion.Header className="flex">
        <Accordion.Trigger className="group flex flex-1 items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</span>
            {description && (
              <span className="text-xs text-slate-500 dark:text-slate-400">{description}</span>
            )}
          </div>
          <ChevronDown className="h-4 w-4 text-slate-500 transition-transform duration-200 group-data-[state=open]:rotate-180 dark:text-slate-400" />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up overflow-hidden">
        <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-700">{children}</div>
      </Accordion.Content>
    </Accordion.Item>
  )
}
