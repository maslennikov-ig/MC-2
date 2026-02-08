'use client'

import { cn } from '@/lib/utils'

interface SpaceBackgroundProps {
  className?: string
  children?: React.ReactNode
}

export function SpaceBackground({ className, children }: SpaceBackgroundProps) {
  return (
    <div
      className={cn(
        'relative min-h-screen w-full overflow-hidden transition-colors duration-500',
        // Dark Mode (Space)
        'dark:bg-[#0a0e1a]',
        'dark:bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))]',
        'dark:from-[#111827] dark:via-[#0a0e1a] dark:to-[#000000]',
        // Light Mode (Ethereal)
        'bg-slate-50',
        'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))]',
        'from-purple-50 via-slate-50 to-white',
        className
      )}
    >
      {/* Dark Mode: Star field effect layer 1 (small stars) */}
      <div
        className="absolute inset-0 z-0 hidden opacity-40 dark:block"
        style={{
          backgroundImage: 'radial-gradient(white 1px, transparent 1px)',
          backgroundSize: '50px 50px',
        }}
      />

      {/* Dark Mode: Star field effect layer 2 (larger stars) */}
      <div
        className="absolute inset-0 z-0 hidden opacity-20 dark:block"
        style={{
          backgroundImage: 'radial-gradient(white 2px, transparent 2px)',
          backgroundSize: '120px 120px',
          backgroundPosition: '20px 20px',
        }}
      />

      {/* Dark Mode: Subtle purple nebula glow */}
      <div className="pointer-events-none absolute top-0 left-1/4 z-0 hidden h-1/2 w-1/2 rounded-full bg-purple-900/10 blur-[100px] dark:block" />

      {/* Light Mode: Subtle gradient mesh */}
      <div className="pointer-events-none absolute top-0 right-0 z-0 block h-[500px] w-[500px] rounded-full bg-purple-200/20 blur-[120px] dark:hidden" />
      <div className="pointer-events-none absolute bottom-0 left-0 z-0 block h-[500px] w-[500px] rounded-full bg-blue-200/20 blur-[120px] dark:hidden" />

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  )
}
