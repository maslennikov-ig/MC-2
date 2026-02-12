'use client'

import React from 'react'
import type { UserProfile } from './profile-utils'
import type { UserPreferences as UserPrefs } from '@/lib/user-preferences'
import PersonalInfoSection from '../components/PersonalInfoSection'
import AccountSettingsSection from '../components/AccountSettingsSection'
import LearningPreferencesSection from '../components/LearningPreferencesSection'
import StatisticsSection from '../components/StatisticsSection'

interface TabContentRendererProps {
  tabValue: string
  profile: UserProfile | (UserProfile & UserPrefs)
  updateProfile: (updates: Partial<UserProfile & UserPrefs>) => Promise<void>
  handleAvatarUpload: (files: File[]) => Promise<void>
  uploadProgress: number
  isSaving: boolean
  exportUserData: () => void
  deleteAccount: () => Promise<void>
}

export const TabContentRenderer = React.memo(function TabContentRenderer({
  tabValue,
  profile,
  updateProfile,
  handleAvatarUpload,
  uploadProgress,
  isSaving,
  exportUserData,
  deleteAccount,
}: TabContentRendererProps) {
  const renderContent = React.useCallback(() => {
    switch (tabValue) {
      case 'personal':
        return (
          <PersonalInfoSection
            profile={profile}
            onUpdate={updateProfile}
            onAvatarUpload={handleAvatarUpload}
            uploadProgress={uploadProgress}
            isSaving={isSaving}
          />
        )
      case 'settings':
        return (
          <AccountSettingsSection
            profile={profile}
            onUpdate={updateProfile}
            isSaving={isSaving}
            onExportData={exportUserData}
            onDeleteAccount={deleteAccount}
          />
        )
      case 'learning':
        return <LearningPreferencesSection profile={profile} onUpdate={updateProfile} />
      case 'statistics':
        return <StatisticsSection profile={profile} />
      default:
        return null
    }
  }, [
    tabValue,
    profile,
    updateProfile,
    handleAvatarUpload,
    uploadProgress,
    isSaving,
    exportUserData,
    deleteAccount,
  ])

  return <>{renderContent()}</>
})
