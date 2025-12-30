"use client"

import React from "react"
import Link from "next/link"
import { Share2 } from "lucide-react"
import { useTranslations } from "next-intl"

export function SharedCourseBanner() {
  const t = useTranslations('common.sharedCourse')

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Share2 className="h-5 w-5 text-blue-600 dark:text-blue-400 mr-2 flex-shrink-0" />
            <p className="text-sm text-blue-800 dark:text-blue-200">
              {t('message')}
              <Link
                href="/auth/login"
                className="ml-1 underline font-medium hover:text-blue-900 dark:hover:text-blue-100 transition-colors"
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
