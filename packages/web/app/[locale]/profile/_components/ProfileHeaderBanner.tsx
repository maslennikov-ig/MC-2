'use client'

import React from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import type { UserProfile } from './profile-utils'
import type { UserPreferences as UserPrefs } from '@/lib/user-preferences'

interface ProfileHeaderBannerProps {
  profile: UserProfile | (UserProfile & UserPrefs)
}

export const ProfileHeaderBanner = React.memo(function ProfileHeaderBanner({
  profile,
}: ProfileHeaderBannerProps) {
  const t = useTranslations('profile')
  const roleLabel =
    profile.role === 'superadmin'
      ? t('roles.superadmin')
      : profile.role === 'admin'
        ? t('roles.admin')
        : t('roles.student')
  const initials =
    profile.full_name
      ?.split(' ')
      ?.map((n) => n[0])
      ?.join('')
      ?.toUpperCase() ||
    profile.email?.split('@')[0]?.slice(0, 2)?.toUpperCase() ||
    'U'

  return (
    <div className="flex items-center gap-4" role="banner" aria-label={t('navigation.userInfo')}>
      <div className="group relative">
        <div className="avatar-ring h-16 w-16">
          <div className="bg-background flex h-full w-full items-center justify-center overflow-hidden rounded-full">
            {profile.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt={t('header.avatarAlt', {
                  name: (profile.full_name || profile.email) as string,
                })}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                fill
                sizes="64px"
                priority={false}
              />
            ) : (
              <span
                className="gradient-text text-xl font-semibold"
                aria-label={t('header.initialsLabel', { initials })}
              >
                {initials}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="gradient-text truncate text-lg font-semibold" id="profile-heading">
          {profile.full_name || t('header.defaultName')}
        </h1>
        <p className="text-muted-foreground truncate text-sm">{profile.email}</p>
        {profile.role && profile.role !== 'student' && (
          <span
            className="gradient-badge text-primary mt-1 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-all duration-300 hover:shadow-lg"
            role="status"
            aria-label={t('header.roleLabel', { role: roleLabel })}
          >
            {profile.role === 'superadmin' ? t('roles.superadminShort') : t('roles.adminShort')}
          </span>
        )}
      </div>
    </div>
  )
})
