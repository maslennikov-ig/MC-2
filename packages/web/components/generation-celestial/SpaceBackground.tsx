'use client';

import { cn } from '@/lib/utils';

interface SpaceBackgroundProps {
  className?: string;
  children?: React.ReactNode;
}

export function SpaceBackground({ className, children }: SpaceBackgroundProps) {
  return (
    <div 
      className={cn(
        "relative w-full min-h-screen overflow-hidden transition-colors duration-500",
        // Dark Mode (Space)
        "dark:bg-[#0a0e1a]",
        "dark:bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))]",
        "dark:from-[#111827] dark:via-[#0a0e1a] dark:to-[#000000]",
        // Light Mode (Ethereal)
        "bg-slate-50",
        "bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))]",
        "from-purple-50 via-slate-50 to-white",
        className
      )}
    >
      {/* Dark Mode: Star field effect layer 1 (small stars) */}
      <div className="absolute inset-0 z-0 opacity-40 dark:block hidden"
        style={{
          backgroundImage: 'radial-gradient(white 1px, transparent 1px)',
          backgroundSize: '50px 50px',
        }}
      />
      
      {/* Dark Mode: Star field effect layer 2 (larger stars) */}
      <div className="absolute inset-0 z-0 opacity-20 dark:block hidden"
        style={{
          backgroundImage: 'radial-gradient(white 2px, transparent 2px)',
          backgroundSize: '120px 120px',
          backgroundPosition: '20px 20px',
        }}
      />

      {/* Dark Mode: Subtle purple nebula glow */}
      <div className="absolute top-0 left-1/4 w-1/2 h-1/2 bg-purple-900/10 blur-[100px] rounded-full pointer-events-none z-0 dark:block hidden" />
      
      {/* Light Mode: Subtle gradient mesh */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-200/20 blur-[120px] rounded-full pointer-events-none z-0 dark:hidden block" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-200/20 blur-[120px] rounded-full pointer-events-none z-0 dark:hidden block" />

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}