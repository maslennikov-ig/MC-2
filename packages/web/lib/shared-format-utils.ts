/**
 * Client-safe utilities copied from @megacampus/shared-utils.
 *
 * These are pure functions with zero Node.js dependencies, safe for 'use client' components.
 * The barrel export of @megacampus/shared-utils pulls in jsdom/tiktoken which break
 * webpack client bundles. Until shared-utils supports sub-path exports, we keep
 * client-safe copies here.
 *
 * Source: packages/shared-utils/src/format.ts, packages/shared-utils/src/document-display-name.ts
 */

// === format.ts ===

const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60

const BYTES_PER_KB = 1024
const BYTES_PER_MB = BYTES_PER_KB * 1024
const BYTES_PER_GB = BYTES_PER_MB * 1024

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms) || ms < 0) return ''

  if (ms < MS_PER_SECOND) {
    return `${Math.round(ms)}ms`
  }

  const seconds = Math.floor(ms / MS_PER_SECOND)
  if (seconds < SECONDS_PER_MINUTE) {
    return `${(ms / MS_PER_SECOND).toFixed(1)}s`
  }

  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE)
  const remainingSeconds = seconds % SECONDS_PER_MINUTE
  if (minutes < MINUTES_PER_HOUR) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
  }

  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  const remainingMinutes = minutes % MINUTES_PER_HOUR
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

export function formatNumber(num: number): string {
  if (!Number.isFinite(num) || num < 0) return '0'
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toString()
}

export function formatFileSize(bytes: number | undefined, fallback: string = '0 B'): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return fallback
  if (bytes === 0) return '0 B'
  if (bytes < BYTES_PER_KB) return `${bytes} B`
  if (bytes < BYTES_PER_MB) return `${(bytes / BYTES_PER_KB).toFixed(1)} KB`
  if (bytes < BYTES_PER_GB) return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`
  return `${(bytes / BYTES_PER_GB).toFixed(1)} GB`
}

// === document-display-name.ts ===

export interface DocumentNameFields {
  generated_title?: string | null
  generatedTitle?: string | null
  original_name?: string | null
  originalName?: string | null
  filename?: string | null
}

export function getDocumentDisplayName(
  doc: DocumentNameFields | null | undefined,
  fallback: string = 'Документ'
): string {
  if (!doc) return fallback

  const generatedTitle = doc.generated_title ?? doc.generatedTitle
  if (generatedTitle && typeof generatedTitle === 'string' && generatedTitle.trim()) {
    return generatedTitle.trim()
  }

  const originalName = doc.original_name ?? doc.originalName
  if (originalName && typeof originalName === 'string' && originalName.trim()) {
    return originalName.trim()
  }

  if (doc.filename && typeof doc.filename === 'string' && doc.filename.trim()) {
    return doc.filename.trim()
  }

  return fallback
}

export function hasHumanReadableName(doc: DocumentNameFields | null | undefined): boolean {
  if (!doc) return false

  const generatedTitle = doc.generated_title ?? doc.generatedTitle
  if (generatedTitle && typeof generatedTitle === 'string' && generatedTitle.trim()) {
    return true
  }

  const originalName = doc.original_name ?? doc.originalName
  if (originalName && typeof originalName === 'string' && originalName.trim()) {
    return true
  }

  return false
}

export function truncateDisplayName(name: string, maxLength: number = 50): string {
  if (!name || name.length <= maxLength) return name
  return name.slice(0, maxLength - 3) + '...'
}
