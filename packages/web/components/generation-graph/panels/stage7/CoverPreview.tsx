'use client';

import React from 'react';
import { useLocale } from 'next-intl';
import Image from 'next/image';
import { ImageIcon, FileText, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { EnrichmentStatus } from '@megacampus/shared-types';

/**
 * Cover content structure from CoverEnrichmentContent
 */
interface CoverContent {
  type: 'cover';
  image_url: string;
  width: number;
  height: number;
  aspect_ratio?: string;
  generation_prompt: string;
  alt_text?: string;
  format?: 'png' | 'jpeg' | 'webp';
  file_size_bytes?: number;
}

export interface CoverPreviewProps {
  enrichment: {
    id: string;
    status: EnrichmentStatus;
    content: CoverContent | null;
    metadata: Record<string, unknown> | null;
    error_message: string | null;
  };
  className?: string;
}

/**
 * Format file size for display
 */
function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * CoverPreview Component
 *
 * Displays generated cover image with metadata.
 * Shows image preview, dimensions, and generation prompt.
 */
export function CoverPreview({ enrichment, className }: CoverPreviewProps) {
  const locale = useLocale();
  const content = enrichment.content;

  if (!content) {
    return (
      <div className={cn('flex items-center justify-center h-full p-8', className)}>
        <div className="text-center text-muted-foreground">
          <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>{locale === 'ru' ? 'Обложка не сгенерирована' : 'Cover not generated'}</p>
        </div>
      </div>
    );
  }

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = content.image_url;
    link.download = `cover.${content.format || 'png'}`;
    link.target = '_blank';
    link.click();
  };

  return (
    <div className={cn('flex flex-col h-full overflow-auto', className)}>
      {/* Image Preview */}
      <div className="relative bg-slate-100 dark:bg-slate-800">
        <div className="aspect-video relative">
          <Image
            src={content.image_url}
            alt={content.alt_text || 'Lesson cover'}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 600px"
            priority
            unoptimized
          />
        </div>

        {/* Download button overlay */}
        <Button
          variant="secondary"
          size="sm"
          className="absolute bottom-3 right-3 gap-2"
          onClick={handleDownload}
        >
          <Download className="w-4 h-4" />
          {locale === 'ru' ? 'Скачать' : 'Download'}
        </Button>
      </div>

      {/* Metadata */}
      <div className="p-4 space-y-4">
        {/* Dimensions and format */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {content.width} x {content.height}
          </Badge>
          {content.aspect_ratio && (
            <Badge variant="outline">{content.aspect_ratio}</Badge>
          )}
          {content.format && (
            <Badge variant="outline">{content.format.toUpperCase()}</Badge>
          )}
          {content.file_size_bytes && (
            <Badge variant="outline">{formatFileSize(content.file_size_bytes)}</Badge>
          )}
        </div>

        {/* Generation prompt */}
        <div>
          <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
            <FileText className="w-4 h-4" />
            {locale === 'ru' ? 'Промпт генерации' : 'Generation Prompt'}
          </div>
          <p className="text-sm bg-slate-50 dark:bg-slate-900 rounded-lg p-3 whitespace-pre-wrap">
            {content.generation_prompt}
          </p>
        </div>
      </div>
    </div>
  );
}

export default CoverPreview;
