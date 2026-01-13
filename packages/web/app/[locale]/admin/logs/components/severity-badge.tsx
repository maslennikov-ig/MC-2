'use client'

import { useTranslations } from 'next-intl'
import { AlertTriangle, XCircle, AlertOctagon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface SeverityBadgeProps {
  severity: string
}

/**
 * Displays a styled badge for log severity levels
 */
export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const t = useTranslations('admin.logs')

  switch (severity) {
    case 'CRITICAL':
      return (
        <Badge
          variant="destructive"
          className="gap-1 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
        >
          <AlertOctagon className="h-3 w-3" />
          {t('levels.CRITICAL')}
        </Badge>
      )
    case 'ERROR':
      return (
        <Badge
          variant="destructive"
          className="gap-1 bg-orange-600 hover:bg-orange-700 dark:bg-orange-700 dark:hover:bg-orange-800"
        >
          <XCircle className="h-3 w-3" />
          {t('levels.ERROR')}
        </Badge>
      )
    case 'WARNING':
      return (
        <Badge
          variant="secondary"
          className="gap-1 bg-yellow-500/20 text-yellow-700 hover:bg-yellow-500/30 dark:bg-yellow-500/20 dark:text-yellow-400 dark:hover:bg-yellow-500/30"
        >
          <AlertTriangle className="h-3 w-3" />
          {t('levels.WARNING')}
        </Badge>
      )
    default:
      return <Badge variant="secondary">{severity}</Badge>
  }
}
