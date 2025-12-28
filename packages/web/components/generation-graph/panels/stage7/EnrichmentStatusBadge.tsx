/**
 * EnrichmentStatusBadge Component
 *
 * Displays status badge for enrichments with appropriate icon, color, and label.
 * Used in Stage 7 inspector panel for showing enrichment status.
 *
 * @module components/generation-graph/panels/stage7/EnrichmentStatusBadge
 */

import { useLocale } from 'next-intl';
import {
  Clock,
  Loader2,
  FileEdit,
  CheckCircle2,
  XCircle,
  Ban,
} from 'lucide-react';
import {
  ENRICHMENT_STATUS_CONFIG,
  type EnrichmentStatus,
} from '@/lib/generation-graph/enrichment-config';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import { cn } from '@/lib/utils';

/**
 * Props for EnrichmentStatusBadge
 */
export interface EnrichmentStatusBadgeProps {
  /** Enrichment status */
  status: EnrichmentStatus;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Whether to show the label text */
  showLabel?: boolean;
  /** Optional className override */
  className?: string;
}

/**
 * Map status to icon component
 */
const STATUS_ICONS: Record<EnrichmentStatus, React.ComponentType<{ className?: string }>> = {
  pending: Clock,
  draft_generating: Loader2,
  draft_ready: FileEdit,
  generating: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: Ban,
};

/**
 * Map status to background color (subtle, 10% opacity)
 */
const STATUS_BG_COLORS: Record<EnrichmentStatus, string> = {
  pending: 'bg-slate-500/10',
  draft_generating: 'bg-blue-500/10',
  draft_ready: 'bg-amber-500/10',
  generating: 'bg-blue-500/10',
  completed: 'bg-emerald-500/10',
  failed: 'bg-red-500/10',
  cancelled: 'bg-slate-500/10',
};

/**
 * EnrichmentStatusBadge
 *
 * Small badge component showing enrichment status with icon, color, and optional label.
 */
export function EnrichmentStatusBadge({
  status,
  size = 'md',
  showLabel = true,
  className,
}: EnrichmentStatusBadgeProps) {
  const locale = useLocale();

  // Get status configuration
  const statusConfig = ENRICHMENT_STATUS_CONFIG[status];
  const Icon = STATUS_ICONS[status];
  const bgColor = STATUS_BG_COLORS[status];
  const textColor = statusConfig.color;

  // Get label text from translations
  const label = GRAPH_TRANSLATIONS.enrichments?.status[status][locale as 'ru' | 'en'] ?? status;

  // Size variants
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const padding = size === 'sm' ? 'px-1 py-0.5' : 'px-2 py-0.5';
  const gap = size === 'sm' ? 'gap-0.5' : 'gap-1';

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full',
        bgColor,
        padding,
        gap,
        className
      )}
    >
      <Icon
        className={cn(
          iconSize,
          textColor,
          statusConfig.animate && 'animate-spin'
        )}
      />
      {showLabel && (
        <span className={cn(textSize, textColor)}>
          {label}
        </span>
      )}
    </div>
  );
}

export default EnrichmentStatusBadge;
