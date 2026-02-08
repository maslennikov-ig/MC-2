'use client'

import React from 'react'
import Link from 'next/link'
import { Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

export function SharedCourseBanner() {
  const t = useTranslations('common.sharedCourse')

  return (
    <div className="border-b border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20">
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Share2 className="mr-2 h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
            <p className="text-sm text-blue-800 dark:text-blue-200">
              {t('message')}
              <Link
                href="/auth/login"
                className="ml-1 font-medium underline transition-colors hover:text-blue-900 dark:hover:text-blue-100"
              >
                {t('signInLink')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
