'use client';

import React from 'react';
import { motion } from 'framer-motion';

/**
 * State for each individual bar in the equalizer-style animation
 */
export interface ExpanderBarState {
  sectionIndex: number;
  status: 'pending' | 'active' | 'completed' | 'error';
  progress: number; // 0-100
}

/**
 * Props for the ParallelExpanderBars component
 */
export interface ParallelExpanderBarsProps {
  bars: ExpanderBarState[];
  className?: string;
  showLabels?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Size configurations for different component sizes
 */
const SIZE_CONFIG = {
  sm: {
    barWidth: 6,
    barGap: 4,
    maxHeight: 30,
    borderRadius: 1.5,
    labelSize: 'text-[9px]',
    containerPadding: 'px-2 py-1.5',
  },
  md: {
    barWidth: 8,
    barGap: 6,
    maxHeight: 40,
    borderRadius: 2,
    labelSize: 'text-[10px]',
    containerPadding: 'px-3 py-2',
  },
  lg: {
    barWidth: 10,
    barGap: 8,
    maxHeight: 50,
    borderRadius: 2.5,
    labelSize: 'text-xs',
    containerPadding: 'px-4 py-3',
  },
};

/**
 * Get color classes based on bar status
 */
function getBarColor(status: ExpanderBarState['status']) {
  switch (status) {
    case 'pending':
      return 'bg-slate-300 dark:bg-slate-600';
    case 'active':
      return 'bg-blue-500 dark:bg-blue-400';
    case 'completed':
      return 'bg-green-500 dark:bg-green-400';
    case 'error':
      return 'bg-red-500 dark:bg-red-400';
    default:
      return 'bg-slate-300 dark:bg-slate-600';
  }
}

/**
 * ParallelExpanderBars - Visualizes parallel section expansion with animated bars
 *
 * Displays up to 5 vertical bars that animate like an audio equalizer,
 * representing the concurrent processing of sections in Stage 6 (Expander).
 *
 * @example
 * ```tsx
 * <ParallelExpanderBars
 *   bars={[
 *     { sectionIndex: 1, status: 'completed', progress: 100 },
 *     { sectionIndex: 2, status: 'active', progress: 65 },
 *     { sectionIndex: 3, status: 'active', progress: 42 },
 *     { sectionIndex: 4, status: 'pending', progress: 0 },
 *     { sectionIndex: 5, status: 'pending', progress: 0 },
 *   ]}
 *   showLabels
 *   size="md"
 * />
 * ```
 */
export function ParallelExpanderBars({
  bars,
  className = '',
  showLabels = true,
  size = 'md',
}: ParallelExpanderBarsProps) {
  const config = SIZE_CONFIG[size];

  // Ensure we have exactly 5 bars (pad with pending if needed)
  const normalizedBars: ExpanderBarState[] = Array.from({ length: 5 }, (_, i) =>
    bars[i] || { sectionIndex: i + 1, status: 'pending', progress: 0 }
  );

  return (
    <div className={`inline-flex flex-col items-center ${config.containerPadding} ${className}`}>
      {/* Bars Container */}
      <div
        className="flex items-end justify-center"
        style={{
          gap: `${config.barGap}px`,
          height: `${config.maxHeight}px`,
        }}
      >
        {normalizedBars.map((bar, index) => (
          <BarColumn
            key={`bar-${bar.sectionIndex}-${index}`}
            bar={bar}
            maxHeight={config.maxHeight}
            width={config.barWidth}
            borderRadius={config.borderRadius}
          />
        ))}
      </div>

      {/* Section Labels */}
      {showLabels && (
        <div
          className="flex items-center justify-center mt-1"
          style={{ gap: `${config.barGap}px` }}
        >
          {normalizedBars.map((bar, index) => (
            <div
              key={`label-${bar.sectionIndex}-${index}`}
              className={`${config.labelSize} text-slate-500 dark:text-slate-400 font-medium text-center`}
              style={{ width: `${config.barWidth}px` }}
            >
              {bar.sectionIndex}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Individual bar column with animations
 */
interface BarColumnProps {
  bar: ExpanderBarState;
  maxHeight: number;
  width: number;
  borderRadius: number;
}

function BarColumn({ bar, maxHeight, width, borderRadius }: BarColumnProps) {
  const { status, progress } = bar;

  // Calculate bar height based on status and progress
  const getBarHeight = () => {
    switch (status) {
      case 'pending':
        return maxHeight * 0.1; // 10% for pending
      case 'active':
        return (maxHeight * progress) / 100; // Dynamic based on progress
      case 'completed':
        return maxHeight; // 100% for completed
      case 'error':
        return (maxHeight * progress) / 100; // Current progress on error
      default:
        return maxHeight * 0.1;
    }
  };

  // Animation variants for different states
  const getAnimationProps = () => {
    const baseAnimation = {
      height: `${getBarHeight()}px`,
    };

    switch (status) {
      case 'active':
        // Bouncing/pulsing animation for active bars
        return {
          ...baseAnimation,
          y: [0, -5, 0],
        };
      case 'error':
        // Shake animation for errors
        return {
          ...baseAnimation,
          x: [-2, 2, -2, 2, 0],
        };
      default:
        return baseAnimation;
    }
  };

  // Transition configuration based on status
  const getTransition = () => {
    const baseTransition = {
      height: {
        type: 'spring' as const,
        stiffness: 300,
        damping: 25,
      },
    };

    switch (status) {
      case 'active':
        return {
          ...baseTransition,
          y: {
            duration: 0.5,
            repeat: Infinity,
            ease: 'easeInOut' as const,
          },
        };
      case 'error':
        return {
          ...baseTransition,
          x: {
            duration: 0.4,
            repeat: 2,
          },
        };
      default:
        return baseTransition;
    }
  };

  // Glow effect for completed bars
  const getGlowStyle = () => {
    if (status === 'completed') {
      return {
        boxShadow: '0 0 8px rgba(34, 197, 94, 0.5), 0 0 4px rgba(34, 197, 94, 0.3)',
      };
    }
    return {};
  };

  return (
    <motion.div
      className={`${getBarColor(status)} transition-colors`}
      style={{
        width: `${width}px`,
        borderTopLeftRadius: `${borderRadius}px`,
        borderTopRightRadius: `${borderRadius}px`,
        ...getGlowStyle(),
      }}
      initial={{ height: 0 }}
      animate={getAnimationProps()}
      transition={getTransition()}
      data-testid={`expander-bar-${bar.sectionIndex}`}
      data-status={status}
      data-progress={progress}
    />
  );
}
