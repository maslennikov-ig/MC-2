'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface MetricCardProps {
  /** Icon component to display */
  icon: React.ReactNode;
  /** Metric label (uppercase, small text) */
  label: string;
  /** Metric value (large, monospace) */
  value: string | number;
  /** Visual variant for different states */
  variant?: 'default' | 'success' | 'warning' | 'error';
  /** Optional animation delay for stagger effect */
  animationDelay?: number;
}

/**
 * MetricCard Component
 *
 * Professional metric display card with:
 * - Gradient background
 * - Hover effects (glow, translateY)
 * - Staggered fade-in animation
 * - Variant-based color schemes
 */
export const MetricCard = ({
  icon,
  label,
  value,
  variant = 'default',
  animationDelay = 0,
}: MetricCardProps) => {
  // Variant-specific styling
  const variantStyles = {
    default: {
      bg: 'from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900',
      border: 'border-slate-200 hover:border-blue-400 dark:border-slate-700/50 dark:hover:border-cyan-500/50',
      glow: 'hover:shadow-blue-200/50 dark:hover:shadow-cyan-500/20',
      icon: 'text-blue-500 dark:text-cyan-400',
      value: 'text-slate-900 dark:text-cyan-400',
    },
    success: {
      bg: 'from-emerald-50 to-slate-50 dark:from-emerald-900/30 dark:to-slate-900',
      border: 'border-emerald-200 hover:border-emerald-400 dark:border-emerald-700/50 dark:hover:border-emerald-500/50',
      glow: 'hover:shadow-emerald-200/50 dark:hover:shadow-emerald-500/20',
      icon: 'text-emerald-600 dark:text-emerald-400',
      value: 'text-emerald-700 dark:text-emerald-400',
    },
    warning: {
      bg: 'from-amber-50 to-slate-50 dark:from-amber-900/30 dark:to-slate-900',
      border: 'border-amber-200 hover:border-amber-400 dark:border-amber-700/50 dark:hover:border-amber-500/50',
      glow: 'hover:shadow-amber-200/50 dark:hover:shadow-amber-500/20',
      icon: 'text-amber-600 dark:text-amber-400',
      value: 'text-amber-700 dark:text-amber-400',
    },
    error: {
      bg: 'from-red-50 to-slate-50 dark:from-red-900/30 dark:to-slate-900',
      border: 'border-red-200 hover:border-red-400 dark:border-red-700/50 dark:hover:border-red-500/50',
      glow: 'hover:shadow-red-200/50 dark:hover:shadow-red-500/20',
      icon: 'text-red-600 dark:text-red-400',
      value: 'text-red-700 dark:text-red-400',
    },
  };

  const styles = variantStyles[variant];

  return (
    <div
      className={cn(
        // Base styling
        'relative rounded-lg p-4 border',
        'bg-gradient-to-br',
        styles.bg,
        styles.border,
        // Hover effects
        'transition-all duration-300 ease-out',
        'hover:-translate-y-0.5 hover:shadow-lg',
        styles.glow,
        // Animation
        'animate-fade-in',
        'opacity-0'
      )}
      style={{
        animationDelay: `${animationDelay}ms`,
        animationFillMode: 'forwards',
      }}
    >
      {/* Icon and Label Row */}
      <div className="flex items-center gap-3 mb-3">
        <div className={cn('w-5 h-5', styles.icon)}>{icon}</div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
          {label}
        </div>
      </div>

      {/* Value */}
      <div
        className={cn(
          'text-2xl font-mono font-semibold',
          styles.value
        )}
      >
        {value}
      </div>
    </div>
  );
};
