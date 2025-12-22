"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

export function Toaster({ ...props }: ToasterProps) {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="bottom-right"
      expand={false}
      richColors
      closeButton
      visibleToasts={4}
      gap={12}
      offset="24px"
      duration={4000}
      toastOptions={{
        classNames: {
          toast: 'group toast font-sans',
          title: 'text-sm font-medium',
          description: 'text-sm opacity-90',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
          closeButton: 'opacity-0 group-hover:opacity-100 transition-opacity',
          success: 'border-green-500/20 bg-green-50 dark:bg-green-950/50 text-green-900 dark:text-green-100',
          error: 'border-red-500/20 bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-100',
          warning: 'border-yellow-500/20 bg-yellow-50 dark:bg-yellow-950/50 text-yellow-900 dark:text-yellow-100',
          info: 'border-blue-500/20 bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-100',
        },
      }}
      {...props}
    />
  )
}
