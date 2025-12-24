'use client';

import React, { memo, useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  FileText,
  File,
  Lock,
  Check,
  AlertTriangle,
  User,
  Building2,
  Hash,
} from 'lucide-react';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import { formatFileSize, HEAVY_PAYLOAD_THRESHOLD_BYTES } from '@/lib/generation-graph/format-utils';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { getSupabaseClient } from '@/lib/supabase/browser-client';
import type { Stage2InputTabProps, Stage2InputData, TierFeatures, TierKey } from './types';
import { getTierFeatures, parseTierFeaturesFromDB } from './types';

// ============================================================================
// FILE CATALOG INPUT DATA
// ============================================================================

interface FileCatalogInputData {
  filename: string;
  originalName: string | null;
  mimeType: string | null;
  fileSize: number;
  organizationId: string | null;
  tier: TierKey | null;
  /** Tier features from tier_settings.features JSONB */
  tierFeatures: Record<string, unknown> | null;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/** Valid tier values for Stage2InputData */
const VALID_TIERS: readonly TierKey[] = ['trial', 'free', 'basic', 'standard', 'premium'] as const;

/**
 * Runtime type guard for Stage2InputData
 * Validates all required fields and optional fields with proper type checking
 */
function isStage2InputData(data: unknown): data is Stage2InputData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;

  // Required fields validation
  const hasRequiredFields =
    typeof d.fileId === 'string' &&
    typeof d.tier === 'string' &&
    VALID_TIERS.includes(d.tier as TierKey) &&
    typeof d.originalFilename === 'string' &&
    typeof d.mimeType === 'string';

  if (!hasRequiredFields) return false;

  // Optional fields validation (if present, must be correct type)
  const validOptionals =
    (d.fileSize === undefined || typeof d.fileSize === 'number') &&
    (d.pageCount === undefined || typeof d.pageCount === 'number') &&
    (d.organizationId === undefined || typeof d.organizationId === 'string') &&
    (d.filePath === undefined || typeof d.filePath === 'string');

  return validOptionals;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if file size is considered "heavy" (exceeds threshold)
 */
function isHeavyPayload(bytes: number | undefined): boolean {
  if (!bytes || !Number.isFinite(bytes)) return false;
  return bytes > HEAVY_PAYLOAD_THRESHOLD_BYTES;
}

/**
 * Detect MIME type from filename extension
 */
function detectMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'txt':
      return 'text/plain';
    case 'md':
      return 'text/markdown';
    case 'ppt':
    case 'pptx':
      return 'application/vnd.ms-powerpoint';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Get file icon based on MIME type
 */
function getFileIcon(mimeType: string): React.ReactNode {
  const isPdf = mimeType.includes('pdf');
  const isDocx =
    mimeType.includes('word') ||
    mimeType.includes('document') ||
    mimeType.includes('docx');

  if (isPdf) {
    return <FileText className="h-8 w-8 text-red-500 dark:text-red-400" />;
  }
  if (isDocx) {
    return <FileText className="h-8 w-8 text-blue-500 dark:text-blue-400" />;
  }
  return <File className="h-8 w-8 text-muted-foreground" />;
}

// ============================================================================
// TIER COLORS
// ============================================================================

const TIER_COLORS: Record<TierKey, string> = {
  trial:
    'bg-purple-100 text-purple-600 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800',
  free:
    'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
  basic:
    'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  standard:
    'bg-blue-100 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
  premium:
    'bg-amber-100 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
};

// ============================================================================
// FEATURE LIST COMPONENT
// ============================================================================

interface FeatureItemProps {
  /** Feature display label */
  label: string;
  /** Whether the feature is active */
  isActive: boolean;
  /** Locale for translations */
  locale: 'ru' | 'en';
}

function FeatureItem({ label, isActive, locale }: FeatureItemProps) {
  const t = GRAPH_TRANSLATIONS.stage2;

  if (isActive) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Check className="h-4 w-4 text-green-500 dark:text-green-400 shrink-0" />
        <span className="text-foreground">{label}</span>
        <Badge
          variant="outline"
          className="ml-auto text-[10px] bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
        >
          {t?.featureActive?.[locale] || 'Active'}
        </Badge>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex items-center gap-2 text-sm opacity-60 cursor-help"
            role="button"
            tabIndex={0}
            aria-label={`${label} - ${t?.featureLocked?.[locale] || 'Locked'}`}
            aria-describedby={`tier-upgrade-hint-${label.replace(/\s+/g, '-').toLowerCase()}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                // Tooltip will show on focus
              }
            }}
          >
            <Lock className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="text-muted-foreground">{label}</span>
            <Badge
              variant="outline"
              className="ml-auto text-[10px] bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700"
            >
              {t?.featureLocked?.[locale] || 'Locked'}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p id={`tier-upgrade-hint-${label.replace(/\s+/g, '-').toLowerCase()}`}>
            {t?.upgradeHint?.[locale] || 'Requires Premium'}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ============================================================================
// TIER FEATURES LIST COMPONENT
// ============================================================================

interface TierFeaturesListProps {
  features: TierFeatures;
  locale: 'ru' | 'en';
}

function TierFeaturesList({ features, locale }: TierFeaturesListProps) {
  const t = GRAPH_TRANSLATIONS.stage2;

  const featureItems = [
    {
      key: 'textExtraction',
      label: locale === 'ru' ? 'Извлечение текста' : 'Text Extraction',
      isActive: true, // Always active for all tiers
    },
    {
      key: 'doclingConversion',
      label: t?.featureDocling?.[locale] || 'Smart Reading',
      isActive: features.doclingConversion,
    },
    {
      key: 'ocrExtraction',
      label: t?.featureOCR?.[locale] || 'Text Recognition',
      isActive: features.ocrExtraction,
    },
    {
      key: 'enhancedVisuals',
      label: t?.featureEnhanced?.[locale] || 'Enhanced Processing',
      isActive: features.enhancedVisuals,
    },
  ];

  return (
    <div className="space-y-2">
      {featureItems.map((item) => (
        <FeatureItem
          key={item.key}
          label={item.label}
          isActive={item.isActive}
          locale={locale}
        />
      ))}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const Stage2InputTab = memo<Stage2InputTabProps>(function Stage2InputTab({
  documentId,
  inputData,
  locale = 'ru',
}) {
  const t = GRAPH_TRANSLATIONS.stage2;

  // State for file_catalog data from Supabase
  const [fileCatalogData, setFileCatalogData] = useState<FileCatalogInputData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Get document data from Zustand store
  const documentFromStore = useGenerationStore(state =>
    documentId ? state.documents.get(documentId) : undefined
  );

  // Fetch file_catalog data when documentId is available
  useEffect(() => {
    if (!documentId) return;

    const fetchFileCatalogData = async () => {
      try {
        setFetchError(null); // Reset error state on new fetch
        const supabase = getSupabaseClient();
        // Join with organizations to get real tier
        const { data: row, error } = await supabase
          .from('file_catalog')
          .select(`
            filename,
            original_name,
            mime_type,
            file_size,
            organization_id,
            organizations!file_catalog_organization_id_fkey(tier)
          `)
          .eq('id', documentId)
          .single();

        if (error) {
          const errorMsg = locale === 'ru'
            ? 'Не удалось загрузить данные файла'
            : 'Failed to load file details';
          console.error('[Stage2InputTab] Error fetching file_catalog:', error);
          setFetchError(errorMsg);
          return;
        }

        if (row) {
          // Extract tier from joined organizations table
          const orgData = row.organizations as { tier: string } | null;
          // Fail-safe: default to 'free' tier (most restrictive) if tier unknown
          const tier = (orgData?.tier || 'free') as TierKey;

          // Fetch tier_settings.features for document processing capabilities
          let tierFeatures: Record<string, unknown> | null = null;
          const { data: tierSettingsRow, error: tierError } = await supabase
            .from('tier_settings')
            .select('features')
            .eq('tier_key', tier)
            .single();

          if (tierError) {
            console.warn('[Stage2InputTab] Failed to fetch tier features, using defaults:', tierError);
            // Continue with null tierFeatures - will fallback to DEFAULT_TIER_FEATURES
          } else if (tierSettingsRow) {
            tierFeatures = tierSettingsRow.features as Record<string, unknown>;
          }

          setFileCatalogData({
            filename: row.filename || '',
            originalName: row.original_name,
            mimeType: row.mime_type,
            fileSize: row.file_size || 0,
            organizationId: row.organization_id,
            tier: tier,
            tierFeatures: tierFeatures,
          });
        }
      } catch (err) {
        const errorMsg = locale === 'ru'
          ? 'Ошибка загрузки данных'
          : 'Failed to fetch file catalog data';
        console.error('[Stage2InputTab]', errorMsg, err);
        setFetchError(errorMsg);
      }
    };

    fetchFileCatalogData();
  }, [documentId, locale]);

  // Parse inputData safely with runtime type guard OR build from file_catalog/Zustand store
  const data = useMemo((): Stage2InputData | undefined => {
    // First priority: valid inputData from trace
    if (isStage2InputData(inputData)) {
      return inputData;
    }

    // Second priority: Build from file_catalog data (Supabase) - MOST ACCURATE
    if (fileCatalogData) {
      const displayName = fileCatalogData.originalName || fileCatalogData.filename;
      return {
        fileId: documentId || '',
        originalFilename: displayName,
        mimeType: fileCatalogData.mimeType || detectMimeType(displayName),
        // Use real tier from organization, fallback to 'free' (most restrictive)
        tier: fileCatalogData.tier || 'free',
        fileSize: fileCatalogData.fileSize,
        pageCount: undefined, // Not stored in file_catalog
        organizationId: fileCatalogData.organizationId || undefined,
      };
    }

    // Third priority: Build from Zustand store document data
    if (documentFromStore) {
      return {
        fileId: documentFromStore.id,
        originalFilename: documentFromStore.name,
        mimeType: detectMimeType(documentFromStore.name),
        tier: 'free' as const, // Fail-safe: most restrictive tier
        fileSize: undefined,
        pageCount: undefined,
        organizationId: undefined,
      };
    }

    // Fourth priority: Try to extract from raw inputData object
    if (inputData && typeof inputData === 'object') {
      const raw = inputData as Record<string, unknown>;
      const fileId = (raw.fileId ?? raw.file_id ?? raw.documentId ?? raw.document_id ?? '') as string;
      const filename = (raw.originalFilename ?? raw.filename ?? raw.file_name ?? raw.name ?? '') as string;
      const mimeType = (raw.mimeType ?? raw.mime_type ?? raw.file_type ?? detectMimeType(filename)) as string;
      const tier = (raw.tier ?? 'free') as TierKey; // Fail-safe: most restrictive tier

      if (fileId && filename) {
        return {
          fileId,
          originalFilename: filename,
          mimeType,
          tier: VALID_TIERS.includes(tier) ? tier : 'free',
          fileSize: typeof raw.fileSize === 'number' ? raw.fileSize :
                    typeof raw.file_size === 'number' ? raw.file_size : undefined,
          pageCount: typeof raw.pageCount === 'number' ? raw.pageCount :
                     typeof raw.page_count === 'number' ? raw.page_count : undefined,
          organizationId: typeof raw.organizationId === 'string' ? raw.organizationId :
                          typeof raw.organization_id === 'string' ? raw.organization_id : undefined,
        };
      }
    }

    return undefined;
  }, [inputData, documentFromStore, fileCatalogData, documentId]);

  // Compute tier features - prioritize DB data, fallback to defaults
  const tierFeatures = useMemo(() => {
    const tier = data?.tier || 'free'; // Fail-safe: most restrictive tier

    // If we have features from DB (tier_settings.features), use them
    if (fileCatalogData?.tierFeatures) {
      return parseTierFeaturesFromDB(fileCatalogData.tierFeatures, tier);
    }

    // Fallback to hardcoded defaults
    return getTierFeatures(tier);
  }, [data?.tier, fileCatalogData?.tierFeatures]);

  // Get tier label
  const tierLabel = useMemo(() => {
    if (!data?.tier) return t?.tierStandard?.[locale] || 'Standard';
    switch (data.tier) {
      case 'premium':
        return t?.tierPremium?.[locale] || 'Premium';
      case 'standard':
        return t?.tierStandard?.[locale] || 'Standard';
      case 'trial':
        return locale === 'ru' ? 'Пробный' : 'Trial';
      case 'free':
        return locale === 'ru' ? 'Бесплатный' : 'Free';
      case 'basic':
      default:
        return t?.tierBasic?.[locale] || 'Basic';
    }
  }, [data?.tier, locale, t]);

  // Error state
  if (fetchError) {
    return (
      <div className="p-4 text-center">
        <p className="text-destructive mb-2">{fetchError}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-muted-foreground hover:text-foreground underline"
        >
          {locale === 'ru' ? 'Обновить страницу' : 'Refresh page'}
        </button>
      </div>
    );
  }

  // Empty state
  if (!data) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        {t?.noActivity?.[locale] || 'No data available'}
      </div>
    );
  }

  const isHeavy = isHeavyPayload(data.fileSize);

  return (
    <div className="grid grid-cols-5 gap-4 p-4">
      {/* ============================================================
          Card A: File DNA (Left, 40% = 2/5 columns)
          ============================================================ */}
      <Card className="col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t?.fileDNA?.[locale] || 'File DNA'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File Icon and Name */}
          <div className="flex items-start gap-3">
            {getFileIcon(data.mimeType)}
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-base truncate" title={data.originalFilename}>
                {data.originalFilename || 'Unknown file'}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">{data.mimeType}</p>
            </div>
          </div>

          {/* File Size with Heavy Payload Badge */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t?.fileSize?.[locale] || 'Size'}:
            </span>
            <span className="text-sm font-medium">
              {formatFileSize(data.fileSize || 0)}
            </span>
            {isHeavy && (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="bg-yellow-50 text-yellow-600 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800 cursor-help"
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {t?.heavyPayload?.[locale] || 'Heavy Payload'}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t?.heavyPayloadHint?.[locale] || 'Processing may take longer'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {/* Page Count (if available) */}
          {data.pageCount !== undefined && data.pageCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {t?.pageCount?.[locale] || 'Pages'}:
              </span>
              <span className="text-sm font-medium">{data.pageCount}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================================
          Card B: Intelligence Tier (Right, 60% = 3/5 columns)
          ============================================================ */}
      <Card className="col-span-3">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t?.tierCapabilities?.[locale] || 'Processing Capabilities'}
            </CardTitle>
            <Badge className={cn('border', TIER_COLORS[data.tier || 'basic'])}>
              {tierLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <TierFeaturesList features={tierFeatures} locale={locale} />
        </CardContent>
      </Card>

      {/* ============================================================
          Card C: Metadata (Bottom, Full Width = 5/5 columns)
          ============================================================ */}
      <Card className="col-span-5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t?.metadata?.[locale] || 'Metadata'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {/* Uploaded By */}
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <span className="text-xs text-muted-foreground block">
                  {t?.uploadedBy?.[locale] || 'Uploaded by'}
                </span>
                <span className="text-sm font-medium truncate block">
                  {locale === 'ru' ? 'Система' : 'System'}
                </span>
              </div>
            </div>

            {/* Organization */}
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <span className="text-xs text-muted-foreground block">
                  {t?.organization?.[locale] || 'Organization'}
                </span>
                <span className="text-sm font-medium truncate block" title={data.organizationId}>
                  {data.organizationId
                    ? data.organizationId.slice(0, 8) + '...'
                    : '-'}
                </span>
              </div>
            </div>

            {/* Pipeline ID */}
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <span className="text-xs text-muted-foreground block">
                  {t?.pipelineId?.[locale] || 'Pipeline ID'}
                </span>
                <span
                  className="text-sm font-mono text-muted-foreground truncate block"
                  title={data.fileId}
                >
                  {data.fileId ? data.fileId.slice(0, 8) + '...' : '-'}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

export default Stage2InputTab;
