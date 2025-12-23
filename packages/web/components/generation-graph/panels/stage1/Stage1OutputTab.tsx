'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Copy,
  Check,
  FolderOpen,
  FileText,
  Cloud,
  ArrowRight,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { ru as ruLocale } from 'date-fns/locale';
import { toast } from 'sonner';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import { Stage1OutputTabProps, Stage1OutputData, StoragePath } from './types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Stage 1 translation keys used in this component
 */
type Stage1TranslationKey =
  | 'coursePassport'
  | 'courseId'
  | 'owner'
  | 'createdAt'
  | 'status'
  | 'readyForStage2'
  | 'initializationError'
  | 'copied'
  | 'copyToClipboard'
  | 'copyFailed'
  | 'dateUnknown'
  | 'outputEmptyState'
  | 'assetMap'
  | 'noAssets'
  | 'nextStep'
  | 'documentClassification'
  | 'deepAnalysis';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Extract filename from storage path
 */
function extractFilename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/**
 * Get translation helper with safe fallback
 */
function getTranslation(key: Stage1TranslationKey, locale: 'ru' | 'en'): string {
  const translations = GRAPH_TRANSLATIONS.stage1;
  if (!translations) return key;
  const entry = translations[key];
  if (!entry) return key;
  return entry[locale] || key;
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

interface CopyButtonProps {
  text: string;
  id: string;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  ariaLabelCopied: string;
  ariaLabelCopy: string;
}

/**
 * Copy to clipboard button with success state
 */
const CopyButton: React.FC<CopyButtonProps> = ({ text, id, copiedId, onCopy, ariaLabelCopied, ariaLabelCopy }) => {
  const isCopied = copiedId === id;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isCopied ? ariaLabelCopied : ariaLabelCopy}
      className={cn(
        'h-6 w-6 transition-all duration-200',
        isCopied && 'text-green-600 dark:text-green-400'
      )}
      onClick={() => onCopy(text, id)}
    >
      {isCopied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  );
};

interface MonoValueProps {
  label: string;
  value: string;
  id: string;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  ariaLabelCopied: string;
  ariaLabelCopy: string;
}

/**
 * Monospace value with copy button and truncation
 */
const MonoValue: React.FC<MonoValueProps> = ({ label, value, id, copiedId, onCopy, ariaLabelCopied, ariaLabelCopy }) => (
  <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
      {label}
    </span>
    <div className="flex items-center gap-1.5">
      <span
        className="font-mono text-xs text-slate-700 dark:text-slate-300 max-w-[180px] truncate"
        title={value}
      >
        {value}
      </span>
      <CopyButton text={value} id={id} copiedId={copiedId} onCopy={onCopy} ariaLabelCopied={ariaLabelCopied} ariaLabelCopy={ariaLabelCopy} />
    </div>
  </div>
);

interface FileTreeItemProps {
  storagePath: StoragePath;
  isLast: boolean;
}

/**
 * Single file item in the tree
 */
const FileTreeItem: React.FC<FileTreeItemProps> = ({ storagePath, isLast }) => {
  const filename = extractFilename(storagePath.path);
  const fileSize = storagePath.size ? formatFileSize(storagePath.size) : null;

  return (
    <div className="flex items-center gap-2 pl-8 py-1 text-sm text-slate-600 dark:text-slate-400">
      <span className="text-slate-300 dark:text-slate-600 select-none">
        {isLast ? '└──' : '├──'}
      </span>
      <FileText className="h-4 w-4 flex-shrink-0 text-blue-500 dark:text-blue-400" />
      <span className="truncate flex-1" title={filename}>
        {filename}
      </span>
      {fileSize && (
        <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">
          ({fileSize})
        </span>
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const Stage1OutputTab = memo<Stage1OutputTabProps>(function Stage1OutputTab({
  outputData,
  courseId: _courseId, // Available for future use (e.g., linking to course page)
  locale = 'ru',
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Type guard and data extraction
  const data = outputData as Stage1OutputData | undefined;

  // Translation helper
  const t = useCallback(
    (key: Stage1TranslationKey) => getTranslation(key, locale),
    [locale]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  // Copy handler with race condition fix
  const handleCopy = useCallback(
    async (text: string, id: string) => {
      try {
        // Clear any existing timeout to prevent race condition
        if (copyTimeoutRef.current) {
          clearTimeout(copyTimeoutRef.current);
        }

        await navigator.clipboard.writeText(text);
        setCopiedId(id);
        toast.success(t('copied'));

        copyTimeoutRef.current = setTimeout(() => {
          setCopiedId(null);
          copyTimeoutRef.current = null;
        }, 2000);
      } catch {
        toast.error(t('copyFailed'));
      }
    },
    [t]
  );

  // Format timestamp
  const formattedDate = useMemo(() => {
    if (!data?.createdAt) return null;
    try {
      return format(
        new Date(data.createdAt),
        'dd MMM yyyy, HH:mm',
        locale === 'ru' ? { locale: ruLocale } : undefined
      );
    } catch {
      // User-friendly fallback using translations
      return getTranslation('dateUnknown', locale);
    }
  }, [data?.createdAt, locale]);

  // Build file tree structure
  const fileTree = useMemo(() => {
    if (!data?.storagePaths?.length) return null;

    // Extract course ID from first path for display
    const firstPath = data.storagePaths[0]?.path || '';
    const courseMatch = firstPath.match(/course_([^/]+)/);
    const courseFolder = courseMatch ? `course_${courseMatch[1]}` : `course_${data.courseId?.slice(0, 8)}`;

    return {
      rootFolder: 'cloud-storage/',
      courseFolder,
      sourceFolder: 'source/',
      files: data.storagePaths,
    };
  }, [data?.storagePaths, data?.courseId]);

  // Determine next step
  const hasFiles = data?.storagePaths && data.storagePaths.length > 0;

  // ============================================================================
  // EMPTY STATE
  // ============================================================================

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
          <Cloud className="h-6 w-6 text-slate-400 dark:text-slate-500" />
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-[240px]">
          {t('outputEmptyState')}
        </p>
      </div>
    );
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-4 p-1">
      {/* Section A: Course Passport Card */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <FileText className="h-3.5 w-3.5 text-white" />
            </div>
            {t('coursePassport')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <div className="space-y-0">
            <MonoValue
              label={t('courseId')}
              value={data.courseId}
              id="courseId"
              copiedId={copiedId}
              onCopy={handleCopy}
              ariaLabelCopied={t('copied')}
              ariaLabelCopy={t('copyToClipboard')}
            />
            <MonoValue
              label={t('owner')}
              value={data.ownerId}
              id="ownerId"
              copiedId={copiedId}
              onCopy={handleCopy}
              ariaLabelCopied={t('copied')}
              ariaLabelCopy={t('copyToClipboard')}
            />
            <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('createdAt')}
              </span>
              <span className="text-xs text-slate-700 dark:text-slate-300">
                {formattedDate}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('status')}
              </span>
              {data.status === 'ready' ? (
                <Badge
                  className={cn(
                    'text-xs font-medium',
                    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                    'border-green-200 dark:border-green-800'
                  )}
                >
                  <Check className="h-3 w-3 mr-1" />
                  {t('readyForStage2')}
                </Badge>
              ) : (
                <Badge
                  variant="destructive"
                  className="text-xs font-medium"
                >
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {t('initializationError')}
                </Badge>
              )}
            </div>
            {data.status === 'error' && data.errorMessage && (
              <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30">
                <p className="text-xs text-red-600 dark:text-red-400">
                  {data.errorMessage}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section B: Asset Map (Tree View) */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <FolderOpen className="h-3.5 w-3.5 text-white" />
            </div>
            {t('assetMap')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {fileTree ? (
            <div className="font-mono text-sm">
              {/* Root: cloud-storage/ */}
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <Cloud className="h-4 w-4 text-slate-400" />
                <span>{fileTree.rootFolder}</span>
              </div>

              {/* Course folder */}
              <div className="flex items-center gap-2 pl-4 text-slate-600 dark:text-slate-400">
                <span className="text-slate-300 dark:text-slate-600 select-none">└──</span>
                <FolderOpen className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                <span>{fileTree.courseFolder}/</span>
              </div>

              {/* Source folder */}
              <div className="flex items-center gap-2 pl-8 text-slate-600 dark:text-slate-400">
                <span className="text-slate-300 dark:text-slate-600 select-none">└──</span>
                <FolderOpen className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                <span>{fileTree.sourceFolder}</span>
              </div>

              {/* Files */}
              <div className="pl-4">
                {fileTree.files.map((storagePath, index) => (
                  <FileTreeItem
                    key={storagePath.fileId}
                    storagePath={storagePath}
                    isLast={index === fileTree.files.length - 1}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                <FolderOpen className="h-5 w-5 text-slate-400 dark:text-slate-500" />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('noAssets')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section C: Next Step Indicator */}
      <Card className="overflow-hidden bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-slate-200 dark:border-slate-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <ChevronRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t('nextStep')}
                </span>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {hasFiles ? t('documentClassification') : t('deepAnalysis')}
                </p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-slate-400 dark:text-slate-500 animate-pulse" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

export default Stage1OutputTab;
