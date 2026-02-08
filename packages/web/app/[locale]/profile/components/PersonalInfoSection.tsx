'use client'

import { useState, memo, useMemo } from 'react'
import Image from 'next/image'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useDropzone } from 'react-dropzone'
import { useTranslations } from 'next-intl'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { Camera, Loader2, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createPersonalInfoSchema, type PersonalInfoFormData } from '../validation-schemas'
import type { UserProfile } from '../page'
import type { UserPreferences } from '@/lib/user-preferences'

interface PersonalInfoSectionProps {
  profile: UserProfile | (UserProfile & UserPreferences)
  onUpdate: (updates: Partial<UserProfile & UserPreferences>) => Promise<void>
  onAvatarUpload: (files: File[]) => Promise<void>
  uploadProgress: number
  isSaving: boolean
}

const PersonalInfoSection = memo(function PersonalInfoSection({
  profile,
  onUpdate,
  onAvatarUpload,
  uploadProgress,
  isSaving,
}: PersonalInfoSectionProps) {
  const t = useTranslations('profile')
  const [isEditing, setIsEditing] = useState(false)

  const personalInfoSchema = useMemo(
    () => createPersonalInfoSchema((key: string) => t(key as never)),
    [t]
  )

  const form = useForm<PersonalInfoFormData>({
    resolver: zodResolver(personalInfoSchema),
    defaultValues: {
      full_name: profile.full_name || '',
      bio: profile.bio || '',
    },
  })

  const onSubmit = async (data: PersonalInfoFormData) => {
    await onUpdate(data)
    setIsEditing(false)
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files: File[]) => void onAvatarUpload(files),
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
    },
    maxSize: 5 * 1024 * 1024,
    multiple: false,
  })

  const initials =
    profile.full_name
      ?.split(' ')
      ?.map((n: string) => n[0])
      ?.join('')
      ?.toUpperCase() ||
    profile.email?.split('@')[0]?.slice(0, 2)?.toUpperCase() ||
    'U'

  return (
    <div className="space-y-6">
      {/* Avatar Upload Card with optimized image loading */}
      <Card className="bg-card rounded-xl border p-6 shadow-sm transition-shadow duration-300 hover:shadow-lg">
        <h3 className="text-foreground mb-4 text-lg font-semibold">
          {t('personalInfo.photoTitle')}
        </h3>
        <div className="flex items-center gap-6">
          <div
            {...getRootProps()}
            className={cn('group relative cursor-pointer', isDragActive && 'scale-105')}
          >
            <input
              {...getInputProps()}
              accept="image/png,image/jpeg,image/jpg,image/webp"
              aria-label={t('avatar.uploadLabel')}
            />
            <div className="avatar-ring h-24 w-24 transition-transform duration-300 group-hover:scale-105">
              <div className="bg-background relative flex h-full w-full items-center justify-center overflow-hidden rounded-full">
                {profile.avatar_url ? (
                  <div className="relative h-full w-full">
                    <Image
                      src={profile.avatar_url}
                      alt={profile.full_name || t('header.defaultName')}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-110"
                      sizes="96px"
                      priority={false}
                      loading="lazy"
                      placeholder="blur"
                      blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwABmX/9k="
                    />
                  </div>
                ) : (
                  <span className="gradient-text text-2xl font-semibold">{initials}</span>
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <Camera className="h-6 w-6 text-white" />
                </div>
                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/70">
                    <Loader2 className="mb-1 h-6 w-6 animate-spin text-white" />
                    <div className="text-xs font-medium text-white">{uploadProgress}%</div>
                    <div className="absolute inset-0 overflow-hidden rounded-full">
                      <div
                        className="bg-primary/30 absolute right-0 bottom-0 left-0 transition-all duration-300"
                        style={{ height: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            {isDragActive && (
              <div className="border-primary absolute inset-0 animate-pulse rounded-full border-2 border-dashed" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-muted-foreground mb-2 text-sm">{t('personalInfo.dragDrop')}</p>
            <p className="text-muted-foreground text-xs">{t('personalInfo.supportedFormats')}</p>
          </div>
        </div>
      </Card>

      {/* Personal Info Form */}
      <Card
        className="bg-card rounded-xl border p-6 shadow-sm transition-shadow duration-300 hover:shadow-lg"
        role="region"
        aria-labelledby="personal-info-heading"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id="personal-info-heading" className="text-foreground text-lg font-semibold">
            {t('personalInfo.mainInfoTitle')}
          </h3>
          {!isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="hover:bg-accent focus-visible:ring-ring transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              aria-label={t('personalInfo.editAriaLabel')}
            >
              {t('personalInfo.edit')}
            </Button>
          )}
        </div>

        {isEditing ? (
          <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="space-y-4">
            <FormField
              label={t('personalInfo.fullName')}
              error={form.formState.errors.full_name?.message}
            >
              <Input
                {...form.register('full_name')}
                placeholder={t('personalInfo.fullNamePlaceholder')}
                id="full_name"
                aria-required="true"
                aria-invalid={!!form.formState.errors.full_name}
                aria-describedby={form.formState.errors.full_name ? 'full_name_error' : undefined}
              />
              {form.formState.errors.full_name && (
                <span id="full_name_error" className="sr-only" role="alert">
                  {form.formState.errors.full_name.message}
                </span>
              )}
            </FormField>

            <FormField
              label={t('personalInfo.bio')}
              description={t('personalInfo.bioCharCount', {
                count: form.watch('bio')?.length || 0,
              })}
              error={form.formState.errors.bio?.message}
            >
              <Textarea
                {...form.register('bio')}
                placeholder={t('personalInfo.bioPlaceholder')}
                rows={4}
                maxLength={500}
                id="bio"
                aria-describedby="bio_description bio_error"
                aria-invalid={!!form.formState.errors.bio}
              />
              <span id="bio_description" className="sr-only">
                {t('personalInfo.bioAriaDescription', { count: form.watch('bio')?.length || 0 })}
              </span>
              {form.formState.errors.bio && (
                <span id="bio_error" className="sr-only" role="alert">
                  {form.formState.errors.bio.message}
                </span>
              )}
            </FormField>

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={isSaving}
                className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                aria-busy={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('personalInfo.saving')}
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    {t('personalInfo.save')}
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="hover:bg-accent focus-visible:ring-ring transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                onClick={() => {
                  setIsEditing(false)
                  form.reset()
                }}
              >
                {t('personalInfo.cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="group">
              <label className="text-muted-foreground group-hover:text-primary text-sm font-medium transition-colors duration-300">
                {t('personalInfo.fullName')}
              </label>
              <p className="text-foreground mt-1 transition-transform duration-300 group-hover:translate-x-1">
                {profile.full_name || t('personalInfo.notSpecified')}
              </p>
            </div>
            <div className="group">
              <label className="text-muted-foreground group-hover:text-primary text-sm font-medium transition-colors duration-300">
                {t('personalInfo.email')}
              </label>
              <p className="text-foreground mt-1 transition-transform duration-300 group-hover:translate-x-1">
                {profile.email}
              </p>
            </div>
            <div className="group">
              <label className="text-muted-foreground group-hover:text-primary text-sm font-medium transition-colors duration-300">
                {t('personalInfo.bio')}
              </label>
              <p className="text-muted-foreground mt-1 transition-all duration-300 group-hover:translate-x-1">
                {profile.bio || t('personalInfo.bioPlaceholder')}
              </p>
            </div>
            <div className="group">
              <label className="text-muted-foreground group-hover:text-primary text-sm font-medium transition-colors duration-300">
                {t('personalInfo.registrationDate')}
              </label>
              <p className="text-foreground mt-1 transition-transform duration-300 group-hover:translate-x-1">
                {profile.created_at
                  ? new Date(profile.created_at).toLocaleDateString('ru-RU', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : t('personalInfo.notSpecified')}
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
})

export default PersonalInfoSection
