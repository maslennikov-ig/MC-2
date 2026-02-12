'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { UserProfile } from './profile-utils'
import type { UserPreferences as UserPrefs } from '@/lib/user-preferences'
import { ProfileHeaderBanner } from './ProfileHeaderBanner'

interface ProfileSidebarProps {
  profile: UserProfile | (UserProfile & UserPrefs)
  activeTab: string
  onTabChange: (value: string) => void
  tabs: Array<{
    value: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    description: string
  }>
}

export const ProfileSidebar = React.memo(function ProfileSidebar({
  profile,
  activeTab,
  onTabChange,
  tabs,
}: ProfileSidebarProps) {
  const t = useTranslations('profile')

  return (
    <aside className="w-80 border-r" role="navigation" aria-label={t('navigation.profileNav')}>
      <div className="sticky top-0 h-screen overflow-y-auto">
        {/* Profile Header with gradient accent */}
        <div className="relative overflow-hidden border-b p-6">
          <div className="gradient-subtle absolute inset-0" />
          <div className="relative z-10">
            <ProfileHeaderBanner profile={profile} />
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4" aria-label={t('navigation.mainProfileNav')}>
          <ul className="space-y-2">
            {tabs.map((tab) => (
              <li key={tab.value}>
                <button
                  onClick={() => onTabChange(tab.value)}
                  role="tab"
                  aria-selected={activeTab === tab.value}
                  aria-controls={`${tab.value}-panel`}
                  id={`desktop-${tab.value}-tab`}
                  tabIndex={activeTab === tab.value ? 0 : -1}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left',
                    'transition-all duration-200 ease-in-out',
                    'tab-hover', // Add hover class for all tabs
                    activeTab === tab.value
                      ? 'tab-active'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <tab.icon className="h-5 w-5" />
                  <div className="flex-1">
                    <div className="font-medium">{tab.label}</div>
                    <div className="mt-0.5 text-xs opacity-75">{tab.description}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  )
})
