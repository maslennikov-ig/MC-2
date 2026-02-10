'use client'

import React from 'react'
import { TabsContent } from '@/components/ui/tabs'
import type { UserProfile } from './profile-utils'
import type { UserPreferences as UserPrefs } from '@/lib/user-preferences'
import { TabContentRenderer } from './TabContentRenderer'

interface ProfileContentProps {
  profile: UserProfile | (UserProfile & UserPrefs)
  activeTab: string
  tabs: Array<{
    value: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    description: string
  }>
  isMobile?: boolean
  updateProfile: (updates: Partial<UserProfile & UserPrefs>) => Promise<void>
  handleAvatarUpload: (files: File[]) => Promise<void>
  uploadProgress: number
  isSaving: boolean
  exportUserData: () => void
  deleteAccount: () => Promise<void>
}

export const ProfileContent = React.memo(function ProfileContent({
  profile,
  activeTab,
  tabs,
  isMobile = false,
  updateProfile,
  handleAvatarUpload,
  uploadProgress,
  isSaving,
  exportUserData,
  deleteAccount,
}: ProfileContentProps) {
  if (!isMobile) {
    // Desktop: Direct content rendering
    const currentTab = tabs.find((t) => t.value === activeTab)

    return (
      <section
        role="tabpanel"
        id={`${activeTab}-panel`}
        aria-labelledby={`desktop-${activeTab}-tab`}
        tabIndex={0}
      >
        <div className="animate-tabFadeIn mb-6">
          <h2 className="flex items-center gap-3 text-2xl font-bold" id="section-heading">
            {currentTab && (
              <>
                <currentTab.icon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                <span className="gradient-text">{currentTab.label}</span>
              </>
            )}
          </h2>
          <p className="text-muted-foreground mt-1">{currentTab?.description}</p>
        </div>

        <div className="animate-tabSlideIn space-y-6">
          <TabContentRenderer
            tabValue={activeTab}
            profile={profile}
            updateProfile={updateProfile}
            handleAvatarUpload={handleAvatarUpload}
            uploadProgress={uploadProgress}
            isSaving={isSaving}
            exportUserData={exportUserData}
            deleteAccount={deleteAccount}
          />
        </div>
      </section>
    )
  }

  // Mobile: Tabs content
  return (
    <>
      {tabs.map(
        (tab: {
          value: string
          label: string
          icon: React.ComponentType<{ className?: string }>
          description: string
        }) => (
          <TabsContent key={tab.value} value={tab.value} className="animate-tabSlideIn mt-0">
            <div className="animate-tabSlideIn space-y-6">
              <TabContentRenderer
                tabValue={tab.value}
                profile={profile}
                updateProfile={updateProfile}
                handleAvatarUpload={handleAvatarUpload}
                uploadProgress={uploadProgress}
                isSaving={isSaving}
                exportUserData={exportUserData}
                deleteAccount={deleteAccount}
              />
            </div>
          </TabsContent>
        )
      )}
    </>
  )
})
