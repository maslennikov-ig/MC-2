'use client';

import React, { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Circle,
  MinusCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import type {
  Stage1ProcessTabProps,
  ValidationStep,
  ValidationStepStatus,
} from './types';

/**
 * Status icon mapping with colors
 */
const statusConfig: Record<
  ValidationStepStatus | 'pending' | 'skipped',
  {
    icon: React.ElementType;
    colorClass: string;
    animate?: boolean;
  }
> = {
  success: {
    icon: CheckCircle2,
    colorClass: 'text-green-500',
  },
  warning: {
    icon: AlertTriangle,
    colorClass: 'text-amber-500',
  },
  error: {
    icon: XCircle,
    colorClass: 'text-red-500',
  },
  pending: {
    icon: Circle,
    colorClass: 'text-muted-foreground',
    animate: true,
  },
  skipped: {
    icon: MinusCircle,
    colorClass: 'text-gray-400',
  },
};

/**
 * Formats duration in milliseconds to human-readable string
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "12ms" or "1.2s")
 */
function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null) return '';
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}

/**
 * Generates default validation steps based on overall status
 * Used when no explicit steps are provided
 */
function generateDefaultSteps(
  status: 'pending' | 'completed' | 'error',
  locale: 'ru' | 'en',
  hasFiles = false
): ValidationStep[] {
  const t = GRAPH_TRANSLATIONS.stage1;

  const baseSteps: Array<{
    id: ValidationStep['id'];
    name: string;
    description: string;
    requiresFiles?: boolean;
    mockDuration: number;
  }> = [
    {
      id: 'validation',
      name: t?.validation?.[locale] ?? 'Input Validation',
      description: t?.validationDesc?.[locale] ?? 'Checking required fields',
      mockDuration: 45,
    },
    {
      id: 'security',
      name: t?.securityScan?.[locale] ?? 'Security Scan',
      description: t?.securityScanDesc?.[locale] ?? 'Scanning files',
      requiresFiles: true,
      mockDuration: 120,
    },
    {
      id: 'storage',
      name: t?.storageUpload?.[locale] ?? 'Storage Upload',
      description: t?.storageUploadDesc?.[locale] ?? 'Saving files to storage',
      requiresFiles: true,
      mockDuration: 250,
    },
    {
      id: 'registry',
      name: t?.registry?.[locale] ?? 'Course Registry',
      description: t?.registryDesc?.[locale] ?? 'Creating database record',
      mockDuration: 35,
    },
  ];

  // Filter steps based on whether files are present
  const applicableSteps = baseSteps.filter(
    (step) => !step.requiresFiles || hasFiles
  );

  if (status === 'completed') {
    return applicableSteps.map((step) => ({
      id: step.id,
      name: step.name,
      status: 'success' as const,
      durationMs: step.mockDuration,
    }));
  }

  if (status === 'error') {
    return applicableSteps.map((step, index) => ({
      id: step.id,
      name: step.name,
      status:
        index === applicableSteps.length - 1
          ? ('error' as const)
          : ('success' as const),
      durationMs: index === applicableSteps.length - 1 ? undefined : step.mockDuration,
      message:
        index === applicableSteps.length - 1
          ? 'Database connection failed'
          : undefined,
    }));
  }

  // Pending: first step is pending, rest are untouched
  return applicableSteps.map((step, index) => ({
    id: step.id,
    name: step.name,
    status: index === 0 ? ('pending' as const) : ('pending' as const),
    durationMs: undefined,
  }));
}

/**
 * Individual validation step row component
 */
interface ValidationStepRowProps {
  step: ValidationStep;
  description?: string;
  locale: 'ru' | 'en';
}

function ValidationStepRow({ step, description, locale }: ValidationStepRowProps) {
  const t = GRAPH_TRANSLATIONS.stage1;
  const isPending = step.status === 'pending';
  const isSkipped = !['success', 'warning', 'error', 'pending'].includes(step.status);
  const effectiveStatus = isSkipped ? 'skipped' : step.status;
  const config = statusConfig[effectiveStatus as keyof typeof statusConfig] || statusConfig.pending;
  const Icon = config.icon;

  // Get description from translations if not provided
  const getDescription = (): string => {
    if (description) return description;

    const descMap: Record<ValidationStep['id'], string | undefined> = {
      validation: t?.validationDesc?.[locale],
      security: t?.securityScanDesc?.[locale],
      storage: t?.storageUploadDesc?.[locale],
      registry: t?.registryDesc?.[locale],
    };

    return descMap[step.id] ?? '';
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg transition-colors duration-200',
        step.status === 'error' && 'bg-red-50 dark:bg-red-950/20',
        step.status === 'success' && 'bg-green-50/50 dark:bg-green-950/10',
        isPending && 'bg-muted/30'
      )}
    >
      {/* Status icon */}
      <div className="mt-0.5 flex-shrink-0">
        {isPending && config.animate ? (
          <div className="relative">
            <Loader2 className={cn('h-5 w-5 animate-spin', config.colorClass)} />
          </div>
        ) : (
          <Icon className={cn('h-5 w-5', config.colorClass)} />
        )}
      </div>

      {/* Step details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'font-medium text-sm',
              step.status === 'error' && 'text-red-700 dark:text-red-400',
              step.status === 'success' && 'text-foreground',
              isPending && 'text-muted-foreground'
            )}
          >
            {step.name}
          </span>

          {/* Duration badge */}
          {step.durationMs !== undefined && step.durationMs > 0 && (
            <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
              {formatDuration(step.durationMs)}
            </span>
          )}

          {/* Skipped indicator */}
          {isSkipped && (
            <span className="text-xs text-gray-400 italic">
              {t?.stepSkipped?.[locale] ?? 'Skipped'}
            </span>
          )}
        </div>

        <p className="text-sm text-muted-foreground mt-0.5">
          {getDescription()}
        </p>

        {/* Error message expansion */}
        {step.status === 'error' && step.message && (
          <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 rounded-md">
            <p className="text-sm text-red-700 dark:text-red-300 font-mono">
              {step.message}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Stage1ProcessTab Component
 *
 * Displays a "Validation Receipt" checklist showing instant validation steps.
 * Shows the status of each validation step with timing information.
 */
export const Stage1ProcessTab = memo<Stage1ProcessTabProps>(function Stage1ProcessTab({
  steps: providedSteps,
  totalDurationMs,
  status = 'completed',
  locale = 'ru',
}) {
  const t = GRAPH_TRANSLATIONS.stage1;

  // Generate default steps if not provided
  const steps = providedSteps || generateDefaultSteps(status, locale);

  // Calculate total duration from steps if not provided
  const calculatedTotal =
    totalDurationMs ??
    steps.reduce((sum, step) => sum + (step.durationMs ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Validation Receipt Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            {t?.validationReceipt?.[locale] ?? 'Validation Receipt'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {steps.map((step) => (
            <ValidationStepRow
              key={step.id}
              step={step}
              locale={locale}
            />
          ))}
        </CardContent>
      </Card>

      {/* Total Latency Footer */}
      {calculatedTotal > 0 && (
        <Card className="bg-muted/50">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{t?.totalLatency?.[locale] ?? 'Total Latency'}</span>
              </div>
              <span className="text-lg font-mono font-semibold text-foreground">
                {formatDuration(calculatedTotal)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
});

export default Stage1ProcessTab;
